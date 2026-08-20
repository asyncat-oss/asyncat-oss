// electron/main.js — Asyncat Desktop App entry point
//
// This is the Electron main process. It:
// 1. Starts the Express backend (den) as a child process
// 2. Creates a BrowserWindow to load the React frontend (neko)
// 3. Sets up system tray, native menu, and global shortcuts
// 4. Manages the full app lifecycle
//
import { app, ipcMain, globalShortcut, Notification, dialog, shell, clipboard, desktopCapturer, nativeImage, session, webContents } from 'electron';
import { IS_MAC, IS_WIN, IS_DEV, APP_NAME, WINDOWS_APP_ID, ICONS, BACKEND_URL, NEKO_DIST, FRONTEND_PORT } from './constants.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { togglePopup, closePopup } from './popup.js';
import { setupAutoUpdater, setupUpdaterIPC } from './updater.js';
import { startBackend, stopBackend, isBackendRunning } from './backend.js';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

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
  app.setAppUserModelId(WINDOWS_APP_ID);
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
      title: opts.title || 'Choose a Project folder',
      buttonLabel: opts.buttonLabel || 'Choose Folder',
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
      const icon = nativeImage.createFromPath(ICONS.window);
      new Notification({ title, body, ...(icon.isEmpty() ? {} : { icon }) }).show();
    }
  });

  // App icon customization (dock / window / tray)
  ipcMain.handle('app:get-icon', () => getAppIcon());
  ipcMain.handle('app:set-icon', (_e, payload) => setAppIcon(payload));
  ipcMain.handle('app:reset-icon', () => resetAppIcon());
}

// ─── Terminal IPC ─────────────────────────────────────────────────────────────

const terminals = new Map(); // id -> { pty, ownerId }
const terminalOwners = new Map(); // webContentsId -> Set<terminalId>

function findExecutable(names = []) {
  const pathEntries = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const extensions = IS_WIN ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const name of names) {
    if (!name) continue;
    if (path.isAbsolute(name) && fs.existsSync(name)) return name;
    for (const directory of pathEntries) {
      for (const extension of extensions) {
        const candidate = path.join(directory, IS_WIN && !path.extname(name) ? `${name}${extension.toLowerCase()}` : name);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

function resolveTerminalShell(requested = 'auto') {
  if (IS_WIN) {
    const choices = {
      pwsh: ['pwsh.exe'],
      powershell: ['powershell.exe'],
      cmd: [process.env.COMSPEC, 'cmd.exe'],
      auto: ['pwsh.exe', 'powershell.exe', process.env.COMSPEC, 'cmd.exe'],
    };
    return findExecutable(choices[requested] || choices.auto) || process.env.COMSPEC || 'cmd.exe';
  }
  if (IS_MAC) {
    const choices = { zsh: ['/bin/zsh', 'zsh'], bash: ['/bin/bash', 'bash'], auto: [process.env.SHELL, '/bin/zsh', '/bin/bash'] };
    return findExecutable(choices[requested] || choices.auto) || '/bin/zsh';
  }
  const choices = { bash: [process.env.SHELL, '/bin/bash', 'bash'], zsh: [process.env.SHELL, '/bin/zsh', 'zsh'], auto: [process.env.SHELL, '/bin/bash', '/bin/sh'] };
  return findExecutable(choices[requested] || choices.auto) || '/bin/sh';
}

function removeTerminalRecord(id) {
  const record = terminals.get(id);
  if (!record) return;
  terminals.delete(id);
  const owned = terminalOwners.get(record.ownerId);
  owned?.delete(id);
  if (owned?.size === 0) terminalOwners.delete(record.ownerId);
}

function cleanupTerminalsForOwner(ownerId) {
  const ids = [...(terminalOwners.get(ownerId) || [])];
  ids.forEach((id) => {
    try { terminals.get(id)?.pty?.kill(); } catch { /* process already exited */ }
    removeTerminalRecord(id);
  });
}

function setupTerminalIPC() {
  let nodePty;
  try { nodePty = require('node-pty'); } catch { return; } // skip if not built

  ipcMain.handle('terminal:create', (event, opts = {}) => {
    const id = `term_${randomUUID()}`;
    const ownerId = event.sender.id;
    const shellPath = resolveTerminalShell(opts.shell);
    const requestedCwd = typeof opts.cwd === 'string' ? path.resolve(opts.cwd) : null;
    const cwd = requestedCwd && fs.existsSync(requestedCwd) && fs.statSync(requestedCwd).isDirectory()
      ? requestedCwd
      : app.getPath('home');
    const pty = nodePty.spawn(shellPath, [], {
      name: 'xterm-256color',
      cols: Math.min(500, Math.max(2, Number(opts.cols) || 80)),
      rows: Math.min(300, Math.max(1, Number(opts.rows) || 24)),
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
      removeTerminalRecord(id);
    });
    terminals.set(id, { pty, ownerId });
    if (!terminalOwners.has(ownerId)) {
      terminalOwners.set(ownerId, new Set());
      event.sender.once('destroyed', () => cleanupTerminalsForOwner(ownerId));
    }
    terminalOwners.get(ownerId).add(id);
    return { id, shell: shellPath, cwd };
  });

  ipcMain.on('terminal:input', (event, id, data) => {
    const record = terminals.get(id);
    if (record?.ownerId === event.sender.id && typeof data === 'string') record.pty.write(data);
  });

  ipcMain.on('terminal:resize', (event, id, cols, rows) => {
    const record = terminals.get(id);
    if (record?.ownerId !== event.sender.id) return;
    const safeCols = Math.min(500, Math.max(2, Number(cols) || 80));
    const safeRows = Math.min(300, Math.max(1, Number(rows) || 24));
    record.pty.resize(safeCols, safeRows);
  });

  ipcMain.on('terminal:kill', (event, id) => {
    const record = terminals.get(id);
    if (record?.ownerId !== event.sender.id) return;
    record.pty.kill();
    removeTerminalRecord(id);
  });
}

// ─── Embedded browser security, sessions, and downloads ───────────────────────

const BROWSER_PARTITIONS = new Set(['asyncat-web-private', 'persist:asyncat-web']);
const browserPolicies = new Map();
const configuredBrowserSessions = new Set();
const configuredBrowserGuests = new Set();
const browserPermissionGrants = new Map();

function isAllowedBrowserUrl(value, { allowBlank = true } = {}) {
  if (allowBlank && value === 'about:blank') return true;
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAllowedBrowserPartition(partition) {
  return BROWSER_PARTITIONS.has(partition)
    || /^asyncat-web-incognito-[a-zA-Z0-9-]{8,120}$/.test(String(partition || ''));
}

function sendBrowserEvent(channel, payload) {
  const win = getMainWindow();
  if (win && !win.webContents.isDestroyed()) win.webContents.send(channel, payload);
}

function setupBrowserSession(partition) {
  if (configuredBrowserSessions.has(partition)) return session.fromPartition(partition);
  configuredBrowserSessions.add(partition);
  const browserSession = session.fromPartition(partition);
  const quietPermissions = new Set(['fullscreen', 'clipboard-sanitized-write']);
  const promptPermissions = new Set(['media', 'geolocation', 'notifications', 'midiSysex', 'pointerLock']);
  const permissionGrants = new Set();
  browserPermissionGrants.set(partition, permissionGrants);
  const permissionKey = (origin, permission) => `${origin || 'unknown'}|${permission}`;

  browserSession.setPermissionCheckHandler((_guest, permission, requestingOrigin) => (
    quietPermissions.has(permission) || permissionGrants.has(permissionKey(requestingOrigin, permission))
  ));

  browserSession.setPermissionRequestHandler(async (_guest, permission, callback, details) => {
    if (quietPermissions.has(permission)) {
      callback(true);
      return;
    }
    if (!promptPermissions.has(permission)) {
      callback(false);
      return;
    }
    let host = 'This site';
    let origin = details.requestingUrl || details.securityOrigin || '';
    try {
      const parsed = new URL(origin);
      host = parsed.host || host;
      origin = parsed.origin;
    } catch { /* use generic host */ }
    const result = await dialog.showMessageBox(getMainWindow(), {
      type: 'question',
      title: 'Website permission',
      message: `${host} wants permission to use ${permission}.`,
      detail: 'Only allow this if you trust the site and expected the request.',
      buttons: ['Block', 'Allow'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    const granted = result.response === 1;
    if (granted) permissionGrants.add(permissionKey(origin, permission));
    callback(granted);
  });

  browserSession.on('will-download', (_event, item) => {
    const id = `download_${randomUUID()}`;
    const snapshot = (state) => ({
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
      savePath: item.getSavePath() || '',
      state,
    });
    sendBrowserEvent('browser:download', snapshot('progressing'));
    item.on('updated', (_downloadEvent, state) => sendBrowserEvent('browser:download', snapshot(state)));
    item.once('done', (_downloadEvent, state) => sendBrowserEvent('browser:download', snapshot(state)));
  });

  return browserSession;
}

function configureBrowserGuest(guest) {
  if (!guest || guest.isDestroyed() || configuredBrowserGuests.has(guest.id)) return;
  configuredBrowserGuests.add(guest.id);
  browserPolicies.set(guest.id, 'internal');

  guest.setWindowOpenHandler(({ url }) => {
    if (!isAllowedBrowserUrl(url, { allowBlank: false })) return { action: 'deny' };
    if (browserPolicies.get(guest.id) === 'system') shell.openExternal(url).catch(() => {});
    else sendBrowserEvent('browser:open-tab', url);
    return { action: 'deny' };
  });

  guest.on('will-navigate', (event, url) => {
    if (!isAllowedBrowserUrl(url)) event.preventDefault();
  });
  guest.on('will-redirect', (event, url) => {
    if (!isAllowedBrowserUrl(url)) event.preventDefault();
  });
  guest.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const command = input.control || input.meta;
    const key = String(input.key || '').toLowerCase();
    let shortcut = null;
    if (key === 'f11') shortcut = 'toggle-fullscreen';
    else if (key === 'escape') shortcut = 'exit-fullscreen';
    else if (command && input.shift && key === 't') shortcut = 'reopen-tab';
    else if (command && key === 'l') shortcut = 'focus-location';
    else if (command && key === 't') shortcut = 'new-tab';
    else if (command && key === 'w') shortcut = 'close-tab';
    else if (command && key === 'r') shortcut = 'reload';
    else if (command && key === 'h') shortcut = 'history';
    else if (command && key === 'f') shortcut = 'find';
    if (shortcut) {
      // Let the page receive Escape as well (dialogs and native HTML fullscreen
      // rely on it); the renderer only acts on it when browser fullscreen is on.
      if (shortcut !== 'exit-fullscreen') event.preventDefault();
      sendBrowserEvent('browser:shortcut', shortcut);
      return;
    }
    if (input.alt && (key === 'left' || key === 'arrowleft') && guest.canGoBack()) { event.preventDefault(); guest.goBack(); }
    if (input.alt && (key === 'right' || key === 'arrowright') && guest.canGoForward()) { event.preventDefault(); guest.goForward(); }
  });

  guest.once('destroyed', () => {
    configuredBrowserGuests.delete(guest.id);
    browserPolicies.delete(guest.id);
  });
}

function setupBrowserSecurity() {
  BROWSER_PARTITIONS.forEach(setupBrowserSession);

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event, webPreferences, params) => {
      if (!isAllowedBrowserPartition(params.partition) || !isAllowedBrowserUrl(params.src)) {
        event.preventDefault();
        return;
      }
      setupBrowserSession(params.partition);
      delete webPreferences.preload;
      delete webPreferences.preloadURL;
      webPreferences.nodeIntegration = false;
      webPreferences.nodeIntegrationInSubFrames = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      webPreferences.webSecurity = true;
      webPreferences.allowRunningInsecureContent = false;
    });
    if (contents.getType() === 'webview') configureBrowserGuest(contents);
  });

  ipcMain.handle('browser:configure-webview', (event, payload = {}) => {
    const guestId = Number(payload.webContentsId);
    const guest = Number.isInteger(guestId) ? webContents.fromId(guestId) : null;
    if (!guest || guest.getType() !== 'webview' || guest.hostWebContents?.id !== event.sender.id) return false;
    configureBrowserGuest(guest);
    browserPolicies.set(guestId, payload.openLinks === 'system' ? 'system' : 'internal');
    return true;
  });

  ipcMain.handle('browser:clear-data', async (_event, payload = {}) => {
    let partitions;
    if (payload.partition) {
      if (!isAllowedBrowserPartition(payload.partition)) return false;
      partitions = [payload.partition];
    } else if (payload.profile === 'persistent') {
      partitions = ['persist:asyncat-web'];
    } else {
      partitions = [...configuredBrowserSessions].filter((partition) => partition === 'asyncat-web-private' || partition.startsWith('asyncat-web-incognito-'));
    }
    await Promise.all(partitions.flatMap((partition) => {
      const browserSession = setupBrowserSession(partition);
      browserPermissionGrants.get(partition)?.clear();
      return [browserSession.clearCache(), browserSession.clearStorageData()];
    }));
    return true;
  });
}

// ─── Desktop IPC (shell, clipboard, dialogs, screen capture, badge) ───────────

function setupDesktopIPC() {
  // Open a file/folder with the default OS app
  ipcMain.handle('shell:open', (_event, filePath) => shell.openPath(filePath));

  // Open a validated web URL in the default OS browser.
  ipcMain.handle('shell:openExternal', async (_event, url) => {
    if (!isAllowedBrowserUrl(url, { allowBlank: false })) return false;
    await shell.openExternal(url);
    return true;
  });

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
// file:// protocol. This is because the frontend's local API calls
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
  const frontendHost = viteRunning ? 'localhost' : '127.0.0.1';
  win.loadURL(`http://${frontendHost}:${FRONTEND_PORT}`);

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
  setupBrowserSecurity();
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
