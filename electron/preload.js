// electron/preload.js — Secure bridge between renderer and main process
const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel, listener) => {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── App Info ─────────────────────────────────────────────────────────
  getAppVersion:  () => ipcRenderer.invoke('app:version'),
  getPlatform:    () => ipcRenderer.invoke('app:platform'),
  isElectron:     true,
  isPackaged:     ipcRenderer.sendSync('app:is-packaged'),

  // ─── Window Controls ──────────────────────────────────────────────────
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),
  toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),

  // ─── Backend Status ───────────────────────────────────────────────────
  getBackendStatus: () => ipcRenderer.invoke('backend:status'),
  restartBackend:   () => ipcRenderer.invoke('backend:restart'),

  // ─── Native Dialogs ───────────────────────────────────────────────────
  openDirectory:    (opts) => ipcRenderer.invoke('dialog:openDirectory', opts),
  saveFileDialog:   (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  openFilesDialog:  (opts) => ipcRenderer.invoke('dialog:openFiles', opts),

  // ─── Shell ────────────────────────────────────────────────────────────
  shellOpen:        (filePath) => ipcRenderer.invoke('shell:open', filePath),
  shellShowInFolder:(filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),

  // ─── Clipboard ────────────────────────────────────────────────────────
  clipboardRead:    () => ipcRenderer.invoke('clipboard:read'),
  clipboardWrite:   (text) => ipcRenderer.invoke('clipboard:write', text),

  // ─── Screen Capture ───────────────────────────────────────────────────
  captureScreen:    () => ipcRenderer.invoke('screen:captureWindow'),

  // ─── Dock Badge ───────────────────────────────────────────────────────
  setDockBadge:     (count) => ipcRenderer.send('app:badge', count),

  // ─── Native Notifications ─────────────────────────────────────────────
  showNotification: (title, body) => ipcRenderer.send('notify', { title, body }),

  // ─── App Icon ─────────────────────────────────────────────────────────
  getAppIcon:   () => ipcRenderer.invoke('app:get-icon'),
  setAppIcon:   (payload) => ipcRenderer.invoke('app:set-icon', payload),
  resetAppIcon: () => ipcRenderer.invoke('app:reset-icon'),

  // ─── Pet (on-screen companion) ────────────────────────────────────────
  getPet:   () => ipcRenderer.invoke('pet:get'),
  setPet:   (payload) => ipcRenderer.invoke('pet:set', payload),
  resetPet: () => ipcRenderer.invoke('pet:reset'),

  // ─── Auto-update ──────────────────────────────────────────────────────
  checkForUpdates:   () => ipcRenderer.invoke('update:check'),
  downloadUpdate:    () => ipcRenderer.invoke('update:download'),
  installUpdate:     () => ipcRenderer.invoke('update:install'),
  openReleasesPage:  () => ipcRenderer.invoke('update:open-releases'),

  // ─── Event Listeners ──────────────────────────────────────────────────
  onBackendReady:       (cb) => subscribe('backend:ready', () => cb()),
  onBackendError:       (cb) => subscribe('backend:error', (_e, msg) => cb(msg)),
  onUpdateChecking:     (cb) => subscribe('update:checking', () => cb()),
  onUpdateAvailable:    (cb) => subscribe('update:available', (_e, info) => cb(info)),
  onUpdateNotAvailable: (cb) => subscribe('update:not-available', (_e, info) => cb(info)),
  onUpdateProgress:     (cb) => subscribe('update:progress', (_e, p) => cb(p)),
  onUpdateDownloaded:   (cb) => subscribe('update:downloaded', (_e, info) => cb(info)),
  onUpdateError:        (cb) => subscribe('update:error', (_e, msg) => cb(msg)),

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
