# asyncat

**A local-first AI agent desktop app.** 211 tools. 49 skills. Self-improving. Desktop automation. Fully offline.

> **v0.7.3** · MIT · [Install](#quick-start) · [Website](https://asyncat.com)

![asyncat home screen](neko/public/image.png)

---

## What asyncat is

asyncat is a full-stack AI agent you run on your own hardware as a **native desktop application** (powered by Electron). It bundles a backend API engine (`den`) and a React web interface (`neko`) into a single installable app. You connect any model — local or cloud — and it can do real work on your machine.

It is not a chatbot wrapper. It controls your screen, writes and runs code, manages files, schedules recurring jobs, and gets better over time through a self-improving engine called Basal Ganglia.

---

## What's inside

| | |
|---|---|
| **210 tools** | Files, shell, git, browser, Docker, screen, keyboard, memory, RAG, notes, kanban, system, network, audio, image, code analysis, sandboxes, scheduler |
| **49 bundled skills** | Reusable instruction modules: code review, debugging, TDD, deployment, security audit, incident response, data engineering, and more |
| **Basal Ganglia** | Watches tool patterns across sessions. After 3 successful runs of the same sequence it synthesizes a new skill automatically. No annotation, no config |
| **4 agent modes** | `chat` (no tools), `plan` (no mutations), `action` (full ReAct loop), `design` (reads only) |
| **20+ providers** | OpenAI, Anthropic, Gemini, Ollama, llama.cpp, MLX, LM Studio, OpenRouter, DeepSeek, Groq, Together AI, Mistral, Perplexity, Cohere, and more |
| **Agent profiles** | Bundle a soul, working directory, tool permissions, and max rounds into named configurations. Switch profiles per task |
| **Desktop automation** | Click, type, read screen content via OCR, focus windows — controls your actual machine |
| **Sandboxes** | Isolated workspace copies. Review changes as a unified diff. Apply or discard. Commit to a branch |
| **Scheduler** | Cron-based recurring agent jobs. Pick a profile and a model per job |
| **MCP support** | Configure MCP servers via `data/mcp.json`. Manage from the UI or API |
| **Persistent memory** | SQLite-backed key-value memory with types: `user`, `feedback`, `project`, `reference`, `fact`, `preference`, `context`, `task_state` |
| **Workspace** | Notes (markdown, delta-based, export to DOCX/PDF), Kanban (columns, cards, checklists) |
| **System tray** | Lives in your menu bar. Close the window — the agent keeps running. Reopen with a click |
| **Global shortcut** | `Cmd+Shift+A` / `Ctrl+Shift+A` summons Asyncat from any app, any context |
| **Native notifications** | System-level alerts when your agent finishes a job or hits an error |
| **Fully offline** | Every feature works with local models. No data leaves your machine |

---

## Why a desktop app?

Moving from a web app to a native desktop app unlocks things that aren't possible in a browser:

- **Global keyboard shortcut** — `Cmd/Ctrl+Shift+A` brings Asyncat up from anywhere on your machine, whether you're in a code editor, a terminal, or a browser. No alt-tabbing to find the right tab.
- **System tray** — The agent lives in your menu bar. Close the window and it keeps running in the background. Click the tray icon to bring it back.
- **Native notifications** — When a long-running agent finishes (or breaks something), you get a real OS notification, not a browser popup that requires a permission grant.
- **No browser security sandbox** — Screen capture, keyboard control, OCR, and desktop automation tools run without the restrictions that a browser tab imposes.
- **Single instance** — One Asyncat, always. The OS prevents you from accidentally opening duplicates.
- **Auto-restart backend** — If the backend crashes, Electron detects it and restarts it automatically. No terminal babysitting.
- **Native menus** — Standard keyboard shortcuts (`Cmd+N` for new chat, `Cmd+,` for settings) work as expected, integrated into the OS menu bar.

---

## Quick Start

### Requirements

**Pre-built installers:** no prerequisites. Download, open, run.

**Run from source:** Node.js `20.19+`, npm, git.

### Install & Run

#### 1. Pre-built Installers (Easiest)

Download the latest native package for your system from the **Releases** page:

- **macOS**: `.dmg` (x64 / arm64 Apple Silicon)
- **Windows**: `.exe` (NSIS installer)
- **Linux**: `.AppImage` or `.deb`

> See [Code Signing Warnings](#-code-signing-warnings) below — macOS and Windows will show a security warning on first launch. This is expected for unsigned open-source software. The workarounds are straightforward.

#### 2. Run from Source (Developer Mode)

```bash
# Clone the repository
git clone https://github.com/asyncat-oss/asyncat-oss.git
cd asyncat-oss

# Install dependencies
npm install

# Rebuild native SQLite/Puppeteer modules for Electron's Node version
npm run electron:rebuild

# Launch dev server + Electron app
npm run electron:dev
```

In dev mode Electron loads the frontend from the Vite dev server (`localhost:8717`), so you get hot module replacement.

#### 3. Build & Package Distributables

```bash
# Build for your current OS
npm run electron:build

# Target specific platforms
npm run electron:build:mac
npm run electron:build:win
npm run electron:build:linux
```

Output packages go into the `release/` directory.

> Cross-platform note: macOS builds must be done on macOS. Windows builds can be done on macOS/Linux with Wine, or on Windows natively. Linux builds work on any platform.

---

## Upgrading

### Source installs

```bash
git pull
npm install
npm run electron:rebuild
npm run electron:dev
```

Run `electron:rebuild` after every `npm install` when Electron or any native module (`better-sqlite3`, `canvas`, `node-pty`) changes version. If you skip it the app will crash on launch with a native module error.

### Pre-built installers

Download the new release from the Releases page and reinstall. In-app updates (`Settings → Updates`) also work for source installs only.

---

## ⚠️ Code Signing Warnings

asyncat is open-source and does not pay for Apple or Microsoft code signing certificates. When you install a pre-built release, your OS will complain. These are the workarounds:

### macOS

macOS will show: *"Asyncat.app can't be opened because Apple cannot check it for malicious software."*

**Option A (easiest):** Right-click (or Ctrl+click) `Asyncat.app` → choose **Open**. A dialog appears with an **Open** button. Click it.

**Option B:** Open **System Settings** → **Privacy & Security** → scroll to the Security section → click **Open Anyway**.

**Option C (terminal):**
```bash
xattr -cr /Applications/Asyncat.app
```

### Windows

Windows Defender SmartScreen will show: *"Windows protected your PC."*

1. Click **More info**
2. Click **Run anyway**

It only asks once. After that, The Cat is free.

### Linux

No warnings. Linux trusts you to manage your own computer.

```bash
chmod +x Asyncat-*.AppImage
./Asyncat-*.AppImage
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+Shift+A` | Summon or hide Asyncat (global — works in any app) |
| `Cmd/Ctrl+N` | New chat |
| `Cmd/Ctrl+,` | Settings |
| `Cmd/Ctrl+Shift+R` | Restart backend |
| `Cmd/Ctrl+R` | Reload window |

---

## After Install

### 1. Add a provider

Go to **Models → Chat Provider** and add one:

- **Local**: start a local engine (llama.cpp, Ollama, MLX) and select it
- **Cloud**: add OpenAI, Anthropic, Gemini, or any OpenRouter-compatible key

### 2. Open a chat

Go to **Command Center** and start a session. Pick a mode:

- **Chat** — conversational, no tool use
- **Plan** — see a structured plan before anything runs
- **Action** — full ReAct execution loop, up to 25 rounds

### 3. Run scheduled tasks

Go to **Schedule** and create repeating agent jobs — daily reports, hourly checks, custom cron expressions.

### 4. Manage skills and memory

Go to **Tools & Skills** to browse the tool inventory, load skill modules, edit agent soul, and review memory entries.

### 5. Monitor agent health

Go to **Agent Health** for success rates, tool usage, failure patterns, and loop detection across recent sessions.

---

## Architecture

```text
asyncat-oss/
├── electron/        # Electron Desktop app wrapper
│   ├── main.js      #   App entry: boot sequence, tray, IPC, global shortcuts
│   ├── backend.js   #   Spawns den as a child process (uses system Node.js)
│   ├── window.js    #   BrowserWindow creation and loading screen
│   ├── tray.js      #   System tray icon and menu
│   ├── menu.js      #   Native OS menu bar
│   ├── preload.js   #   Secure renderer ↔ main bridge
│   └── constants.js #   Paths, ports, platform flags
├── den/             # Backend — Express API + Agent Runtime
│   ├── src/
│   │   ├── index.js           # Server entry (routes, DB, CORS, WebSocket)
│   │   ├── agent/             # AgentRuntime, BasalGanglia, skills, souls,
│   │   │                      #   sessions, SandboxManager, Scheduler, profiles
│   │   ├── ai/                # Provider integration, providerRoutes, aiAgentRoutes
│   │   ├── auth/              # JWT auth, bcrypt, authMiddleware
│   │   ├── config/            # Config + secrets API (/api/config)
│   │   ├── db/                # SQLite client + schema
│   │   ├── files/             # File explorer service
│   │   ├── integrations/      # GitHub, RSS, Obsidian, email
│   │   ├── kanban/            # Cards + columns (/api/cards, /api/columns)
│   │   ├── lib/               # Shared logic extracted from CLI (system deps, local engines)
│   │   ├── notes/             # Delta-based notes, export (/api/notes)
│   │   └── users/             # Auth middleware, user CRUD
│   ├── data/                  # SQLite DB, model files, generated output
│   └── test/                  # Tests + evals
├── neko/            # React + Vite frontend
│   └── src/
│       ├── CommandCenter/     # Main chat UI
│       ├── Agent/             # Agent run view
│       ├── AgentHealth/       # Health dashboard
│       ├── Models/            # Provider config
│       ├── Profiles/          # Agent profiles
│       ├── Scheduler/         # Scheduler UI
│       ├── Tools/             # Tools & skills browser
│       ├── notes/             # Notes editor
│       └── views/             # Kanban, list, tasks
├── data/            # Root database + uploads
└── electron-builder.yml # Electron desktop packaging configuration
```

### How the desktop app boots

```text
Electron starts
  → electron/main.js — single-instance lock, tray, global shortcut
  → electron/backend.js — spawns den/src/index.js via system Node.js
  → polls /health until backend is ready (30s timeout)
  → starts static frontend server (neko/dist/) on port 8717
  → BrowserWindow loads http://localhost:8717
  → sends 'backend:ready' IPC event to renderer
```

### Agent runtime flow

```text
User goal
  → AgentRuntime.run() — ReAct loop (up to 25 rounds)
  → System prompt: soul + skills + memory + capabilities
  → Any model provider (local or cloud)
  → Tool execution with permission guards
  → BasalGanglia observes patterns, synthesizes skills
  → AgentSession persists audit trail
  → Results streamed to browser via SSE
```

---

## Basal Ganglia — how self-improvement works

asyncat watches which tools fire in each session and in what order. When the same sequence of tools succeeds three or more times within a 72-hour window, the Basal Ganglia module synthesizes a new skill from the pattern and deploys it immediately — no annotation, no manual configuration.

Failures and user corrections get encoded into corrective memory. The agent avoids patterns that have been flagged without being told explicitly.

```
session #41  read_file → edit_file → run_tests  ✓
session #44  read_file → edit_file → run_tests  ✓
session #47  read_file → edit_file → run_tests  ✓

[basal-ganglia] pattern matched — 3 of 3 within 72h
[basal-ganglia] skill created: test-driven-edit
                weight 0.8 · region cortex · origin basal-ganglia
```

---

## Troubleshooting

### App opens but shows a loading screen forever

The backend failed to start. Check:

1. **Is port 8716 already in use?** `lsof -i :8716` (macOS/Linux) or `netstat -ano | findstr 8716` (Windows).
2. **Source installs only:** does `den/.env` exist? Copy `den/.env.example` to `den/.env` and configure it.
3. **Open the developer console** — in the app: `View → Toggle Developer Tools` — and check for errors.

### `better-sqlite3` crashes or fails to load

The native module must be compiled against Electron's Node.js ABI:

```bash
npm run electron:rebuild
```

Run this after `npm install` whenever Electron is upgraded.

### Tray icon missing on Linux

Some Linux distributions need `libappindicator`:

```bash
sudo apt install libappindicator1
# or
sudo apt install libayatana-appindicator1
```

### In-app updates (Settings → Updates)

The in-app update flow (`git pull` + dependency reinstall) works for **source installs only**. If you installed a pre-built `.dmg` / `.exe` / `.AppImage`, download the new release from the Releases page and reinstall it.

---

## Status

**asyncat is a mature beta.** It has been built and tested across real agent sessions covering coding, research, system administration, scheduling, and desktop automation tasks.

**Active development:**
- [ ] Multi-platform clients (Telegram, Slack)
- [ ] API/SDK for programmatic access
- [ ] Extended MCP ecosystem compatibility

---

## License

MIT — use it, fork it, build on it.
