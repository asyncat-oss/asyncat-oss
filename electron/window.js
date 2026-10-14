// electron/window.js — Window creation & management
import { BrowserWindow, nativeImage, nativeTheme, shell } from 'electron';
import {
  NEKO_INDEX, PRELOAD_PATH,
  ICONS, IS_MAC, IS_WIN, APP_NAME, WINDOWS_APP_ID, FRONTEND_PORT, OPEN_DEVTOOLS,
} from './constants.js';
import { guardNavigation } from './navigation.js';

let mainWindow = null;

/** Apply the metadata Windows uses for the live taskbar button and relaunch icon. */
export function applyWindowsTaskbarIdentity(win, windowIcon = nativeImage.createFromPath(ICONS.ico)) {
  if (!IS_WIN || win.isDestroyed()) return;

  // Keep the live window and its Windows relaunch metadata on the same ICO.
  if (windowIcon && !windowIcon.isEmpty()) win.setIcon(windowIcon);
  win.setAppDetails({
    appId: WINDOWS_APP_ID,
    appIconPath: ICONS.ico,
    appIconIndex: 0,
  });
}

/**
 * Create the main application window.
 * If a window already exists, focus it instead.
 */
export function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return mainWindow;
  }

  const windowIcon = nativeImage.createFromPath(ICONS.window);
  if (windowIcon.isEmpty()) {
    console.warn('[Asyncat] Window icon could not be loaded:', ICONS.window);
  }

  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  800,
    minHeight: 600,
    title: APP_NAME,
    // Windows renders taskbar icons most reliably from a multi-resolution ICO.
    icon: windowIcon.isEmpty() ? undefined : windowIcon,
    show: false, // show after ready-to-show to avoid white flash

    // macOS-specific
    titleBarStyle: 'default',
    trafficLightPosition: undefined,

    webPreferences: {
      preload:            PRELOAD_PATH,
      contextIsolation:   true,
      nodeIntegration:    false,
      sandbox:            true,
      webviewTag:         false, // the browser panel uses views owned by browserHost.js
      spellcheck:         true,
    },

    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111827' : '#ffffff',
  });

  // NOTE: We do NOT auto-load the app here. The boot sequence in main.js
  // handles: show loading screen → wait for backend → load frontend.
  // This avoids race conditions where the frontend loads before the backend.

  // ─── Show when ready ────────────────────────────────────────────────
  mainWindow.once('ready-to-show', () => {
    applyWindowsTaskbarIdentity(mainWindow, windowIcon);
    mainWindow.show();

    if (OPEN_DEVTOOLS) {
      mainWindow.webContents.openDevTools({ mode: 'right' });
    }
  });

  // ─── Open external links in the OS browser, stay on the app's pages ─
  guardNavigation(mainWindow.webContents, {
    frontendPort: FRONTEND_PORT,
    openExternal: (url) => shell.openExternal(url),
  });

  // Reassert the icon after native window creation; this avoids the Electron
  // executable icon winning the first Windows taskbar paint in source runs.
  if (IS_WIN) applyWindowsTaskbarIdentity(mainWindow, windowIcon);
  else if (!IS_MAC && !windowIcon.isEmpty()) mainWindow.setIcon(windowIcon);

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

// The walking cat from asyncat.com (neko/src/components/ui/catPoses.js).
// Inlined because this page is a data: URL and cannot load app assets.
const WALKING_CAT = '<g class="cat-o"><g class="cat-tail"><path class="t" d="M26 42 C 14 40, 8 30, 12 18 C 14 12, 20 10, 22 14"></path></g><rect class="s cat-leg cat-leg-a" x="30" y="56" width="9" height="28" rx="3"></rect><rect class="s cat-leg cat-leg-b" x="42" y="56" width="9" height="28" rx="3"></rect><rect class="s cat-leg cat-leg-b" x="78" y="56" width="9" height="28" rx="3"></rect><rect class="s cat-leg cat-leg-a" x="90" y="56" width="9" height="28" rx="3"></rect><g class="cat-trunk"><rect class="s" x="22" y="34" width="76" height="32" rx="14"></rect><g class="cat-head"><rect class="s" x="90" y="16" width="36" height="32" rx="6"></rect><polygon class="s" points="92,19 99,5 106,18"></polygon><polygon class="s" points="110,18 118,5 124,19"></polygon></g></g></g><g class="cat-f"><g class="cat-tail"><path class="t" d="M26 42 C 14 40, 8 30, 12 18 C 14 12, 20 10, 22 14"></path></g><rect class="s cat-leg cat-leg-a" x="30" y="56" width="9" height="28" rx="3"></rect><rect class="s cat-leg cat-leg-b" x="42" y="56" width="9" height="28" rx="3"></rect><rect class="s cat-leg cat-leg-b" x="78" y="56" width="9" height="28" rx="3"></rect><rect class="s cat-leg cat-leg-a" x="90" y="56" width="9" height="28" rx="3"></rect><g class="cat-trunk"><rect class="s" x="22" y="34" width="76" height="32" rx="14"></rect><g class="cat-head"><rect class="s" x="90" y="16" width="36" height="32" rx="6"></rect><polygon class="s" points="92,19 99,5 106,18"></polygon><polygon class="s" points="110,18 118,5 124,19"></polygon></g></g></g><g class="cat-d cat-trunk"><g class="cat-head"><polygon class="inner" points="96,18 99,10 103,18"></polygon><polygon class="inner" points="113,18 118,10 121,18"></polygon><g class="cat-eyes"><rect class="eye" x="110" y="24" width="9" height="12" rx="2"></rect><rect class="pupil cat-pupils" x="114" y="25.5" width="3" height="9" rx="1.5"></rect><rect class="shine" x="111.5" y="26" width="2" height="2"></rect></g><polygon class="nose" points="124.5,35 126.5,38.5 122.5,38.5"></polygon><path class="whisker" d="M118 39C124 38 128 39 131 41M118 42C124 42 128 44 130 46"></path></g></g>';

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
          --foreground: #111827;
          --muted: #9ca3af;
          --track: #e5e7eb;
          --cat: #121212;
          --cat-line: transparent;
          --cat-eye: #ffe5b4;
          --cat-nose: #f2a7b8;
          --cat-detail: #3d3c3a;
          --cat-whisker: #bdb9b1;
        }
        html, body { background: var(--background); }
        body {
          color: var(--foreground);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          -webkit-app-region: drag;
          user-select: none;
        }
        /* No fade on the cat: an animated layer with transparent areas can be
           drawn white on some Linux GPU setups. The opaque background keeps it
           matching the page even if it is given its own layer. */
        .stage { width: 132px; background: var(--background); }
        .cat { display: block; width: 92px; margin: 0 auto -1px; overflow: visible; }
        .cat .cat-o { display: none; }
        .cat-f .s { fill: var(--cat); }
        .cat-f .t { fill: none; stroke: var(--cat); stroke-width: 9; stroke-linecap: round; }
        .cat-o .s { fill: var(--cat-line); stroke: var(--cat-line); stroke-width: 6px; stroke-linejoin: round; }
        .cat-o .t { fill: none; stroke: var(--cat-line); stroke-width: 15px; stroke-linecap: round; }
        .cat .eye { fill: var(--cat-eye); }
        .cat .pupil { fill: var(--cat); }
        .cat .shine { fill: #fff; }
        .cat .nose { fill: var(--cat-nose); }
        .cat .inner { fill: var(--cat-detail); }
        .cat .whisker { fill: none; stroke: var(--cat-whisker); stroke-width: 1.2; stroke-linecap: round; }
        .cat .cat-leg { transform-box: fill-box; transform-origin: 50% 8%; }
        .cat .cat-leg-a { animation: step 0.64s ease-in-out infinite; }
        .cat .cat-leg-b { animation: step 0.64s ease-in-out -0.32s infinite; }
        .cat .cat-trunk { animation: bob 0.32s ease-in-out infinite alternate; }
        .cat .cat-tail { transform-origin: 26px 42px; animation: tail 1.28s ease-in-out infinite; }
        .cat .cat-eyes { transform-box: fill-box; transform-origin: center; animation: blink 3.8s infinite; }
        .ground {
          height: 2px;
          border-radius: 2px;
          background: repeating-linear-gradient(90deg, var(--track) 0 14px, transparent 14px 22px);
          animation: ground 0.64s linear infinite;
        }
        .wordmark {
          margin-top: 22px;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.045em;
          opacity: 0;
          animation: appear 360ms ease-out 90ms forwards;
        }
        .status {
          margin-top: 6px;
          font-size: 12px;
          color: var(--muted);
          opacity: 0;
          animation: appear 360ms ease-out 180ms forwards;
        }
        @keyframes step { 0%, 100% { transform: rotate(14deg); } 50% { transform: rotate(-14deg); } }
        @keyframes bob { from { transform: translateY(0); } to { transform: translateY(-1.5px); } }
        @keyframes tail { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(7deg); } }
        @keyframes blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
        @keyframes ground { from { background-position: 0 0; } to { background-position: -22px 0; } }
        @keyframes appear {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --background: #111827;
            --foreground: #f3f4f6;
            --muted: #6b7280;
            --track: #374151;
            --cat: #0c0c0e;
            --cat-line: #ece9e2;
            --cat-whisker: #8e8b85;
          }
          .cat .cat-o { display: inline; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; animation-delay: 0ms !important; }
        }
      </style>
    </head>
    <body>
      <div class="stage">
        <svg class="cat" viewBox="0 0 132 84" aria-hidden="true">${WALKING_CAT}</svg>
        <div class="ground"></div>
      </div>
      <span class="wordmark">asyncat</span>
      <span class="status">Starting up…</span>
    </body>
    </html>
  `)}`);

  mainWindow.once('ready-to-show', () => mainWindow?.show());
}
