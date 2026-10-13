// electron/updater.js — updates through GitHub Releases.
//
// The app checks published releases and picks the installer for this OS/CPU.
// When the user chooses to update, it downloads that file inside the app,
// checks it against the release's SHA256SUMS.txt, and then (see
// update-install.js): an AppImage replaces itself and restarts, Windows runs
// the installer silently and reopens, and macOS / .deb get the file saved and
// shown for the last step (unsigned builds, or root needed). userData is
// never touched.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app, ipcMain, net, shell } from 'electron';
import { IS_DEV } from './constants.js';
import { getMainWindow } from './window.js';
import {
  isTrustedReleaseUrl,
  parseVersion,
  selectLatestRelease,
  selectReleaseAsset,
} from './update-policy.js';
import {
  WINDOWS_INSTALLER_ARGS,
  appImageStagingPath,
  canWriteNextTo,
  detectAppImage,
  downloadFile,
  installStrategy,
  parseChecksums,
  replaceAppImage,
  verifyChecksum,
} from './update-install.js';

const RELEASES_URL = 'https://github.com/asyncat-oss/asyncat-oss/releases';
const RELEASES_API_URL = 'https://api.github.com/repos/asyncat-oss/asyncat-oss/releases?per_page=20';

let initialized = false;
let currentUpdate = null;
let pendingCheck = null;
// Whether a check has finished. The first one runs while the app may still be
// on its loading screen, so the page asks for the result instead of relying
// on having heard the event.
let hasChecked = false;

const RECHECK_MS = 6 * 60 * 60 * 1000;

// The AppImage this app runs from (null for .deb, Windows, macOS, or an app
// that merely inherited another AppImage's environment).
const RUNNING_APPIMAGE = detectAppImage();

function toUpdateInfo(release) {
  const parsed = parseVersion(release.tag_name);
  const linuxPreference = process.platform === 'linux'
    ? (RUNNING_APPIMAGE ? '.AppImage' : '.deb')
    : null;
  const asset = selectReleaseAsset(release.assets, process.platform, process.arch, linuxPreference);
  const checksums = (release.assets || []).find((item) => item?.name === 'SHA256SUMS.txt');
  return {
    version: parsed.version,
    releaseDate: release.published_at || release.created_at || null,
    releaseNotes: release.body || '',
    releaseUrl: release.html_url || RELEASES_URL,
    assetName: asset?.name || null,
    assetUrl: asset?.browser_download_url || null,
    assetSize: asset?.size || null,
    checksumUrl: checksums?.browser_download_url || null,
    strategy: installStrategy({ platform: process.platform, appImagePath: RUNNING_APPIMAGE, assetName: asset?.name || null }),
    platform: process.platform,
    arch: process.arch,
  };
}

async function fetchPublishedReleases() {
  const response = await net.fetch(RELEASES_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Asyncat-Desktop/${app.getVersion()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const hint = remaining === '0' ? ' GitHub rate limit reached; try again later.' : '';
    throw new Error(`GitHub update check failed (${response.status}).${hint}`);
  }
  const releases = await response.json();
  if (!Array.isArray(releases)) throw new Error('GitHub returned an invalid releases response.');
  return releases;
}

async function checkForUpdates() {
  if (IS_DEV) return { success: false, error: 'Update checks are only available in packaged builds.' };
  if (pendingCheck) return pendingCheck;

  send('update:checking');
  pendingCheck = (async () => {
    try {
      const release = selectLatestRelease(await fetchPublishedReleases(), app.getVersion());
      hasChecked = true;
      if (!release) {
        currentUpdate = null;
        const info = { version: app.getVersion() };
        send('update:not-available', info);
        return { success: true, updateInfo: null };
      }

      currentUpdate = toUpdateInfo(release);
      send('update:available', currentUpdate);
      return { success: true, updateInfo: currentUpdate };
    } catch (error) {
      console.warn('[updater] check failed:', error.message);
      send('update:error', error.message);
      return { success: false, error: error.message };
    } finally {
      pendingCheck = null;
    }
  })();
  return pendingCheck;
}

async function openUpdateDownload() {
  const requestedUrl = currentUpdate?.assetUrl || currentUpdate?.releaseUrl || RELEASES_URL;
  const url = isTrustedReleaseUrl(requestedUrl) ? requestedUrl : RELEASES_URL;
  await shell.openExternal(url);
  return {
    success: true,
    opened: url,
    exactAsset: Boolean(currentUpdate?.assetUrl),
  };
}

// ── Downloading and installing ──────────────────────────────────────────────

let download = { status: 'idle' };
let downloadAbort = null;

function setDownload(next) {
  download = { ...download, ...next };
  send('update:download-state', download);
}

async function fetchChecksums(url) {
  if (!url || !isTrustedReleaseUrl(url)) return null;
  try {
    const response = await net.fetch(url);
    return response.ok ? parseChecksums(await response.text()) : null;
  } catch {
    return null;
  }
}

async function startUpdate() {
  const update = currentUpdate;
  if (!update) return { success: false, error: 'No update is available.' };
  if (download.status === 'downloading') return { success: true };
  if (update.strategy === 'browser' || !update.assetUrl || !isTrustedReleaseUrl(update.assetUrl)) {
    await openUpdateDownload();
    return { success: true, opened: true };
  }

  let strategy = update.strategy;
  let destination;
  if (strategy === 'replace-appimage' && canWriteNextTo(RUNNING_APPIMAGE)) {
    destination = appImageStagingPath(RUNNING_APPIMAGE);
  } else if (strategy === 'run-installer') {
    destination = path.join(app.getPath('temp'), 'asyncat-update', update.assetName);
  } else {
    // An AppImage in a folder we can't write to is updated like a .deb.
    strategy = 'open-installer';
    destination = path.join(app.getPath('downloads'), update.assetName);
  }

  downloadAbort = new AbortController();
  setDownload({ status: 'downloading', version: update.version, strategy, received: 0, total: update.assetSize || 0, file: null, error: null });
  (async () => {
    try {
      const [result, sums] = await Promise.all([
        downloadFile(update.assetUrl, destination, {
          fetchImpl: (url, options) => net.fetch(url, options),
          signal: downloadAbort.signal,
          onProgress: ({ received, total }) => setDownload({ received, total: total || download.total }),
        }),
        fetchChecksums(update.checksumUrl),
      ]);
      try {
        if (update.checksumUrl && !sums) throw new Error("Couldn't fetch the release's checksums to check the download. Try again.");
        verifyChecksum({ sums, assetName: update.assetName, sha256: result.sha256 });
      } catch (error) {
        fs.rmSync(destination, { force: true });
        throw error;
      }
      if (strategy === 'replace-appimage') replaceAppImage(destination, RUNNING_APPIMAGE);
      if (strategy === 'open-installer') shell.showItemInFolder(destination);
      setDownload({ status: 'ready', file: strategy === 'replace-appimage' ? RUNNING_APPIMAGE : destination });
    } catch (error) {
      console.warn('[updater] download failed:', error.message);
      setDownload({ status: error.cancelled ? 'idle' : 'error', error: error.cancelled ? null : error.message });
    } finally {
      downloadAbort = null;
    }
  })();
  return { success: true };
}

function cancelUpdate() {
  downloadAbort?.abort();
  return { success: true };
}

/** Finish an update that is ready: restart into it, or run the installer. */
async function finishUpdate() {
  if (download.status !== 'ready') return { success: false, error: 'The update has not finished downloading.' };
  if (download.strategy === 'replace-appimage') {
    app.relaunch({ execPath: RUNNING_APPIMAGE, args: process.argv.slice(1) });
    app.quit();
    return { success: true };
  }
  if (download.strategy === 'run-installer') {
    spawn(download.file, WINDOWS_INSTALLER_ARGS, { detached: true, stdio: 'ignore' }).unref();
    app.quit();
    return { success: true };
  }
  // macOS / .deb: open the installer for the user.
  const error = await shell.openPath(download.file);
  return error ? { success: false, error } : { success: true };
}

function showUpdateFile() {
  if (download.file) shell.showItemInFolder(download.file);
  return { success: Boolean(download.file) };
}

export function setupAutoUpdater() {
  if (IS_DEV || initialized) return;
  initialized = true;

  setTimeout(() => {
    checkForUpdates();
  }, 5000);
  // Asyncat often stays open in the tray for days; look again now and then.
  setInterval(() => {
    checkForUpdates();
  }, RECHECK_MS).unref?.();
}

export function setupUpdaterIPC() {
  ipcMain.handle('update:check', checkForUpdates);
  ipcMain.handle('update:get-state', () => ({ checked: hasChecked, updateInfo: currentUpdate, download, currentVersion: app.getVersion() }));
  ipcMain.handle('update:start', startUpdate);
  ipcMain.handle('update:cancel', cancelUpdate);
  ipcMain.handle('update:finish', finishUpdate);
  ipcMain.handle('update:show-file', showUpdateFile);
  ipcMain.handle('update:download', openUpdateDownload);
  ipcMain.handle('update:install', openUpdateDownload);
  ipcMain.handle('update:open-releases', async (_event, requestedUrl) => {
    const url = isTrustedReleaseUrl(requestedUrl) ? requestedUrl : RELEASES_URL;
    await shell.openExternal(url);
    return { success: true };
  });
}

function send(channel, payload) {
  getMainWindow()?.webContents.send(channel, payload);
}
