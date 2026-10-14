// electron/tray-menu.js — The tray menu's items (tray.js builds the menu).
//
// No Electron imports, so it can be unit-tested with plain node.

/**
 * The menu template. `showQuickAsk` adds the Quick ask item (Linux, where the
 * menu is the only way into it); every callback is called with no arguments.
 */
export function trayMenuTemplate({
  backendRunning = false,
  showQuickAsk = false,
  onShowWindow,
  onQuickAsk,
  onShow,
  onRestartBackend,
  onQuit,
} = {}) {
  return [
    { label: 'Show Asyncat', click: () => onShowWindow?.() },
    ...(showQuickAsk && onQuickAsk ? [{ label: 'Quick ask', click: () => onQuickAsk() }] : []),
    { label: 'Cats', click: () => onShow?.('/cats') },
    { type: 'separator' },
    { label: backendRunning ? 'Asyncat is running' : "Asyncat's server is stopped", enabled: false },
    { label: 'Restart Backend', click: () => onRestartBackend?.() },
    { type: 'separator' },
    { label: 'Quit Asyncat', click: () => onQuit?.() },
  ];
}
