// electron/preload.js — Secure bridge between renderer and main process
const { contextBridge, ipcRenderer } = require('electron');

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

  // ─── Auto-update ──────────────────────────────────────────────────────
  checkForUpdates:   () => ipcRenderer.invoke('update:check'),
  downloadUpdate:    () => ipcRenderer.invoke('update:download'),
  installUpdate:     () => ipcRenderer.invoke('update:install'),
  openReleasesPage:  () => ipcRenderer.invoke('update:open-releases'),

  // ─── Event Listeners ──────────────────────────────────────────────────
  onBackendReady:       (cb) => ipcRenderer.on('backend:ready', () => cb()),
  onBackendError:       (cb) => ipcRenderer.on('backend:error', (_e, msg) => cb(msg)),
  onUpdateChecking:     (cb) => ipcRenderer.on('update:checking', () => cb()),
  onUpdateAvailable:    (cb) => ipcRenderer.on('update:available', (_e, info) => cb(info)),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update:not-available', (_e, info) => cb(info)),
  onUpdateProgress:     (cb) => ipcRenderer.on('update:progress', (_e, p) => cb(p)),
  onUpdateDownloaded:   (cb) => ipcRenderer.on('update:downloaded', (_e, info) => cb(info)),
  onUpdateError:        (cb) => ipcRenderer.on('update:error', (_e, msg) => cb(msg)),

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
