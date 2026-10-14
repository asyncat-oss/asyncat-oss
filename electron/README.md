# electron/

This directory contains the Electron main-process code that wraps the asyncat desktop app.

| File | Role |
|---|---|
| `main.js` | App entry point. Boot sequence, IPC handlers (including the terminal PTY), webview security, the static frontend server, quit handler |
| `shortcuts.js` | Registers the system-wide shortcuts from `userData/shortcuts.json` and reports which ones took effect (Settings → Appearance) |
| `shortcut-config.js`, `shortcut-config.test.js` | Defaults and validation for those shortcuts, and their tests |
| `backend.js` | Spawns `den/src/index.js` with the bundled Node.js (packaged) or the system Node.js (dev), using `den/` or the user-data folder as its working directory. Polls `/health`, auto-restarts after crashes, writes `logs/backend-process.log`. With `--external-backend` (used by `npm run electron:dev`) it waits for the watch-mode dev backend instead |
| `window.js` | Creates the `BrowserWindow` and the loading screen shown while the backend starts |
| `tray.js`, `tray-menu.js` (with tests) | System tray icon. Left-click opens Quick ask; the menu has Show, Cats, Restart Backend and Quit, plus Quick ask on Linux (where the menu is always attached, since most desktops don't pass clicks on) |
| `background.js` | Whether closing the window quits or leaves Asyncat in the tray for Cats (`userData/background.json`, Settings → Background), the one-time "still running" notice, and starting at login hidden in the tray (`--hidden`; on Linux `~/.config/autostart/asyncat.desktop`) |
| `background-config.js`, `background-config.test.js` | The rules and file formats behind `background.js`, and their tests |
| `hostBridge.js` | Long-polls the backend for notifications and requests only the desktop app can serve (see `den/src/lib/hostBridge.js`); the backend also reports how many Cats are on |
| `browserHost.js` | The built-in browser: tabs as views in the main window, the user's tabs and the hidden ones agents drive, Cats' own profiles, approval for sensitive steps (passwords, card numbers, buy or delete buttons), and the address rules for agent tabs (sites blocked in Settings → Privacy & safety, a Cat's own list) |
| `browserPolicy.js`, `browserPolicy.test.js` | Pure rules behind it: which addresses a tab may load, profiles and partitions, a Cat's site list, and their tests |
| `browserTabsStore.js`, `browserTabsStore.test.js` | Saves the user's Standard tabs and reopens them asleep at the next start (never Incognito, agent or Cat tabs), and their tests |
| `browserCdp.js`, `browserSnapshot.js` (with tests) | How agents read and use a page: the DevTools protocol, and the page outline with element references |
| `secretKey.js` | The key that encrypts saved API keys and tokens, locked by the system keychain (handed to the backend at start) |
| `quick.js`, `quick-preload.js` | Quick ask: a frameless window showing the app's `/quick` page (`neko/src/quick/`), made on first use and then hidden and shown. Opens from the tray, the quick-ask shortcut (`Cmd/Ctrl+Shift+Space` by default) or `--quick-ask` (for Wayland desktops, where global shortcuts may not reach apps); answers stream in it and are saved as chats |
| `quick-geometry.js`, `quick-geometry.test.js` | Its size, position and show/hide rules, and their tests |
| `navigation.js`, `navigation.test.js` | Keeps the main and Quick ask windows on the app's pages; other links open in the system browser |
| `pet.js`, `pet.html`, `pet-preload.js` | Optional always-on-top desktop companion that shows agent status |
| `menu.js` | Native OS menu bar with keyboard shortcuts |
| `preload.js` | Context-isolated bridge between the renderer and main process |
| `folder-open.js`, `folder-open.test.js` | What the page may open with `shell:open`: folders only, never a file (or a macOS app), and their tests |
| `updater.js` | In-app updates from GitHub Releases (packaged builds): check, download, verify, install |
| `update-policy.js`, `update-policy.test.js` | Pure version, release and installer-asset selection helpers, and their tests |
| `update-install.js`, `update-install.test.js` | Pure download, checksum, install and clean-up helpers for the updater, and their tests |
| `update-rollback.js`, `update-rollback.test.js` | Keeps the previous AppImage as `<AppImage>.previous` until an update has started once, and offers to go back if it doesn't, and their tests |
| `update-check.js`, `update-check.test.js` | Cached release checks (ETag, saved in `update-check.json`) so checks don't use up GitHub's hourly limit, and their tests |
| `icon.js` | Lets users pick or upload the running app icon (Dock, window, tray) |
| `constants.js` | Shared paths, ports, and platform flags |

## Quick ask on Wayland

Wayland doesn't let an app place its own windows, so the desktop decides
where Quick ask goes. Global shortcuts may not reach the app either: bind the
command that **Settings → Appearance** shows (it ends in `--quick-ask`) in
the desktop's keyboard settings instead.

On Hyprland the window floats (it has a fixed size), but Hyprland keeps a
floating window centred when it changes size, so the input moves up as an
answer comes in and back down after `Ctrl+N`. This is a known limitation: no
window rule can pin the top edge, and a resizable window doesn't help
(Hyprland then ignores the size the app asks for and tiles the window). A
rule still keeps it on every workspace without a border. With a Lua config
(`hyprland.lua`):

```lua
hl.window_rule({ match = { title = "^(Asyncat Quick ask)$" }, float = true, pin = true, decorate = false })
hl.bind("SUPER + SHIFT + Space", hl.dsp.exec_cmd("/path/to/Asyncat.AppImage --quick-ask"))
```

With a `hyprland.conf`, write the same rule (match the title, float, pin, no
decorations) and binding in your version's syntax.

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
