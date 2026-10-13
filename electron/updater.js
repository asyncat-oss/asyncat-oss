// electron/updater.js — updates through GitHub Releases.
//
// The app checks published releases and picks the installer for this OS/CPU.
// When the user chooses to update, it downloads that file inside the app,
// checks it against the asset's SHA-256 digest from GitHub and the release's
// SHA256SUMS.txt (an update that can't be checked is refused), and then (see
// update-install.js): an AppImage replaces itself (keeping the old one until
// the new one has started, see update-rollback.js) and restarts, Windows runs
// the installer silently and reopens, and macOS / .deb get the file saved and
// shown for the last step (unsigned builds, or root needed). Chats and
// settings are never touched; the updater keeps only small files in
// userData: the last release check (update-check.json, so checks don't use
// up GitHub's hourly limit), the last verified download
// (update-download.json, so a finished download isn't fetched again) and a
// pending AppImage swap (update-state.json).

import fs from 'fs';
import path from 'path';
import { app, dialog, ipcMain, net, shell } from 'electron';
import { IS_DEV } from './constants.js';
import { getMainWindow } from './window.js';
import { startBackend, stopBackend } from './backend.js';
import { fetchReleasesCached } from './update-check.js';
import {
  dismissRollback,
  installAppImageUpdate,
  markBooted,
  noteLaunch,
  readUpdateState,
  rollBack,
} from './update-rollback.js';
import {
  DEFAULT_UPDATE_REPO,
  compareVersions,
  isTrustedReleaseUrl,
  parseVersion,
  selectLatestRelease,
  selectReleaseAsset,
  updateRepo,
} from './update-policy.js';
import {
  WINDOWS_INSTALLER_ARGS,
  cleanupUpdateFiles,
  detectAppImage,
  downloadFile,
  installStrategy,
  isPerMachineInstall,
  launchDetached,
  makeExecutable,
  parseChecksums,
  planDownload,
  readDownloadRecord,
  verifiedDownloadFor,
  verifyChecksum,
  writeDownloadRecord,
} from './update-install.js';

// ASYNCAT_UPDATE_REPO=owner/repo checks a fork instead (see README.md).
const UPDATE_REPO = updateRepo();
const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`;
const RELEASES_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=20`;
if (UPDATE_REPO !== DEFAULT_UPDATE_REPO) console.info(`[updater] Checking ${UPDATE_REPO} for updates (ASYNCAT_UPDATE_REPO).`);

/** The app's own folder for downloaded installers (not Downloads). */
function updateDir() {
  return path.join(app.getPath('temp'), 'asyncat-update');
}

const checkCacheFile = () => path.join(app.getPath('userData'), 'update-check.json');
const downloadRecordFile = () => path.join(app.getPath('userData'), 'update-download.json');
const updateStateFile = () => path.join(app.getPath('userData'), 'update-state.json');

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
    // GitHub's own SHA-256 of the file ("sha256:<hex>"), when the API has it.
    assetDigest: asset?.digest || null,
    checksumUrl: checksums?.browser_download_url || null,
    strategy: installStrategy({ platform: process.platform, appImagePath: RUNNING_APPIMAGE, assetName: asset?.name || null }),
    platform: process.platform,
    arch: process.arch,
  };
}

async function fetchPublishedReleases({ force = false } = {}) {
  const { releases } = await fetchReleasesCached({
    url: RELEASES_API_URL,
    cacheFile: checkCacheFile(),
    fetchImpl: (url, options) => net.fetch(url, options),
    force,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Asyncat-Desktop/${app.getVersion()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  return releases;
}

/** `force` is for "Check for updates" pressed by hand; other checks may use a recent answer. */
async function checkForUpdates(_event, options = {}) {
  if (IS_DEV) return { success: false, error: 'Update checks are only available in packaged builds.' };
  if (pendingCheck) return pendingCheck;

  send('update:checking');
  pendingCheck = (async () => {
    try {
      const release = selectLatestRelease(await fetchPublishedReleases({ force: options?.force === true }), app.getVersion());
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

async function fetchChecksums(url, signal = null) {
  if (!url || !isTrustedReleaseUrl(url)) return null;
  try {
    const response = await net.fetch(url, { signal });
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
  if (!update.assetDigest && !update.checksumUrl) {
    // Nothing to check the file against: don't download what we'd refuse.
    const error = "This update can't be checked: the release has no checksum for it. You can download it from the release page instead.";
    setDownload({ status: 'error', version: update.version, error });
    return { success: false, error };
  }

  const { strategy, destination } = planDownload({
    strategy: update.strategy,
    assetName: update.assetName,
    platform: process.platform,
    appImagePath: RUNNING_APPIMAGE,
    updateDir: updateDir(),
    downloadsDir: app.getPath('downloads'),
  });
  const perMachine = strategy === 'run-installer' ? isPerMachineInstall() : false;

  // Already downloaded and verified (the screen was closed, or Asyncat was
  // restarted before installing): go straight to the last step.
  const finished = await verifiedDownloadFor(readDownloadRecord(downloadRecordFile()), {
    version: update.version,
    assetName: update.assetName,
    strategy,
  });
  if (finished) {
    setDownload({ status: 'ready', version: update.version, strategy, file: finished.file, received: 0, total: 0, error: null, perMachine });
    return { success: true, reused: true };
  }

  const abort = new AbortController();
  downloadAbort = abort;
  setDownload({
    status: 'downloading',
    version: update.version,
    strategy,
    received: 0,
    total: update.assetSize || 0,
    file: null,
    error: null,
    // Installed for all users: Windows will ask for permission to update.
    perMachine,
  });
  (async () => {
    try {
      const [result, sums] = await Promise.all([
        downloadFile(update.assetUrl, destination, {
          fetchImpl: (url, options) => net.fetch(url, options),
          signal: abort.signal,
          onProgress: ({ received, total }) => {
            if (!abort.signal.aborted) setDownload({ received, total: total || download.total });
          },
        }),
        fetchChecksums(update.checksumUrl, abort.signal),
      ]);
      try {
        if (abort.signal.aborted) throw Object.assign(new Error('The download was cancelled.'), { cancelled: true });
        if (update.checksumUrl && !sums && !update.assetDigest) {
          throw new Error("Couldn't fetch the release's checksums to check the download. Try again.");
        }
        verifyChecksum({ sums, digest: update.assetDigest, assetName: update.assetName, sha256: result.sha256 });
      } catch (error) {
        fs.rmSync(destination, { force: true });
        throw error;
      }
      if (strategy === 'replace-appimage') {
        // The running version stays as <AppImage>.previous until the new one
        // has started once (see update-rollback.js).
        installAppImageUpdate({
          downloaded: destination,
          appImagePath: RUNNING_APPIMAGE,
          stateFile: updateStateFile(),
          newVersion: update.version,
          currentVersion: app.getVersion(),
        });
      }
      if (strategy === 'save-appimage') makeExecutable(destination);
      // A .deb or a saved AppImage is in Downloads: show it there.
      if ((strategy === 'open-installer' || strategy === 'save-appimage') && process.platform === 'linux') {
        shell.showItemInFolder(destination);
      }
      const file = strategy === 'replace-appimage' ? RUNNING_APPIMAGE : destination;
      writeDownloadRecord(downloadRecordFile(), {
        version: update.version,
        assetName: update.assetName,
        strategy,
        file,
        sha256: result.sha256,
        savedAt: new Date().toISOString(),
      });
      setDownload({ status: 'ready', file });
    } catch (error) {
      if (!error.cancelled) console.warn('[updater] download failed:', error.message);
      setDownload({ status: error.cancelled ? 'idle' : 'error', error: error.cancelled ? null : error.message, received: 0 });
    } finally {
      if (downloadAbort === abort) downloadAbort = null;
    }
  })();
  return { success: true };
}

/** Stop a running download; its partial file is removed and Update starts over. */
function cancelUpdate() {
  if (!downloadAbort) return { success: true, cancelled: false };
  downloadAbort.abort();
  return { success: true, cancelled: true };
}

/** Finish an update that is ready: restart into it, or run the installer. */
async function finishUpdate() {
  if (download.status !== 'ready') return { success: false, error: 'The update has not finished downloading.' };
  if (download.strategy === 'replace-appimage' || download.strategy === 'save-appimage') {
    const execPath = download.strategy === 'replace-appimage' ? RUNNING_APPIMAGE : download.file;
    if (!execPath || !fs.existsSync(execPath)) {
      return { success: false, error: 'The new version is no longer where it was saved. Download the update again.' };
    }
    app.relaunch({ execPath, args: process.argv.slice(1) });
    setImmediate(() => app.quit());
    return { success: true, quitting: true };
  }
  if (download.strategy === 'run-installer') {
    if (!download.file || !fs.existsSync(download.file)) {
      const error = 'The downloaded installer is missing. Download the update again.';
      setDownload({ status: 'error', error });
      return { success: false, error };
    }
    // Stop the backend (and the local model servers it started) first: its
    // bundled Node.js lives in the install folder, and the installer has to
    // replace it while Asyncat is closing.
    await stopBackend();
    try {
      await launchDetached(download.file, WINDOWS_INSTALLER_ARGS);
    } catch (error) {
      console.warn('[updater] installer did not start:', error.message);
      startBackend().catch((restartError) => console.warn('[updater] backend restart failed:', restartError.message));
      return { success: false, error: `The installer couldn't be started (${error.message}). Try again, or download the update from the release page.` };
    }
    setImmediate(() => app.quit());
    return { success: true, quitting: true };
  }
  // macOS / .deb: open the installer for the user.
  const error = await shell.openPath(download.file);
  return error ? { success: false, error } : { success: true };
}

/** Quit so the user can replace the app (macOS: drag the new one into Applications). */
function quitForUpdate() {
  setImmediate(() => app.quit());
  return { success: true };
}

function showUpdateFile() {
  if (download.file) shell.showItemInFolder(download.file);
  return { success: Boolean(download.file) };
}

// ── After an AppImage update: keep it, or go back ───────────────────────────

// How long a new version gets to bring up its window and backend. Shorter
// when its last start never got there.
const BOOT_GRACE_MS = 3 * 60 * 1000;
const RETRY_BOOT_GRACE_MS = 45 * 1000;
let bootWatch = null;
let bootReported = false;
let offeringRollback = false;
let bootedWhileOffering = false;

async function offerRollback(pending, reason) {
  if (offeringRollback) return;
  offeringRollback = true;
  try {
    const current = app.getVersion();
    const previous = pending.previousVersion || 'the previous version';
    const options = {
      type: 'warning',
      title: 'Asyncat update',
      message: reason === 'backend'
        ? `Asyncat ${current} couldn't start its backend.`
        : `Asyncat ${current} isn't starting properly.`,
      detail: `You can go back to version ${previous}, which you used before this update. Your chats and settings stay. You can update again later.`,
      buttons: [`Go back to ${previous}`, 'Keep this version'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const win = getMainWindow();
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response !== 0) {
      // It came up while the question was open: nothing left to watch.
      if (bootedWhileOffering) markBooted(updateStateFile(), { currentVersion: app.getVersion() });
      else dismissRollback(updateStateFile());
      return;
    }
    try {
      const execPath = rollBack(updateStateFile());
      app.relaunch({ execPath, args: process.argv.slice(1) });
      app.quit();
    } catch (error) {
      dialog.showErrorBox("Couldn't go back", `${error.message}\n\nYou can download an earlier version from ${RELEASES_URL}.`);
    }
  } finally {
    offeringRollback = false;
  }
}

/** At startup: is this the first start of an AppImage update? Then watch it. */
function watchUpdatedAppImage() {
  if (!RUNNING_APPIMAGE) return;
  const decision = noteLaunch(updateStateFile(), { currentVersion: app.getVersion(), appImagePath: RUNNING_APPIMAGE });
  if (decision.action === 'none' || !decision.canRollBack || decision.pending.dismissed) return;
  // 'offer-rollback': its last start never finished, so ask sooner.
  const grace = decision.action === 'offer-rollback' ? RETRY_BOOT_GRACE_MS : BOOT_GRACE_MS;
  bootWatch = setTimeout(() => {
    if (!bootReported) offerRollback(decision.pending, 'slow');
  }, grace);
  bootWatch.unref?.();
}

/**
 * main.js calls this once the first window and the backend are up (ok) or
 * the backend failed (not ok). A new version that came up keeps itself and
 * its `.previous` copy is removed; one that didn't is offered a way back.
 */
export function reportBootResult(ok) {
  if (IS_DEV || !RUNNING_APPIMAGE || bootReported) return;
  bootReported = true;
  clearTimeout(bootWatch);
  if (ok) {
    if (offeringRollback) bootedWhileOffering = true;
    else markBooted(updateStateFile(), { currentVersion: app.getVersion() });
    return;
  }
  const pending = readUpdateState(updateStateFile()).pending;
  if (pending && pending.version === app.getVersion() && !pending.dismissed && fs.existsSync(pending.previous || '')) {
    offerRollback(pending, 'backend');
  }
}

/** Remove partial downloads and installers of updates that are already installed. */
function cleanUpOldUpdates() {
  try {
    const record = readDownloadRecord(downloadRecordFile());
    const { removed, keepRecord } = cleanupUpdateFiles({
      updateDir: updateDir(),
      downloadsDir: app.getPath('downloads'),
      appImagePath: RUNNING_APPIMAGE,
      record,
      isPending: (version) => {
        try { return compareVersions(version, app.getVersion()) > 0; } catch { return false; }
      },
    });
    if (record && !keepRecord) writeDownloadRecord(downloadRecordFile(), null);
    if (removed.length) console.info(`[updater] Removed ${removed.length} leftover update file(s).`);
  } catch (error) {
    console.warn('[updater] cleanup failed:', error.message);
  }
}

export function setupAutoUpdater() {
  if (IS_DEV || initialized) return;
  initialized = true;

  watchUpdatedAppImage();
  cleanUpOldUpdates();

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
  ipcMain.handle('update:quit', quitForUpdate);
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
