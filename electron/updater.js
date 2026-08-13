// electron/updater.js — assisted beta updates through GitHub Releases.
//
// Unsigned beta builds deliberately do not replace themselves. The app checks
// published GitHub releases, selects the installer for this OS/CPU, and opens
// that installer in the user's browser. The user then closes Asyncat and runs
// the installer over the existing installation; userData remains untouched.

import { app, ipcMain, net, shell } from 'electron';
import { IS_DEV } from './constants.js';
import { getMainWindow } from './window.js';
import {
  isTrustedReleaseUrl,
  parseVersion,
  selectLatestRelease,
  selectReleaseAsset,
} from './update-policy.js';

const RELEASES_URL = 'https://github.com/asyncat-oss/asyncat-oss/releases';
const RELEASES_API_URL = 'https://api.github.com/repos/asyncat-oss/asyncat-oss/releases?per_page=20';

let initialized = false;
let currentUpdate = null;
let pendingCheck = null;

function toUpdateInfo(release) {
  const parsed = parseVersion(release.tag_name);
  const linuxPreference = process.platform === 'linux'
    ? (process.env.APPIMAGE ? '.AppImage' : '.deb')
    : null;
  const asset = selectReleaseAsset(release.assets, process.platform, process.arch, linuxPreference);
  return {
    version: parsed.version,
    releaseDate: release.published_at || release.created_at || null,
    releaseNotes: release.body || '',
    releaseUrl: release.html_url || RELEASES_URL,
    assetName: asset?.name || null,
    assetUrl: asset?.browser_download_url || null,
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

export function setupAutoUpdater() {
  if (IS_DEV || initialized) return;
  initialized = true;

  // Give the main window and sidebar time to register their listeners.
  setTimeout(() => {
    checkForUpdates();
  }, 5000);
}

export function setupUpdaterIPC() {
  ipcMain.handle('update:check', checkForUpdates);
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
