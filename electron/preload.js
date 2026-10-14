// electron/preload.js — Secure bridge between renderer and main process
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const subscribe = (channel, listener) => {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── App Info ─────────────────────────────────────────────────────────
  getPlatform:    () => ipcRenderer.invoke('app:platform'),
  openUserDataFolder: () => ipcRenderer.invoke('app:open-user-data'),
  uninstallApp:   () => ipcRenderer.invoke('app:uninstall'),
  isElectron:     true,
  isPackaged:     ipcRenderer.sendSync('app:is-packaged'),

  // ─── System-wide Shortcuts ────────────────────────────────────────────
  getGlobalShortcuts:   () => ipcRenderer.invoke('shortcuts:get'),
  setGlobalShortcut:    (id, patch) => ipcRenderer.invoke('shortcuts:set', id, patch),
  resetGlobalShortcuts: () => ipcRenderer.invoke('shortcuts:reset'),

  // ─── Background running (Settings → Background) ───────────────────────
  getBackgroundSettings: () => ipcRenderer.invoke('background:get'),
  setBackgroundSettings: (patch) => ipcRenderer.invoke('background:set', patch),

  // ─── Navigation from the desktop (e.g. clicking a notification) ───────
  onNavigate: (callback) => subscribe('app:navigate', (_event, route) => callback(route)),
  // A new chat, with text to send in it or none (Quick ask's Ctrl+Enter, File → New Chat).
  onCompose: (cb) => subscribe('app:compose', (_event, payload) => cb(payload)),
  takeCompose: () => ipcRenderer.invoke('app:take-compose'),
  // `<command> --quick-ask` opens Quick ask; Settings shows it on Wayland.
  getQuickAskCommand: () => ipcRenderer.invoke('app:quick-ask-command'),

  // ─── Backend Status ───────────────────────────────────────────────────
  restartBackend:   () => ipcRenderer.invoke('backend:restart'),

  // ─── Native Dialogs ───────────────────────────────────────────────────
  openDirectory:    (opts) => ipcRenderer.invoke('dialog:openDirectory', opts),
  openFilesDialog:  (opts) => ipcRenderer.invoke('dialog:openFiles', opts),
  // The path on disk of a file or folder dropped onto the page (File.path is
  // gone in current Electron).
  getPathForFile:   (file) => {
    try { return webUtils.getPathForFile(file) || ''; } catch { return ''; }
  },

  // ─── Shell ────────────────────────────────────────────────────────────
  shellOpen:        (filePath) => ipcRenderer.invoke('shell:open', filePath),
  shellShowInFolder:(filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),
  openExternalUrl:  (url) => ipcRenderer.invoke('shell:openExternal', url),

  // ─── Built-in browser (tabs live in the main process: browserHost.js) ─
  clearBrowserData: (payload) => ipcRenderer.invoke('browser:clear-data', payload),
  browser: {
    getState:    () => ipcRenderer.invoke('browser:get-state'),
    // rect: the panel's page area in CSS pixels, or null to take the page off screen.
    setViewport: (payload) => ipcRenderer.invoke('browser:set-viewport', payload),
    ui:          (action, payload) => ipcRenderer.invoke('browser:ui', action, payload),
    onState:     (cb) => subscribe('browser:state', (_event, state) => cb(state)),
    onEvent:     (cb) => subscribe('browser:event', (_event, event) => cb(event)),
  },

  // ─── Dock Badge ───────────────────────────────────────────────────────
  setDockBadge:     (count) => ipcRenderer.send('app:badge', count),

  // ─── Native Notifications ─────────────────────────────────────────────
  showNotification: (title, body) => ipcRenderer.send('notify', { title, body }),

  // ─── Pet (on-screen companion) ────────────────────────────────────────
  getPet:   () => ipcRenderer.invoke('pet:get'),
  setPet:   (payload) => ipcRenderer.invoke('pet:set', payload),
  resetPet: () => ipcRenderer.invoke('pet:reset'),

  // ─── Auto-update ──────────────────────────────────────────────────────
  checkForUpdates:   (options) => ipcRenderer.invoke('update:check', options),
  getUpdateState:    () => ipcRenderer.invoke('update:get-state'),
  startUpdate:       () => ipcRenderer.invoke('update:start'),
  cancelUpdate:      () => ipcRenderer.invoke('update:cancel'),
  finishUpdate:      () => ipcRenderer.invoke('update:finish'),
  showUpdateFile:    () => ipcRenderer.invoke('update:show-file'),
  quitForUpdate:     () => ipcRenderer.invoke('update:quit'),
  downloadUpdate:    () => ipcRenderer.invoke('update:download'),
  openReleasesPage:  (url) => ipcRenderer.invoke('update:open-releases', url),

  // ─── Event Listeners ──────────────────────────────────────────────────
  onUpdateChecking:     (cb) => subscribe('update:checking', () => cb()),
  onUpdateAvailable:    (cb) => subscribe('update:available', (_e, info) => cb(info)),
  onUpdateNotAvailable: (cb) => subscribe('update:not-available', (_e, info) => cb(info)),
  onUpdateError:        (cb) => subscribe('update:error', (_e, msg) => cb(msg)),
  onUpdateDownloadState: (cb) => subscribe('update:download-state', (_e, state) => cb(state)),

  // ─── Terminal ─────────────────────────────────────────────────────────────
  terminalCreate:    (opts) => ipcRenderer.invoke('terminal:create', opts),
  terminalInput:     (id, data) => ipcRenderer.send('terminal:input', id, data),
  terminalResize:    (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
  terminalKill:      (id) => ipcRenderer.send('terminal:kill', id),
  onTerminalData:    (id, cb) => ipcRenderer.on(`terminal:data:${id}`, (_e, data) => cb(data)),
  onTerminalExit:    (id, cb) => ipcRenderer.on(`terminal:exit:${id}`, () => cb()),

  // ─── Cleanup ──────────────────────────────────────────────────────────
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
