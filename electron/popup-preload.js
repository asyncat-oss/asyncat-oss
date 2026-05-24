// electron/popup-preload.js — IPC bridge for the tray popup window
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('asyncat', {
  getStatus: () => ipcRenderer.invoke('popup:status'),
  newChat:   (text) => ipcRenderer.send('popup:new-chat', text),
  openApp:   () => ipcRenderer.send('popup:open-app'),
  quit:      () => ipcRenderer.send('popup:quit'),
});
