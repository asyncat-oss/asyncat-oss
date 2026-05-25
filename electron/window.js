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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #111827;
          color: #e5e7eb;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          -webkit-app-region: drag;
        }
        .container { text-align: center; }
        .spinner {
          width: 40px; height: 40px;
          margin: 0 auto 24px;
          border: 4px solid #1e3a5f;
          border-top-color: #818cf8;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
        p { font-size: 14px; color: #9ca3af; }
        .cat { font-size: 48px; margin-bottom: 16px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="cat">🐱</div>
        <div class="spinner"></div>
        <h1>Asyncat is waking up...</h1>
        <p>Starting the backend, warming up the neurons</p>
      </div>
    </body>
    </html>
  `)}`);

  mainWindow.once('ready-to-show', () => mainWindow?.show());
}
