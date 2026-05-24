// electron/tray.js — System tray icon and menu
import { Tray, Menu, nativeImage } from 'electron';
import { ICONS, IS_MAC } from './constants.js';
import { getMainWindow } from './window.js';
import { isBackendRunning } from './backend.js';

let tray = null;
let _callbacks = {};

/**
 * Create the system tray icon.
 * @param {object} opts
 * @param {Function} opts.onQuit
 * @param {Function} opts.onShow
 * @param {Function} opts.onRestartBackend
 * @param {Function} opts.onTrayClick — Called with (tray) on left-click
 */
export function createTray({ onQuit, onShow, onRestartBackend, onTrayClick }) {
  if (tray) return tray;

  _callbacks = { onQuit, onShow, onRestartBackend, onTrayClick };

  const icon = nativeImage.createFromPath(ICONS.tray);
  const trayIcon = IS_MAC ? icon.resize({ width: 18, height: 18 }) : icon;

  tray = new Tray(trayIcon);
  tray.setToolTip('Asyncat — AI Agent OS');

  // macOS: setContextMenu fires on both left AND right click — don't use it.
  // Handle each side explicitly so left-click is always the popup.
  tray.on('click', () => {
    if (onTrayClick) {
      onTrayClick(tray);
    } else {
      const win = getMainWindow();
      if (win) { win.isVisible() ? win.focus() : win.show(); }
      else if (onShow) { onShow(); }
    }
  });

  tray.on('right-click', () => {
    tray.popUpContextMenu(buildContextMenu());
  });

  return tray;
}

/**
 * Rebuild and re-register the context menu (call after backend status changes).
 */
export function updateTrayMenu(callbacks = {}) {
  Object.assign(_callbacks, callbacks);
  // No-op for menu content — it's built fresh on each right-click via buildContextMenu()
}

function buildContextMenu() {
  const backendRunning = isBackendRunning();
  const { onQuit, onShow, onRestartBackend } = _callbacks;

  return Menu.buildFromTemplate([
    {
      label: 'Show Asyncat',
      click: () => {
        const win = getMainWindow();
        if (win) { win.show(); win.focus(); }
        else if (onShow) { onShow(); }
      },
    },
    { type: 'separator' },
    {
      label: `Backend: ${backendRunning ? '✅ Running' : '❌ Stopped'}`,
      enabled: false,
    },
    {
      label: 'Restart Backend',
      click: () => onRestartBackend?.(),
    },
    { type: 'separator' },
    {
      label: 'Quit Asyncat',
      click: () => onQuit?.(),
    },
  ]);
}

export function destroyTray() {
  if (tray) { tray.destroy(); tray = null; }
}
