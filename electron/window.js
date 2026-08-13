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

    backgroundColor: '#ffffff',
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
        :root {
          color-scheme: light dark;
          --background: #ffffff;
          --foreground: #18181b;
          --muted: #a1a1aa;
          --track: #e4e4e7;
        }
        body {
          background: var(--background);
          color: var(--foreground);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          -webkit-app-region: drag;
          user-select: none;
        }
        .mark {
          width: 34px;
          height: 34px;
          color: var(--foreground);
          opacity: 0;
          animation: appear 320ms ease-out forwards;
        }
        .wordmark {
          margin-top: 12px;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--foreground);
          opacity: 0;
          animation: appear 320ms ease-out 80ms forwards;
        }
        .bar-track {
          margin-top: 18px;
          width: 40px;
          height: 1px;
          background: var(--track);
          overflow: hidden;
          opacity: 0;
          animation: appear 320ms ease-out 160ms forwards;
        }
        .bar-fill {
          height: 100%;
          width: 45%;
          background: var(--foreground);
          animation: slide 1.35s ease-in-out infinite;
        }
        @keyframes slide {
          0% { transform: translateX(-110%); }
          55%, 100% { transform: translateX(210%); }
        }
        @keyframes appear {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --background: #111827;
            --foreground: #f4f4f5;
            --muted: #71717a;
            --track: #374151;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .mark, .wordmark, .bar-track { animation-duration: 1ms; animation-delay: 0ms; }
          .bar-fill { animation: none; width: 100%; opacity: 0.45; }
        }
      </style>
    </head>
    <body>
      <svg class="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M6 25L11.5 8L16 13L20.5 8L26 25" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M9 20H23" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
      </svg>
      <span class="wordmark">Asyncat</span>
      <div class="bar-track"><div class="bar-fill"></div></div>
    </body>
    </html>
  `)}`);

  mainWindow.once('ready-to-show', () => mainWindow?.show());
}
