// electron/tray.js — System tray icon and menu
import { Tray, Menu, nativeImage } from 'electron';
import { ICONS, IS_MAC } from './constants.js';
import { getMainWindow } from './window.js';
import { isBackendRunning } from './backend.js';

let tray = null;

/**
 * Create the system tray icon with context menu.
 * @param {object} opts
 * @param {Function} opts.onQuit — Called when user clicks Quit
 * @param {Function} opts.onShow — Called when user clicks Show
 * @param {Function} opts.onRestartBackend — Called when user clicks Restart Backend
 * @param {Function} opts.onTrayClick — Called with (tray) on left-click; defaults to show window
 */
export function createTray({ onQuit, onShow, onRestartBackend, onTrayClick }) {
  if (tray) return tray;

  // Use a smaller icon for the tray (16x16 on macOS, 32x32 elsewhere)
  const icon = nativeImage.createFromPath(ICONS.tray);
  const trayIcon = IS_MAC ? icon.resize({ width: 18, height: 18 }) : icon;

  tray = new Tray(trayIcon);
  tray.setToolTip('Asyncat — AI Agent OS');

  updateTrayMenu({ onQuit, onShow, onRestartBackend });

  // Left-click → popup panel (or show window if no popup handler)
  tray.on('click', () => {
    if (onTrayClick) {
      onTrayClick(tray);
    } else {
      const win = getMainWindow();
      if (win) { win.isVisible() ? win.focus() : win.show(); }
      else if (onShow) { onShow(); }
    }
  });

  return tray;
}

/**
 * Update the tray context menu (e.g. after backend status changes).
 */
export function updateTrayMenu({ onQuit, onShow, onRestartBackend } = {}) {
  if (!tray) return;

  const backendRunning = isBackendRunning();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Asyncat',
      click: () => {
        const win = getMainWindow();
        if (win) {
          win.show();
          win.focus();
        } else if (onShow) {
          onShow();
        }
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

  tray.setContextMenu(contextMenu);
}

/**
 * Destroy the tray icon (cleanup on app quit).
 */
export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
