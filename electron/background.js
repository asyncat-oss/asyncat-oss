// electron/background.js — Running in the background for Cats.
//
// Decides whether closing the window quits Asyncat or leaves it in the tray
// (Settings → Background), shows the one-time "still running" notice, and
// starts Asyncat at login, hidden in the tray, when asked to. The rules are in
// background-config.js; the backend reports how many Cats are on.

import { app, Notification, nativeImage } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { APP_NAME, BACKEND_URL, ICONS, IS_LINUX, IS_MAC, IS_WIN, USER_DATA } from './constants.js';
import {
  applyBackgroundUpdate, autostartDesktopEntry, autostartFilePath, keepRunningOnClose, launchTarget,
  mergeBackgroundSettings, stillRunningMessage,
} from './background-config.js';

const CONFIG_PATH = path.join(USER_DATA, 'background.json');
const HIDDEN_FLAG = '--hidden';

let settings = null;
let enabledTasks = null; // reported by the backend; null until it does

function load() {
  try {
    return mergeBackgroundSettings(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch {
    return mergeBackgroundSettings(null);
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(settings, null, 2));
  } catch { /* best effort */ }
}

function current() {
  if (!settings) settings = load();
  return settings;
}

/** The backend's count of Cats that are on (host bridge message). */
export function setEnabledTaskCount(count) {
  const value = Number(count);
  enabledTasks = Number.isFinite(value) && value >= 0 ? value : null;
}

async function fetchEnabledTaskCount() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/cats`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const body = await res.json();
    return Number.isFinite(body?.enabledCount) ? body.enabledCount : null;
  } catch {
    return null;
  }
}

/** Should closing the main window leave Asyncat running in the tray? */
export async function keepRunningAfterClose() {
  const { whenClosed } = current();
  if (whenClosed === 'scheduled' && enabledTasks === null && !IS_MAC) {
    setEnabledTaskCount(await fetchEnabledTaskCount());
  }
  return keepRunningOnClose({ whenClosed, enabledTasks, platform: process.platform });
}

/** Once ever, on Windows and Linux: say that Asyncat is still in the tray. */
export function noteKeptRunning() {
  const state = current();
  if (IS_MAC || state.toldStillRunning) return;
  settings = { ...state, toldStillRunning: true };
  save();
  if (!Notification.isSupported()) return;
  const icon = nativeImage.createFromPath(ICONS.window);
  new Notification({
    title: APP_NAME,
    body: stillRunningMessage(state.whenClosed),
    ...(icon.isEmpty() ? {} : { icon }),
  }).show();
}

/** True when this launch should stay in the tray without opening a window. */
export function startsHidden() {
  if (process.argv.includes(HIDDEN_FLAG)) return true;
  if (IS_MAC) {
    try { return Boolean(app.getLoginItemSettings().wasOpenedAsHidden); } catch { return false; }
  }
  return false;
}

// ── Start at login ────────────────────────────────────────────────────────────

function loginSupported() {
  // A development build would register the bare Electron binary.
  return app.isPackaged && (IS_WIN || IS_MAC || IS_LINUX);
}

function linuxAutostartPath() {
  return autostartFilePath({ env: process.env, home: os.homedir() });
}

function readOpenAtLogin() {
  if (!loginSupported()) return false;
  try {
    if (IS_LINUX) return fs.existsSync(linuxAutostartPath());
    if (IS_WIN) return app.getLoginItemSettings({ path: process.execPath, args: [HIDDEN_FLAG] }).openAtLogin;
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return current().openAtLogin;
  }
}

function writeOpenAtLogin(openAtLogin) {
  if (!loginSupported()) throw new Error('Starting at login is only available in the installed app.');
  if (IS_LINUX) {
    const file = linuxAutostartPath();
    if (openAtLogin) {
      const target = launchTarget({ env: process.env, execPath: process.execPath, exists: (item) => fs.existsSync(item) });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, autostartDesktopEntry({ target, name: APP_NAME }));
    } else if (fs.existsSync(file)) {
      // Only remove an entry this app wrote.
      if (fs.readFileSync(file, 'utf8').includes('X-Asyncat-Autostart=true')) fs.unlinkSync(file);
    }
    return;
  }
  if (IS_WIN) {
    app.setLoginItemSettings({ openAtLogin, path: process.execPath, args: [HIDDEN_FLAG] });
    return;
  }
  app.setLoginItemSettings({ openAtLogin, openAsHidden: true });
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getBackgroundSettings() {
  const state = current();
  return {
    whenClosed: state.whenClosed,
    openAtLogin: readOpenAtLogin(),
    loginSupported: loginSupported(),
    enabledTasks,
    platform: process.platform,
  };
}

export function updateBackgroundSettings(patch = {}) {
  const { settings: next, error } = applyBackgroundUpdate(current(), patch || {});
  if (error) return { ok: false, error, settings: getBackgroundSettings() };
  if (patch.openAtLogin !== undefined) {
    try {
      writeOpenAtLogin(next.openAtLogin);
    } catch (err) {
      return { ok: false, error: err.message || "Couldn't change the login item.", settings: getBackgroundSettings() };
    }
  }
  settings = next;
  save();
  return { ok: true, settings: getBackgroundSettings() };
}

export function registerBackgroundIPC(ipcMain) {
  ipcMain.handle('background:get', () => getBackgroundSettings());
  ipcMain.handle('background:set', (_event, patch) => updateBackgroundSettings(patch || {}));
}
