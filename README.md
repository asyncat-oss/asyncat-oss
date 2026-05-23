# asyncat

**A local-first AI agent platform.** 155 tools. 49 skills. Self-improving. Desktop automation. Fully offline.

> **v0.7.3** · MIT · [Install](#quick-start) · [Website](https://asyncat.com)

![asyncat home screen](neko/public/image.png)

---

## What asyncat is

asyncat is a full-stack AI agent you run on your own hardware. It has a backend (`den`), a web UI (`neko`), and a CLI (`cat`). You connect any model — local or cloud — and it can do real work on your machine.

It is not a chatbot wrapper. It controls your screen, writes and runs code, manages files, schedules recurring jobs, and gets better over time through a self-improving engine called Basal Ganglia.

---

## What's inside

| | |
|---|---|
| **155 tools** | Files, shell, git, browser, Docker, screen, keyboard, memory, RAG, notes, calendar, kanban, system, network, audio, image, code analysis, sandboxes, scheduler |
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
| **Workspace** | Notes (markdown, delta-based, export to DOCX/PDF), Kanban (columns, cards, checklists), Calendar (events) |
| **Fully offline** | Every feature works with local models. No data leaves your machine |

---

## Quick Start

### Requirements

- Node.js `20.19+`
- npm, git

### Install

**macOS / Linux:**
```bash
curl -fsSL https://asyncat.com/install.sh | sh
```

**Windows (PowerShell):**
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

---

## After install

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
├── cat              # CLI launcher
├── cli/             # CLI commands
│   ├── bin/         # Entry point (first-run, clone, install, update)
│   ├── commands/    # start, stop, provider, models, skills, doctor, db, …
│   └── lib/         # Den API client, local engine, system deps
├── den/             # Backend — Express API + Agent Runtime
│   ├── src/
│   │   ├── index.js           # Server entry (routes, DB, CORS, WebSocket)
│   │   ├── agent/             # AgentRuntime, BasalGanglia, skills, souls,
│   │   │                      #   sessions, SandboxManager, Scheduler, profiles
│   │   ├── ai/                # Provider integration, providerRoutes, aiAgentRoutes
│   │   ├── auth/              # JWT auth, bcrypt, authMiddleware
│   │   ├── calendar/          # Events CRUD (/api/events)
│   │   ├── config/            # Config + secrets API (/api/config)
│   │   ├── db/                # SQLite client + schema
│   │   ├── files/             # File explorer service
│   │   ├── integrations/      # GitHub, Google, Outlook, RSS, Obsidian, email
│   │   ├── kanban/            # Cards + columns (/api/cards, /api/columns)
│   │   ├── notes/             # Delta-based notes, export (/api/notes)
│   │   └── users/             # Auth middleware, user CRUD
│   ├── data/                  # SQLite DB, model files, generated output
│   └── test/                  # Tests + evals
├── neko/            # React + Vite frontend (port 8717)
│   └── src/
│       ├── CommandCenter/     # Main chat UI
│       ├── Agent/             # Agent run view
│       ├── AgentHealth/       # Health dashboard
│       ├── Models/            # Provider config
│       ├── Profiles/          # Agent profiles
│       ├── Scheduler/         # Scheduler UI
│       ├── Tools/             # Tools & skills browser
│       ├── notes/             # Notes editor
│       ├── views/             # Kanban, list, tasks
│       └── calendar/          # Calendar
├── data/            # Root database + uploads
├── install.sh       # macOS/Linux installer
└── install.ps1      # Windows installer
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

## Status

**asyncat is a mature beta.** It has been built and tested across real agent sessions covering coding, research, system administration, scheduling, and desktop automation tasks.

**Active development:**
- [ ] Multi-platform clients (Telegram, Slack)
- [ ] API/SDK for programmatic access
- [ ] Extended MCP ecosystem compatibility

---

## License

MIT — use it, fork it, build on it.
