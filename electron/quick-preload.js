// electron/quick-preload.js — Bridge for the Quick ask window (quick.js). It is
// named electronAPI like the main window's, so shared helpers such as
// openWebLink work unchanged.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, fn) => {
  const listener = (_event, payload) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  openExternalUrl: (url) => ipcRenderer.invoke('shell:openExternal', url),
  quick: {
    ready: () => ipcRenderer.send('quick:ready'),
    resize: (height) => ipcRenderer.send('quick:resize', height),
    setState: (state) => ipcRenderer.send('quick:state', state), // 'empty' | 'thread' | 'busy'
    setBackground: (color) => ipcRenderer.send('quick:background', color), // Windows only
    hide: () => ipcRenderer.send('quick:hide'),
    openInApp: (route) => ipcRenderer.send('quick:open-in-app', route),
    sendToApp: (text) => ipcRenderer.send('quick:send-to-app', text),
    onShown: (cb) => on('quick:shown', cb),
    onHidden: (cb) => on('quick:hidden', cb),
  },
});
