# Asyncat

**The most capable local AI agent for your desktop.** Fully offline, 100+ tools, controls your machine, code, browser, and media.

> **v0.7.3** · MIT · [Install](#quick-start) · [Website](https://asyncat.com)

![Asyncat home screen](neko/public/image.png)

---

## What makes asyncat different

Most AI agents are good at one thing. Chat. Code. Research.

asyncat does **everything** — on your machine, fully offline, with no cloud dependency.

| You can | In other agents |
|---|---|
| **Control your desktop** — click, type, read screens, focus windows | ❌ None |
| **Use 100+ tools** — files, shell, git, browser, docker, screen, keyboard, and more | 20-40 tools max |
| **Generate images, speech, transcribe audio, create PDFs** | 1-2 modalities max |
| **Work fully offline** with local models via llama.cpp, Ollama, MLX | Some |
| **Schedule recurring agent jobs** — "check this every hour" | ❌ Rare |
| **Inspect system health** — disk, memory, ports, processes, network | ❌ None |
| **Run in disposable sandboxes** with patch review | ❌ Rare |
| **Remember across sessions** with durable memory system | Some |
| **Use 20+ cloud and local providers** | Usually 1-3 |

---

## asyncat vs The Field

| Feature | **asyncat** | Hermes Agent | Cline | Claude Code | Devin | Aider |
|---|---|---|---|---|---|---|
| **Tool count** | **100+** | ~50 | ~40 | ~30 | ~40 | ~10 |
| **Desktop automation** | ✅ Screen, clicks, OCR, keyboard | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Local-first** | ✅ Fully offline capable | ✅ | ✅ | ❌ Cloud | ❌ Cloud | ✅ |
| **Local image gen (SD)** | ✅ Built-in | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Local TTS / STT** | ✅ Piper + Whisper | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Browser automation** | ✅ Full browser | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Docker sandboxes** | ✅ With patch promotion | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Scheduled jobs** | ✅ Recurring agent runs | ❌ | ❌ | ❌ | ❌ | ❌ |
| **System monitoring** | ✅ Disk, ports, processes, network | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Durable memory** | ✅ SQLite-backed | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Multi-provider** | ✅ 20+ providers | ❌ | ✅ | ❌ | ❌ | ❌ |
| **MCP support** | ❌ Coming | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Multi-platform** | Desktop only (for now) | ✅ Multi | ⬜ VS Code | ⬜ VS Code | ❌ | ✅ |
| **Open source** | ✅ MIT | ✅ MIT | ✅ Apache | ❌ | ❌ | ✅ Apache |

---

## Quick Start

### Requirements
- Node.js `20+` / `22+` / `24+` / `25+` / `26+`
- npm, git

### Install

**One-liner (macOS / Linux):**
```bash
curl -fsSL https://asyncat.com/install.sh | sh
```

**One-liner (Windows PowerShell):**
```powershell
irm https://asyncat.com/install.ps1 | iex
```

**From source:**
```bash
git clone https://github.com/asyncat-oss/asyncat-oss.git
cd asyncat-oss
npm install
npm run dev
```

Open `http://localhost:8717`.

> Default port is `8717`. Override with `ASYNCAT_PORT=3000 npm run dev`.

### Update

```bash
cd asyncat-oss
git pull
npm install
npm run build
```

---

## After install

### 1. Add a provider

You need an AI model to run agents. In the app, go to **Models → Chat Provider** and add one:

- **Local**: start a local engine (llama.cpp, Ollama, MLX) and select it as provider
- **Cloud**: add OpenAI, Anthropic, Gemini, or any OpenRouter-compatible key

### 2. Open a chat

Go to **Command Center** and start a session. Type anything — "create a project", "research this topic", "check my system health".

### 3. Run scheduled tasks

Go to **Schedule** and create repeating agent jobs — daily reports, hourly checks, custom intervals.

### 4. Manage skills & tools

Go to **Tools & Skills** to browse the full 100+ tool inventory, load skill modules, edit agent soul, and review memory.

### 5. Monitor agent health

Go to **Agent Health** for success rates, failures, guard blocks, latency, and eval commands.

---

## What you get

### 🖥️ Desktop Agent
The only open-source agent that can **control your screen** — click buttons, read text from screenshots, type into windows, focus applications. It's not just a chatbot. It *does* things.

### 🧰 100+ Tools
Everything you'd expect from an operating system for AI: filesystem, shell, git, web search, browser automation, Docker, database queries, PDF extraction, image generation, speech synthesis, note-taking, task management, clipboard, environment inspection, system monitoring.

### 🛡️ Fully Local
Every feature works with local models (llama.cpp, Ollama, MLX). No data leaves your machine. No API keys needed. No cloud dependency.

### 🎨 Multimodal
Generate images with Stable Diffusion. Speak text aloud with Piper TTS. Transcribe audio with Whisper STT. Create PDFs, charts, diagrams, and rich documents.

### 🔁 Scheduled Jobs
"Check this server every hour." "Summarize my notes daily at 9am." "Scrape this page every 15 minutes." asyncat runs recurring agent tasks on your schedule.

### 📦 Disposable Sandboxes
Run risky code or experiments in isolated workspaces. Review changes as a unified patch. Promote selected files back. Delete when done.

### 🧠 Durable Memory
asyncat remembers what it learns across sessions. Save project conventions, user preferences, architectural decisions — it persists in SQLite and retrieves automatically.

### 🔌 20+ Provider Support
OpenAI, Anthropic, Gemini, Ollama, llama.cpp, LM Studio, OpenRouter, DeepSeek, Groq, Together, Perplexity, Mistral, Cohere, Fireworks, Cerebras, DeepInfra, NVIDIA NIM, Hugging Face, Azure OpenAI, Amazon Bedrock — mix and match.

---

## Quick Demo

```bash
# Start asyncat
npm run dev

# Open http://localhost:8717
# Tell the agent:
# "Create a new project, initialize git, write a web server,
#  test it, commit everything, and open the browser"
```

asyncat will:
1. Create the project files
2. Write the code
3. Run npm install and test it
4. Initialize git and commit
5. Open the browser to show you the result

All autonomously, all on your machine.

---

## Architecture

```text
asyncat-oss/
├── cat              # CLI launcher — just imports cli/index.js
├── cli/             # CLI commands
│   ├── bin/         # Entry point (first-run handler, clone, install, update)
│   ├── commands/    # 17 commands: agent, chat, config, doctor, install, etc.
│   └── lib/         # Den API client, local engine, system deps, etc.
├── den/             # Backend monolith — Express API + Agent Runtime
│   ├── src/
│   │   ├── index.js # Server entry (Express, routes, DB, CORS)
│   │   ├── agent/   # AgentRuntime, tools, sessions, skills, souls, permissions
│   │   ├── ai/      # Model provider integration (OpenAI, local, etc.)
│   │   ├── auth/    # Authentication
│   │   ├── calendar/ # Calendar integration
│   │   ├── db/      # SQLite client + schema
│   │   ├── files/   # File explorer service
│   │   ├── integrations/ # GitHub, Google, Outlook, RSS, Obsidian
│   │   ├── kanban/  # Kanban board
│   │   ├── notes/   # Notes system
│   │   ├── storage/ # Storage service
│   │   └── users/   # Users & teams
│   ├── data/        # DB + models + generated files
│   └── test/        # Tests + evals
├── neko/            # React frontend (Vite)
│   ├── src/
│   │   ├── main.jsx         # Entry point
│   │   ├── App.jsx / App.css
│   │   ├── index.css        # Global styles
│   │   ├── router/          # AppRouter
│   │   ├── CommandCenter/   # Main chat UI (api/, components/)
│   │   ├── Agent/           # Agent page
│   │   ├── AgentHealth/     # Agent health dashboard
│   │   ├── Models/          # Model/provider config
│   │   ├── Profiles/        # Agent profiles
│   │   ├── Scheduler/       # Scheduled task UI
│   │   ├── Settings/        # App settings
│   │   ├── Tools/           # Tools & skills browser
│   │   ├── auth/            # Login/auth screens
│   │   ├── calendar/        # Calendar integration
│   │   ├── files/           # File explorer
│   │   ├── notes/           # Notes system
│   │   ├── projects/        # Projects view
│   │   ├── views/           # Kanban, list, network, tasks
│   │   ├── contexts/        # UserContext, WorkspaceContext
│   │   ├── hooks/           # useAuth, useGlobal401Handler, etc.
│   │   ├── services/        # authService
│   │   ├── components/      # Shared (Portal, TopMenuBar)
│   │   ├── utils/           # eventBus, sanitizer, keyboard, etc.
│   │   ├── sidebar/         # Sidebar navigation
│   │   ├── appcontainer/    # App shell
│   │   ├── error/           # Error boundaries
│   │   └── assets/          # Static assets
│   ├── public/       # Public assets
│   ├── dist/         # Production build
│   ├── index.html
│   └── vite.config.js
├── data/            # Root database + uploads
├── logs/            # Runtime logs
├── scripts/         # Postinstall + relaunch scripts
├── install.sh       # macOS/Linux installer
└── install.ps1      # Windows installer
```

### Agent Flow

```text
Your goal
  → AgentRuntime (ReAct loop)
  → Prompt builder + skills + memory + 100 tools
  → Any model provider (local or cloud)
  → Tool execution with permission guards
  → Real results on your machine
  → Streamed to your browser in real time
```

---

## Comparison: Why not just use...

| Instead of | asyncat is better because |
|---|---|
| **Claude Code / Cline** | asyncat has 3x more tools, desktop automation, scheduled jobs, sandboxes, multimodal output |
| **Devin** | asyncat is **free, open source, and fully local**. Devin is cloud-only and paid |
| **Hermes Agent** | asyncat has **desktop control, browser automation, Docker, system monitoring** Hermes doesn't |
| **Aider** | asyncat is a full agent workspace, not just code editing |
| **Copilot / Cursor** | asyncat is not IDE-locked. It controls your whole machine, not just your editor |

---

## Status

**asyncat is a mature beta.** It's been built and tested across real agent sessions. The feature set is the most complete of any local open-source agent.

**Known gaps being worked:**
- [ ] MCP protocol support (ecosystem access)
- [ ] API/SDK for programmatic access
- [ ] Multi-platform clients (Telegram, Slack, web)
- [ ] Self-improving skill learning loop

---

## License

MIT — use it, fork it, build on it.

---

## 🥚 Easter egg

This README was written by asyncat itself. The same agent that controls your desktop, writes your code, and manages your system — wrote its own README. Meta? Maybe. But it proves the point.

**Your machine. Your agent. Full control.**