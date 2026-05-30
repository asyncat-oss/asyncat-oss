// electron/pet-preload.js — bridge for the pet overlay window
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  onInit:   (cb) => ipcRenderer.on('pet:init', (_e, data) => cb(data)),
  onStatus: (cb) => ipcRenderer.on('pet:status', (_e, status) => cb(status)),
});
