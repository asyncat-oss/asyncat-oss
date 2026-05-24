# electron/

This directory contains the Electron main-process code that wraps the asyncat desktop app.

| File | Role |
|---|---|
| `main.js` | App entry point. Boot sequence, IPC handlers, global shortcuts, quit handler |
| `backend.js` | Spawns `den/src/index.js` as a child process using the system Node.js. Handles health polling and auto-restart |
| `window.js` | Creates the `BrowserWindow` and the loading screen shown while the backend starts |
| `tray.js` | System tray icon and context menu |
| `menu.js` | Native OS menu bar with keyboard shortcuts |
| `preload.js` | Context-isolated bridge between the renderer and main process |
| `constants.js` | Shared paths, ports, and platform flags |

For installation instructions, keyboard shortcuts, troubleshooting, and everything else, see the [root README](../README.md).
