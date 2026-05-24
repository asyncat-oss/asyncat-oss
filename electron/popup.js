// electron/popup.js — Tray click popup window (like Claude's menu-bar panel)
import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { IS_MAC, ICONS } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POPUP_PRELOAD = path.join(__dirname, 'popup-preload.js');
const POPUP_HTML    = path.join(__dirname, 'popup.html');

const W = 360;
const H = 196;

let popup = null;

export function togglePopup(tray) {
  if (popup && !popup.isDestroyed()) {
    popup.close();
    return;
  }

  popup = new BrowserWindow({
    width:  W,
    height: H,
    frame:          false,
    resizable:      false,
    movable:        false,
    minimizable:    false,
    maximizable:    false,
    fullscreenable: false,
    alwaysOnTop:    true,
    skipTaskbar:    true,
    show:           false,
    // macOS: frosted-glass popover effect
    ...(IS_MAC && {
      transparent:         true,
      vibrancy:            'popover',
      visualEffectState:   'active',
      backgroundColor:     '#00000000',
    }),
    ...(!IS_MAC && {
      backgroundColor: '#0d121e',
    }),
    webPreferences: {
      preload:          POPUP_PRELOAD,
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
    },
  });

  popup.loadFile(POPUP_HTML, { query: { iconPath: ICONS.svg } });

  popup.once('ready-to-show', () => {
    positionNearTray(tray);
    popup.show();
  });

  // Close when it loses focus (click-away dismissal)
  popup.on('blur', () => {
    if (popup && !popup.isDestroyed()) popup.close();
  });

  popup.on('closed', () => { popup = null; });
}

export function closePopup() {
  if (popup && !popup.isDestroyed()) popup.close();
}

// ─── Positioning ──────────────────────────────────────────────────────────────

function positionNearTray(tray) {
  if (!popup || popup.isDestroyed()) return;

  const trayBounds = tray.getBounds();
  const { workArea } = screen.getDisplayMatching(trayBounds);

  // Center horizontally under/above the tray icon
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - W / 2);

  // macOS menu bar is at the top; Windows/Linux taskbar is usually at the bottom
  const y = IS_MAC
    ? trayBounds.y + trayBounds.height + 4
    : trayBounds.y - H - 4;

  // Clamp so the popup doesn't go off-screen
  x = Math.max(workArea.x + 8, Math.min(x, workArea.x + workArea.width - W - 8));

  popup.setPosition(Math.round(x), Math.round(y), false);
}
