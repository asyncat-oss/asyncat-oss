// electron/popup.js — Tray click popup window (like Claude's menu-bar panel)
import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { IS_MAC, ICONS } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POPUP_PRELOAD = path.join(__dirname, 'popup-preload.js');
const POPUP_HTML    = path.join(__dirname, 'popup.html');

const W = 640;
const H = 168;

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
    positionBottomCenter(tray);
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

function positionBottomCenter(tray) {
  if (!popup || popup.isDestroyed()) return;

  // Use the display containing the tray icon, fall back to primary
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayMatching(trayBounds);
  const { workArea } = display;

  const x = Math.round(workArea.x + workArea.width / 2 - W / 2);
  const y = Math.round(workArea.y + workArea.height - H - 56);

  popup.setPosition(x, y, false);
}
