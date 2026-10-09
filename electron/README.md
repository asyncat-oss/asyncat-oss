# electron/

This directory contains the Electron main-process code that wraps the asyncat desktop app.

| File | Role |
|---|---|
| `main.js` | App entry point. Boot sequence, IPC handlers (including the terminal PTY), webview security, global shortcuts, the static frontend server, quit handler |
| `backend.js` | Spawns `den/src/index.js` with the bundled Node.js (packaged) or the system Node.js (dev), using `den/` or the user-data folder as its working directory. Polls `/health`, auto-restarts after crashes, writes `logs/backend-process.log`. With `--external-backend` (used by `npm run electron:dev`) it waits for the watch-mode dev backend instead |
| `window.js` | Creates the `BrowserWindow` and the loading screen shown while the backend starts |
| `tray.js` | System tray icon. Left-click opens quick chat; right-click shows Show / Restart Backend / Quit |
| `popup.js`, `popup.html`, `popup-preload.js` | Quick-chat popup (tray left-click or `Cmd/Ctrl+Shift+Space`) |
| `pet.js`, `pet.html`, `pet-preload.js` | Optional always-on-top desktop companion that shows agent status |
| `menu.js` | Native OS menu bar with keyboard shortcuts |
| `preload.js` | Context-isolated bridge between the renderer and main process |
| `updater.js` | Assisted update checks against GitHub Releases (packaged builds) |
| `update-policy.js`, `update-policy.test.js` | Pure version and installer-asset selection helpers, and their tests |
| `icon.js` | Lets users pick or upload the running app icon (Dock, window, tray) |
| `constants.js` | Shared paths, ports, and platform flags |

For installation instructions, keyboard shortcuts, troubleshooting, and everything else, see the [root README](../README.md).
