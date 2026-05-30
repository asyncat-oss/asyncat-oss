// electron/main.js — Asyncat Desktop App entry point
//
// This is the Electron main process. It:
// 1. Starts the Express backend (den) as a child process
// 2. Creates a BrowserWindow to load the React frontend (neko)
// 3. Sets up system tray, native menu, and global shortcuts
// 4. Manages the full app lifecycle
//
import { app, ipcMain, globalShortcut, Notification, dialog, shell, clipboard, desktopCapturer, nativeImage } from 'electron';
import { IS_MAC, IS_WIN, IS_DEV, APP_NAME, APP_ID, BACKEND_URL, NEKO_DIST, FRONTEND_PORT } from './constants.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { togglePopup, closePopup } from './popup.js';
import { setupAutoUpdater, setupUpdaterIPC } from './updater.js';
import { startBackend, stopBackend, isBackendRunning } from './backend.js';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';

/** Check if something is already listening on a port */
function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}
import { createWindow, getMainWindow, showLoadingScreen } from './window.js';
import { createTray, updateTrayMenu, destroyTray, setAgentRunCount } from './tray.js';
import { buildAppMenu } from './menu.js';
import { applyAppIcon, getAppIcon, setAppIcon, resetAppIcon } from './icon.js';
import { initPet, destroyPetWindow, getPet, setPet, resetPet, setPetStatus } from './pet.js';

// ─── Single Instance Lock ─────────────────────────────────────────────────────
// Prevent multiple instances of the app from running.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.setName(APP_NAME);
if (IS_WIN) {
  app.setAppUserModelId(APP_ID);
}

// macOS: keep app running when all windows closed (tray icon stays)
app.on('window-all-closed', () => {
  if (!IS_MAC) {
    quitApp();
  }
});

// macOS: re-create window when dock icon clicked
app.on('activate', () => {
  if (!getMainWindow()) {
    bootApp();
  }
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

function setupPopupIPC() {
  ipcMain.handle('popup:status', () => ({ running: isBackendRunning() }));

  ipcMain.on('popup:new-chat', (_e, text) => {
    closePopup();
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
      win.webContents.send('menu:new-chat', text || '');
    } else {
      bootApp();
    }
  });

  ipcMain.on('popup:open-app', () => {
    closePopup();
    const win = getMainWindow();
    if (win) { win.show(); win.focus(); }
    else { bootApp(); }
  });

  ipcMain.on('popup:quit', () => {
    closePopup();
    quitApp();
  });
}

function setupIPC() {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:platform', () => process.platform);
  ipcMain.on('app:is-packaged', (event) => { event.returnValue = app.isPackaged; });

  ipcMain.handle('dialog:openDirectory', async (_event, opts = {}) => {
    const win = getMainWindow();
    return dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: opts.title || 'Select workspace folder',
      buttonLabel: opts.buttonLabel || 'Use as Workspace',
      defaultPath: opts.defaultPath || undefined,
    });
  });

  ipcMain.handle('backend:status', () => ({
    running: isBackendRunning(),
    url: BACKEND_URL,
  }));

  ipcMain.handle('backend:restart', async () => {
    await stopBackend();
    await startBackend();
    refreshTray();
    return { running: isBackendRunning() };
  });

  ipcMain.on('window:minimize', () => getMainWindow()?.minimize());
  ipcMain.on('window:maximize', () => {
    const win = getMainWindow();
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.on('window:close', () => getMainWindow()?.close());
  ipcMain.on('window:toggle-fullscreen', () => {
    const win = getMainWindow();
    if (win) win.setFullScreen(!win.isFullScreen());
  });

  ipcMain.on('notify', (_e, { title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });

  // App icon customization (dock / window / tray)
  ipcMain.handle('app:get-icon', () => getAppIcon());
  ipcMain.handle('app:set-icon', (_e, payload) => setAppIcon(payload));
  ipcMain.handle('app:reset-icon', () => resetAppIcon());
}

// ─── Terminal IPC ─────────────────────────────────────────────────────────────

const terminals = new Map(); // id → { pty, webContentsId }

function setupTerminalIPC() {
  let nodePty;
  try { nodePty = require('node-pty'); } catch { return; } // skip if not built

  ipcMain.handle('terminal:create', (event, opts = {}) => {
    const id = `term_${Date.now()}`;
    const shell = opts.shell || (IS_MAC ? '/bin/zsh' : process.env.COMSPEC || 'cmd.exe');
    const cwd = opts.cwd || process.env.HOME || process.cwd();
    const pty = nodePty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: opts.cols || 80,
      rows: opts.rows || 24,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    pty.onData((data) => {
      const wc = event.sender;
      if (!wc.isDestroyed()) wc.send(`terminal:data:${id}`, data);
    });
    pty.onExit(() => {
      const wc = event.sender;
      if (!wc.isDestroyed()) wc.send(`terminal:exit:${id}`);
      terminals.delete(id);
    });
    terminals.set(id, pty);
    return id;
  });

  ipcMain.on('terminal:input', (_event, id, data) => {
    terminals.get(id)?.write(data);
  });

  ipcMain.on('terminal:resize', (_event, id, cols, rows) => {
    terminals.get(id)?.resize(cols, rows);
  });

  ipcMain.on('terminal:kill', (_event, id) => {
    terminals.get(id)?.kill();
    terminals.delete(id);
  });
}

// ─── Desktop IPC (shell, clipboard, dialogs, screen capture, badge) ───────────

function setupDesktopIPC() {
  // Open a file/folder with the default OS app
  ipcMain.handle('shell:open', (_event, filePath) => shell.openPath(filePath));

  // Reveal a file in Finder / Explorer
  ipcMain.handle('shell:showInFolder', (_event, filePath) => {
    shell.showItemInFolder(filePath);
    return true;
  });

  // Read current clipboard text
  ipcMain.handle('clipboard:read', () => clipboard.readText());

  // Write to clipboard
  ipcMain.handle('clipboard:write', (_event, text) => {
    clipboard.writeText(text);
    return true;
  });

  // Native save-file dialog
  ipcMain.handle('dialog:saveFile', async (_event, opts = {}) => {
    const win = getMainWindow();
    return dialog.showSaveDialog(win, {
      title: opts.title || 'Save file',
      defaultPath: opts.defaultPath,
      filters: opts.filters,
      buttonLabel: opts.buttonLabel || 'Save',
    });
  });

  // Native open-files dialog (supports multi-select)
  ipcMain.handle('dialog:openFiles', async (_event, opts = {}) => {
    const win = getMainWindow();
    const props = ['openFile'];
    if (opts.multiSelections) props.push('multiSelections');
    return dialog.showOpenDialog(win, {
      title: opts.title || 'Open files',
      defaultPath: opts.defaultPath,
      filters: opts.filters,
      properties: props,
      buttonLabel: opts.buttonLabel || 'Open',
    });
  });

  // Capture the main window contents as a PNG data-URL
  ipcMain.handle('screen:captureWindow', async () => {
    const win = getMainWindow();
    if (!win) return null;
    const image = await win.webContents.capturePage();
    return image.toDataURL();
  });

  // Set the macOS dock badge count + tray tooltip, and drive the pet status.
  ipcMain.on('app:badge', (_event, count) => {
    const n = count || 0;
    if (app.setBadgeCount) app.setBadgeCount(n);
    setAgentRunCount(n);

    if (n > 0) {
      setPetStatus('working');
    } else if (prevRunCount > 0) {
      // A run just finished — flash a checkmark, then settle back to idle.
      setPetStatus('done');
      setTimeout(() => setPetStatus('idle'), 3000);
    } else {
      setPetStatus('idle');
    }
    prevRunCount = n;
  });

  // App icon + pet customization
  ipcMain.handle('pet:get', () => getPet());
  ipcMain.handle('pet:set', (_e, payload) => setPet(payload));
  ipcMain.handle('pet:reset', () => resetPet());
}

let prevRunCount = 0;

// ─── Tray Helpers ─────────────────────────────────────────────────────────────

function refreshTray() {
  updateTrayMenu({
    onQuit: quitApp,
    onShow: () => bootApp(),
    onRestartBackend: async () => {
      await stopBackend();
      await startBackend();
      refreshTray();
    },
  });
}

// ─── Frontend Static Server (production only) ────────────────────────────────
// In production, we serve neko/dist/ via a tiny HTTP server instead of using
// file:// protocol. This is because the frontend's API calls to localhost:8716
// are blocked by the browser when loaded from file:// (cross-origin).

let frontendServer = null;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

function startFrontendServer() {
  return new Promise((resolve, reject) => {
    if (frontendServer) { resolve(); return; }

    frontendServer = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (urlPath === '/') urlPath = '/index.html';

      const filePath = path.join(NEKO_DIST, urlPath);
      // Security: prevent directory traversal
      if (!filePath.startsWith(NEKO_DIST)) {
        res.writeHead(403); res.end(); return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback: serve index.html for any non-file route
          fs.readFile(path.join(NEKO_DIST, 'index.html'), (err2, html) => {
            if (err2) { res.writeHead(404); res.end('Not Found'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
          });
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    frontendServer.listen(FRONTEND_PORT, '127.0.0.1', () => {
      console.log(`[Asyncat] Frontend server on http://127.0.0.1:${FRONTEND_PORT}`);
      resolve();
    });

    frontendServer.on('error', (err) => {
      console.warn(`[Asyncat] Frontend server error: ${err.message}`);
      // Port might be in use from a previous run — try to load anyway
      resolve();
    });
  });
}

function stopFrontendServer() {
  return new Promise((resolve) => {
    if (!frontendServer) { resolve(); return; }
    frontendServer.close(() => resolve());
    frontendServer = null;
  });
}

// ─── Boot Sequence ────────────────────────────────────────────────────────────

async function bootApp() {
  // 1. Create the window immediately (shows loading screen)
  const win = createWindow();
  showLoadingScreen();

  // 2. Start the backend
  try {
    await startBackend();
    console.log('[Asyncat] Backend is healthy ✓');
  } catch (err) {
    console.error('[Asyncat] Failed to start backend:', err.message);
    dialog.showErrorBox(
      'Backend Start Failed',
      `Asyncat couldn't start the backend server.\n\n${err.message}\n\nTry restarting the app or check the logs.`
    );
  }

  // 3. Start the frontend server if no dev server is running on the frontend port
  const viteRunning = await isPortListening(FRONTEND_PORT);
  if (!viteRunning) {
    console.log('[Asyncat] No Vite dev server detected, starting static frontend server...');
    await startFrontendServer();
  } else {
    console.log('[Asyncat] Vite dev server detected on port', FRONTEND_PORT);
  }

  // 4. Load the frontend (always via HTTP to avoid file:// CORS issues)
  win.loadURL(`http://localhost:${FRONTEND_PORT}`);

  // 5. Notify the renderer that backend is ready
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('backend:ready');
  });

  refreshTray();
}

// ─── Quit Handler ─────────────────────────────────────────────────────────────

let isQuitting = false;

async function quitApp() {
  if (isQuitting) return;
  isQuitting = true;

  console.log('[Asyncat] Shutting down...');

  // Unregister global shortcuts
  globalShortcut.unregisterAll();

  // Stop servers gracefully
  await stopFrontendServer();
  await stopBackend();

  // Cleanup tray + pet
  destroyTray();
  destroyPetWindow();

  // Quit
  app.quit();
}

// Handle Cmd+Q / window close properly
app.on('before-quit', (event) => {
  if (!isQuitting) {
    event.preventDefault();
    quitApp();
  }
});

// ─── App Ready ────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Apply the user's saved app icon to the dock (window/tray are applied after boot).
  applyAppIcon();

  // Setup IPC handlers
  setupIPC();
  setupTerminalIPC();
  setupDesktopIPC();
  setupPopupIPC();
  setupUpdaterIPC();

  // Auto-update (packaged builds only — no-op in dev)
  setupAutoUpdater();

  // Build native menu
  buildAppMenu({
    onNewChat: () => {
      const win = getMainWindow();
      if (win) {
        win.webContents.send('menu:new-chat');
        win.show();
        win.focus();
      }
    },
    onSettings: async () => {
      const win = getMainWindow();
      if (win) {
        // Use JS navigation to handle SPA routing properly
        win.webContents.executeJavaScript(`window.location.hash = ''; window.history.pushState({}, '', '/settings');window.dispatchEvent(new PopStateEvent('popstate'));`).catch(() => {});
        win.show();
        win.focus();
      }
    },
    onRestartBackend: async () => {
      await stopBackend();
      await startBackend();
      refreshTray();
    },
  });

  // Create tray
  createTray({
    onQuit: quitApp,
    onShow: () => bootApp(),
    onRestartBackend: async () => {
      await stopBackend();
      await startBackend();
      refreshTray();
    },
    onTrayClick: (tray) => togglePopup(tray),
  });

  // Register global shortcut: Cmd/Ctrl+Shift+Space → toggle popup (quick agent)
  globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
    togglePopup(null);
  });

  // Register global shortcut: Cmd/Ctrl+Shift+A → toggle window
  globalShortcut.register('CmdOrCtrl+Shift+A', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isVisible() && win.isFocused()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    } else {
      bootApp();
    }
  });

  // Boot the app
  await bootApp();

  // Re-apply the saved icon now that the window and tray exist.
  applyAppIcon();

  // Spawn the pet overlay if the user enabled it.
  initPet();
});
