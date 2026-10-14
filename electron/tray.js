// electron/tray.js — System tray icon and menu
import { Tray, Menu, nativeImage } from 'electron';
import { ICONS, IS_LINUX, IS_MAC } from './constants.js';
import { getMainWindow } from './window.js';
import { isBackendRunning } from './backend.js';
import { trayMenuTemplate } from './tray-menu.js';

let tray = null;
let _callbacks = {};

/**
 * Create the system tray icon.
 * @param {object} opts
 * @param {Function} opts.onQuit
 * @param {Function} opts.onShow — Called with an optional in-app route
 * @param {Function} opts.onRestartBackend
 * @param {Function} opts.onQuickAsk — Opens Quick ask (left-click, and the Linux menu)
 */
export function createTray({ onQuit, onShow, onRestartBackend, onQuickAsk }) {
  if (tray) return tray;

  _callbacks = { onQuit, onShow, onRestartBackend, onQuickAsk };

  const icon = nativeImage.createFromPath(ICONS.tray);
  const trayIcon = IS_MAC ? icon.resize({ width: 18, height: 18 }) : icon;

  tray = new Tray(trayIcon);
  tray.setToolTip('Asyncat');

  // macOS: setContextMenu fires on both left AND right click — don't use it.
  // Handle each side explicitly so left-click is always Quick ask.
  tray.on('click', () => {
    if (onQuickAsk) {
      onQuickAsk();
    } else {
      const win = getMainWindow();
      if (win) { win.isVisible() ? win.focus() : win.show(); }
      else if (onShow) { onShow(); }
    }
  });

  tray.on('right-click', () => {
    tray.popUpContextMenu(buildContextMenu());
  });

  // Most Linux desktops (AppIndicator) never send clicks to the app and only
  // show a menu set in advance. Asyncat may live only in the tray, so the
  // menu must always be there to reopen the window or quit.
  if (IS_LINUX) tray.setContextMenu(buildContextMenu());

  return tray;
}

/**
 * Rebuild and re-register the context menu (call after backend status changes).
 */
export function updateTrayMenu(callbacks = {}) {
  Object.assign(_callbacks, callbacks);
  if (tray && IS_LINUX) tray.setContextMenu(buildContextMenu());
}

/**
 * Update tray tooltip to reflect active agent run count.
 * @param {number} count  — number of active agent runs (0 = idle)
 */
export function setAgentRunCount(count) {
  if (!tray) return;
  if (count > 0) {
    tray.setToolTip(`Asyncat — ${count} agent run${count > 1 ? 's' : ''} active`);
  } else {
    tray.setToolTip('Asyncat');
  }
}

function buildContextMenu() {
  const { onQuit, onShow, onRestartBackend, onQuickAsk } = _callbacks;

  return Menu.buildFromTemplate(trayMenuTemplate({
    backendRunning: isBackendRunning(),
    showQuickAsk: IS_LINUX,
    onShowWindow: () => {
      const win = getMainWindow();
      if (win) { win.show(); win.focus(); }
      else if (onShow) { onShow(); }
    },
    onQuickAsk,
    onShow,
    onRestartBackend,
    onQuit,
  }));
}

/**
 * Swap the tray icon image at runtime (used by app-icon customization).
 * @param {Electron.NativeImage} image
 */
export function setTrayImage(image) {
  if (tray && image && !image.isEmpty()) tray.setImage(image);
}

export function destroyTray() {
  if (tray) { tray.destroy(); tray = null; }
}
