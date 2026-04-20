# Asyncat — Open Source

An AI-powered all-in-one workspace for teams and individuals.

> The workspace where AI doesn't just answer — it acts.

Asyncat combines a deeply integrated AI assistant with project management, collaborative notes, kanban boards, a calendar, habit tracking and Laba — all in one product. The AI knows your projects, tasks, notes, and calendar, and can take direct actions across all of them from a single chat.

**Features:** AI chat, kanban boards, notes, calendar, habit tracking, file storage, study lab, MCP integration

**Self-host or develop locally** — this is the open-source repo. A managed cloud version may be available separately.

---

## What's in this repo

```
asyncat-oss/
├── cat          ← the CLI — start here
├── den/         Node.js + Express backend (all services in one)
└── neko/        React 19 + Vite 6 + TailwindCSS 4 frontend
```

---

## Quick start

### Requirements

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **An AI provider** — any OpenAI-compatible endpoint (see table below)
- **Python 3.10+** *(optional)* — only needed if you want built-in local models via llama.cpp

### 1. Clone

```bash
git clone https://github.com/your-username/asyncat-oss
cd asyncat-oss
```

### 2. Install everything

```bash
./cat install
```

This will:
- Check Node.js, npm, and Python
- Auto-create `den/.env` and `neko/.env` from the example files
- Run `npm install` for the whole project
- Detect llama-server — and offer to install it if it's missing

### 3. Configure

Edit `den/.env` — the only required values are:

```env
JWT_SECRET=change-this-to-a-long-random-string   # required
AI_BASE_URL=https://api.openai.com/v1             # your AI provider
AI_API_KEY=sk-...                                  # your API key
AI_MODEL=gpt-4o                                    # model name
```

Everything else has working defaults for a single-user local setup.

### 4. Start

```bash
./cat start
```

Opens backend at `http://localhost:8716` and frontend at `http://localhost:8717`.

---

## The `cat` CLI

All commands run from the `asyncat-oss` root. Type `./cat` or `./cat /` to see all commands.

**Core commands:**
| Command | What it does |
|---|---|
| `./cat install` | Check deps, set up `.env` files, install packages, detect/install llama.cpp |
| `./cat start` | Start backend + frontend (auto-detects pnpm/yarn/bun) |
| `./cat stop` | Stop all running services |
| `./cat status` | Show what's running |
| `./cat update` | Pull latest, auto-detect package manager, reinstall deps |

**Productivity:**
| Command | What it does |
|---|---|
| `./cat watch <interval> <cmd>` | Auto-rerun a command every N seconds |
| `./cat bench [count] <cmd>` | Time command execution (avg/min/max) |
| `./cat history [search]` | Search command history (regex supported) |
| `./cat alias [add\|list\|rm]` | Save command shortcuts |
| `./cat snippets [add\|show\|rm]` | Save code blocks |
| `./cat macros [record\|play\|list\|rm]` | Record & playback command sequences |
| `./cat recent [n]` | Show last N commands |
| `./cat context` | Show workspace state (git, env, deps) |
| `./cat version` | Show versions (node, npm, pnpm, yarn, bun, python, llama.cpp, git) |

---

## AI provider options

Den works with any **OpenAI-compatible** endpoint. Set in `den/.env`:

| Provider | `AI_BASE_URL` | `AI_MODEL` |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| Anthropic (Claude) | `https://api.anthropic.com/v1` | `claude-sonnet-4-5` |
| Azure OpenAI | `https://your-resource.openai.azure.com/openai/v1/` | your deployment name |
| Ollama (local, free) | `http://localhost:11434/v1` | `llama3.1` |
| Built-in llama.cpp | *(auto-managed — no URL needed)* | set `LOCAL_MODEL_PATH` |

### Built-in local models

Asyncat ships a built-in llama-server manager — no Ollama or LM Studio required.
Drop a `.gguf` model file into `den/data/models/` and set in `den/.env`:

```env
LOCAL_MODEL_PATH=./data/models/your-model.gguf
```

`./cat install` will detect or install llama.cpp automatically.

> Tool calling (AI creating tasks, events, etc.) requires a model that supports function calling. Llama 3.1 8B+ and Qwen 2.5 work well.

---

## Solo mode vs server mode

Controlled by `SOLO_MODE` in `den/.env`:

| | Solo (default) | Server mode |
|---|---|---|
| Users | Auto-creates one admin account on first boot | Anyone can register |
| Database | SQLite — no external DB needed | SQLite (or swap in Postgres) |
| Setup | Zero config | Set `SOLO_MODE=false`, configure `SOLO_EMAIL`/`SOLO_PASSWORD` |
| Best for | Personal use, local dev | Team self-hosting |

**Team features work in server mode.** You run the server; teammates connect via their browser — just like self-hosted Gitea or Outline.

---

## Self-hosting vs cloud

| | Self-hosted | Asyncat Cloud |
|---|---|---|
| Hosting | Your machine or VPS | Managed by Asyncat |
| AI model | Your choice (BYO key or local) | Hosted, no setup |
| Team features | Yes | Yes |
| Billing | None — all features unlocked | Subscription plans |
| Storage | Local disk or Azure Blob | Managed |

---

## Features

- **AI Command Center** — streaming chat that reads and writes across your workspace. Build mode scaffolds entire projects from a one-sentence brief.
- **Kanban** — drag-and-drop boards with dependencies, time tracking, and multiple views (list, gallery, Gantt, network graph)
- **Collaborative Notes** — block-based rich editor with 20+ block types, real-time cursors, version history, chart blocks
- **Calendar** — events, invites, color codes, project linking
- **Habit Tracker** — XP gamification, streaks, team leaderboards
- **Study Lab** — spaced-repetition flashcards (SM-2), active recall quizzes, mind maps
- **File Storage** — workspace file browser backed by configurable storage drivers
- **Packs** — AI prompt packs and custom workflows
- **MCP Integration** — connect external AI clients (Claude, Cursor, Windsurf) directly to your workspace

---

## Roadmap

- [ ] `docker-compose.yml` for one-command containerised setup
- [ ] Graceful degradation when local model doesn't support tool calling
- [ ] Storage adapter: local disk / MinIO / S3 (remove Azure dependency)
- [ ] Windows support for `./cat` CLI

---

## Contributing

Issues and pull requests welcome. See `den/README.md` and `neko/README.md` for per-package details.

---

## License

TBD — will be published before the first public release.
