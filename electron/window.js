// electron/window.js — Window creation & management
import { BrowserWindow, shell } from 'electron';
import {
  NEKO_INDEX, PRELOAD_PATH,
  ICONS, IS_DEV, IS_MAC, APP_NAME,
} from './constants.js';

let mainWindow = null;

/**
 * Create the main application window.
 * If a window already exists, focus it instead.
 */
export function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  800,
    minHeight: 600,
    title: APP_NAME,
    icon: ICONS.png,
    show: false, // show after ready-to-show to avoid white flash

    // macOS-specific
    titleBarStyle: 'default',
    trafficLightPosition: undefined,

    webPreferences: {
      preload:            PRELOAD_PATH,
      contextIsolation:   true,
      nodeIntegration:    false,
      sandbox:            true,
      webviewTag:         true,
      spellcheck:         true,
    },

    backgroundColor: '#111827', // dark mode default to avoid flash
  });

  // NOTE: We do NOT auto-load the app here. The boot sequence in main.js
  // handles: show loading screen → wait for backend → load frontend.
  // This avoids race conditions where the frontend loads before the backend.

  // ─── Show when ready ────────────────────────────────────────────────
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    if (IS_DEV) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // ─── Open external links in the OS browser ─────────────────────────
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('file://')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ─── Handle navigation to external URLs ─────────────────────────────
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // ─── Cleanup ────────────────────────────────────────────────────────
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Get the main window (or null if not created/destroyed).
 */
export function getMainWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

/**
 * Show a loading state in the window while the backend starts.
 */
export function showLoadingScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #0d1117;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          -webkit-app-region: drag;
          user-select: none;
        }
        .wordmark {
          font-size: 18px;
          font-weight: 500;
          letter-spacing: 0.04em;
          color: #e2e8f0;
          opacity: 0;
          animation: fade-in 0.6s ease 0.1s forwards;
        }
        .bar-track {
          margin-top: 20px;
          width: 48px;
          height: 2px;
          border-radius: 1px;
          background: #1e293b;
          overflow: hidden;
          opacity: 0;
          animation: fade-in 0.6s ease 0.3s forwards;
        }
        .bar-fill {
          height: 100%;
          width: 40%;
          border-radius: 1px;
          background: #818cf8;
          animation: slide 1.2s ease-in-out infinite;
        }
        @keyframes slide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(150%); }
          100% { transform: translateX(150%); }
        }
        @keyframes fade-in {
          to { opacity: 1; }
        }
      </style>
    </head>
    <body>
      <span class="wordmark">asyncat</span>
      <div class="bar-track"><div class="bar-fill"></div></div>
    </body>
    </html>
  `)}`);

  mainWindow.once('ready-to-show', () => mainWindow?.show());
}
