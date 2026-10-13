// electron/tray.js — System tray icon and menu
import { Tray, Menu, nativeImage } from 'electron';
import { ICONS, IS_LINUX, IS_MAC } from './constants.js';
import { getMainWindow } from './window.js';
import { isBackendRunning } from './backend.js';

let tray = null;
let _callbacks = {};

/**
 * Create the system tray icon.
 * @param {object} opts
 * @param {Function} opts.onQuit
 * @param {Function} opts.onShow — Called with an optional in-app route
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
    tray.setToolTip('Asyncat — AI Agent OS');
  }
}

function buildContextMenu() {
  const backendRunning = isBackendRunning();
  const { onQuit, onShow, onRestartBackend, onTrayClick } = _callbacks;

  return Menu.buildFromTemplate([
    {
      label: 'Show Asyncat',
      click: () => {
        const win = getMainWindow();
        if (win) { win.show(); win.focus(); }
        else if (onShow) { onShow(); }
      },
    },
    ...(IS_LINUX && onTrayClick ? [{ label: 'Quick chat', click: () => onTrayClick(null) }] : []),
    {
      label: 'Scheduled tasks',
      click: () => onShow?.('/scheduled'),
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
