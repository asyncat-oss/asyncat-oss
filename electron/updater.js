// electron/updater.js — Auto-update via electron-updater + GitHub Releases
//
// How it works:
//   1. On app launch (packaged builds only), we check GitHub Releases for a
//      newer version by reading latest-mac.yml / latest.yml published there.
//   2. If an update is found the renderer gets an 'update:available' event.
//   3. macOS (unsigned): we can check + notify but Gatekeeper will block a
//      silent quitAndInstall. We detect this and open the browser instead.
//   4. Windows / Linux: full silent download + install works out of the box.
//
// Publishing a release:
//   GH_TOKEN=<your-pat> npm run electron:publish
//   electron-builder handles uploading the binaries + latest.yml to the
//   GitHub Release automatically.

import { createRequire } from 'module';
import { ipcMain, shell } from 'electron';
const { autoUpdater } = createRequire(import.meta.url)('electron-updater');
import { IS_DEV, IS_MAC } from './constants.js';
import { getMainWindow } from './window.js';

const RELEASES_URL = 'https://github.com/asyncat-oss/asyncat-oss/releases';

let _initialized = false;

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupAutoUpdater() {
  if (IS_DEV || _initialized) return;
  _initialized = true;

  // Don't download automatically — let the user decide
  autoUpdater.autoDownload    = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // ── Events ────────────────────────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    send('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: v${info.version}`);
    send('update:available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    send('update:not-available', info);
  });

  autoUpdater.on('download-progress', (progress) => {
    send('update:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Downloaded v${info.version}`);
    send('update:downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] error:', err.message);
    send('update:error', err.message);
  });

  // Check 5 seconds after launch so the app has time to settle
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.warn('[updater] check failed:', err.message);
    });
  }, 5000);
}

// ─── IPC Handlers (call once from main.js) ────────────────────────────────────

export function setupUpdaterIPC() {
  ipcMain.handle('update:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo ?? null };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // macOS unsigned: open GitHub Releases in browser instead of quitAndInstall
  ipcMain.handle('update:install', () => {
    if (IS_MAC) {
      shell.openExternal(RELEASES_URL);
    } else {
      autoUpdater.quitAndInstall();
    }
  });

  ipcMain.handle('update:open-releases', () => {
    shell.openExternal(RELEASES_URL);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(channel, payload) {
  getMainWindow()?.webContents.send(channel, payload);
}
