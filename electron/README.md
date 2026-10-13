# electron/

This directory contains the Electron main-process code that wraps the asyncat desktop app.

| File | Role |
|---|---|
| `main.js` | App entry point. Boot sequence, IPC handlers (including the terminal PTY), webview security, the static frontend server, quit handler |
| `shortcuts.js` | Registers the system-wide shortcuts from `userData/shortcuts.json` and reports which ones took effect (Settings → Appearance) |
| `shortcut-config.js`, `shortcut-config.test.js` | Defaults and validation for those shortcuts, and their tests |
| `backend.js` | Spawns `den/src/index.js` with the bundled Node.js (packaged) or the system Node.js (dev), using `den/` or the user-data folder as its working directory. Polls `/health`, auto-restarts after crashes, writes `logs/backend-process.log`. With `--external-backend` (used by `npm run electron:dev`) it waits for the watch-mode dev backend instead |
| `window.js` | Creates the `BrowserWindow` and the loading screen shown while the backend starts |
| `tray.js` | System tray icon. Left-click opens quick chat; right-click shows Show / Restart Backend / Quit |
| `popup.js`, `popup.html`, `popup-preload.js` | Quick-chat popup (tray left-click or the quick-ask shortcut, `Cmd/Ctrl+Shift+Space` by default) |
| `pet.js`, `pet.html`, `pet-preload.js` | Optional always-on-top desktop companion that shows agent status |
| `menu.js` | Native OS menu bar with keyboard shortcuts |
| `preload.js` | Context-isolated bridge between the renderer and main process |
| `updater.js` | In-app updates from GitHub Releases (packaged builds): check, download, verify, install |
| `update-policy.js`, `update-policy.test.js` | Pure version, release and installer-asset selection helpers, and their tests |
| `update-install.js`, `update-install.test.js` | Pure download, checksum, install and clean-up helpers for the updater, and their tests |
| `update-rollback.js`, `update-rollback.test.js` | Keeps the previous AppImage as `<AppImage>.previous` until an update has started once, and offers to go back if it doesn't, and their tests |
| `update-check.js`, `update-check.test.js` | Cached release checks (ETag, saved in `update-check.json`) so checks don't use up GitHub's hourly limit, and their tests |
| `icon.js` | Lets users pick or upload the running app icon (Dock, window, tray) |
| `constants.js` | Shared paths, ports, and platform flags |

## Testing updates by hand

Development builds never check for updates, so the updater can only be tried
in a packaged build. To try it without publishing a real release:

1. Fork the repository (or make an empty one) and publish a GitHub release
   with a version higher than the build you are testing, for example
   `v9.0.0-beta.1` when testing a beta build. Attach the installer for your
   platform with the usual file name (`Asyncat-<version>-linux-x64.AppImage`,
   `-windows-x64.exe`, `-macos-arm64.dmg`, ...) and a `SHA256SUMS.txt` made with
   `sha256sum Asyncat-* > SHA256SUMS.txt`. GitHub also records each file's
   SHA-256 itself; an update with no checksum at all is refused.
2. Start the packaged app with `ASYNCAT_UPDATE_REPO` set to that repository:

   ```sh
   ASYNCAT_UPDATE_REPO=your-name/asyncat-oss ./Asyncat-0.8.0-beta.8-linux-x64.AppImage
   ```

   On Windows: `set ASYNCAT_UPDATE_REPO=your-name/asyncat-oss` in a Command
   Prompt, then start `Asyncat.exe` from the same window.

The value must be a plain `owner/repo`; anything else falls back to
`asyncat-oss/asyncat-oss`. A beta build is offered newer betas and stable
releases; a stable build only stable ones, so mark the test release as a
prerelease (or give it a `-beta` tag) only when testing a beta build.

For installation instructions, keyboard shortcuts, troubleshooting, and everything else, see the [root README](../README.md).
