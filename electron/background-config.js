// electron/background-config.js — Settings logic for running in the background.
//
// No Electron imports, so it can be unit-tested with plain node. background.js
// applies these settings.
//
// "When the window is closed":
//   scheduled — keep running in the tray while at least one scheduled task is
//               on, otherwise quit (the default)
//   always    — keep running in the tray until Quit is chosen there
//   quit      — quit
// On macOS closing the last window never quit Asyncat (it stays in the Dock),
// so there only "quit" quits.

import path from 'path';

export const WHEN_CLOSED_OPTIONS = Object.freeze(['scheduled', 'always', 'quit']);

export const BACKGROUND_DEFAULTS = Object.freeze({
  whenClosed: 'scheduled',
  openAtLogin: false,
  // The one-time "Asyncat is still running" notification was shown.
  toldStillRunning: false,
});

/** Saved settings merged over the defaults; anything invalid falls back. */
export function mergeBackgroundSettings(saved) {
  const value = saved && typeof saved === 'object' ? saved : {};
  return {
    whenClosed: WHEN_CLOSED_OPTIONS.includes(value.whenClosed) ? value.whenClosed : BACKGROUND_DEFAULTS.whenClosed,
    openAtLogin: typeof value.openAtLogin === 'boolean' ? value.openAtLogin : BACKGROUND_DEFAULTS.openAtLogin,
    toldStillRunning: typeof value.toldStillRunning === 'boolean' ? value.toldStillRunning : BACKGROUND_DEFAULTS.toldStillRunning,
  };
}

/** Apply a change from Settings: { settings } or { error } to show. */
export function applyBackgroundUpdate(settings, patch = {}) {
  const next = { ...settings };
  if (patch.whenClosed !== undefined) {
    if (!WHEN_CLOSED_OPTIONS.includes(patch.whenClosed)) return { error: 'Unknown choice.' };
    next.whenClosed = patch.whenClosed;
  }
  if (patch.openAtLogin !== undefined) {
    if (typeof patch.openAtLogin !== 'boolean') return { error: 'Invalid setting.' };
    next.openAtLogin = patch.openAtLogin;
  }
  return { settings: next };
}

/**
 * Should the app keep running after its window closes? `enabledTasks` is the
 * number of scheduled tasks that are on (null when the backend hasn't said).
 */
export function keepRunningOnClose({ whenClosed, enabledTasks, platform }) {
  if (whenClosed === 'quit') return false;
  if (whenClosed === 'always' || platform === 'darwin') return true;
  return Number(enabledTasks) > 0;
}

/** Text of the one-time notification shown when the app stays in the tray. */
export function stillRunningMessage(whenClosed) {
  return whenClosed === 'always'
    ? 'Asyncat is still running in the background. Quit from the tray icon.'
    : 'Asyncat is still running so your scheduled tasks can run. Quit from the tray icon.';
}

/**
 * The program a login item should start. Inside an AppImage the running
 * binary sits in a temporary mount, so it must be the AppImage file itself —
 * but only when this process really runs from that AppImage (APPIMAGE can be
 * inherited from another AppImage that launched us).
 */
export function launchTarget({ env = {}, execPath, exists = () => false }) {
  const appImage = env.APPIMAGE;
  const appDir = env.APPDIR;
  if (appImage && appDir && path.isAbsolute(appImage) && exists(appImage)) {
    const mount = path.resolve(appDir) + path.sep;
    if (path.resolve(execPath).startsWith(mount)) return appImage;
  }
  return execPath;
}

/** Quote one argument for the Exec key of a .desktop file. */
export function quoteDesktopExecArg(value) {
  const text = String(value);
  if (!/[\s"'\\`$<>|&;()*?#~=%]/.test(text)) return text;
  return `"${text.replace(/(["`$\\])/g, '\\$1')}"`;
}

/** ~/.config/autostart/asyncat.desktop that starts Asyncat hidden in the tray. */
export function autostartDesktopEntry({ target, name = 'Asyncat' }) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${name}`,
    'Comment=Runs your scheduled tasks in the background',
    `Exec=${quoteDesktopExecArg(target)} --hidden`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    'X-Asyncat-Autostart=true',
    '',
  ].join('\n');
}

export function autostartFilePath({ env = {}, home }) {
  const configHome = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME)
    ? env.XDG_CONFIG_HOME
    : path.join(home, '.config');
  return path.join(configHome, 'autostart', 'asyncat.desktop');
}
