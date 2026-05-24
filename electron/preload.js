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

  // ─── Native Notifications ─────────────────────────────────────────────
  showNotification: (title, body) => ipcRenderer.send('notify', { title, body }),

  // ─── Event Listeners ──────────────────────────────────────────────────
  onBackendReady:    (cb) => ipcRenderer.on('backend:ready', () => cb()),
  onBackendError:    (cb) => ipcRenderer.on('backend:error', (_e, msg) => cb(msg)),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, info) => cb(info)),

  // ─── Cleanup ──────────────────────────────────────────────────────────
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
