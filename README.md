# Asyncat — Open Source

An AI-powered all-in-one workspace for teams and individuals.

> The workspace where AI doesn't just answer — it acts.

Asyncat combines a deeply integrated AI assistant with project management, collaborative notes, kanban boards, a calendar, habit tracking, file storage, and a Study Lab — all in one product. The AI knows your projects, tasks, notes, and calendar, and can take direct actions across all of them from a single chat.

**Live hosted version:** [app.asyncat.com](https://app.asyncat.com)

---

## What's in this repo

```
asyncat-oss/
├── neko/        React 19 + Vite 6 + TailwindCSS 4 frontend
└── den/         Node.js + Express unified backend (all services merged)
```

| Package | What it does |
|---|---|
| `neko` | The browser app — AI chat, kanban, notes, calendar, habits, study lab |
| `den` | The backend API — AI, users, teams, projects, calendar, habits, kanban, notes, storage |

---

## Quick start

### Requirements

- Node.js 20+
- A Supabase project ([supabase.com](https://supabase.com) — free tier works)
- An AI provider: OpenAI, Ollama (local), llama.cpp, or Azure OpenAI

### 1. Install dependencies

```bash
cd den && npm install
cd ../neko && npm install
```

### 2. Configure the backend

```bash
cd den
cp .env.example .env
# Edit .env — at minimum set SUPABASE_URL, SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, AI_BASE_URL, AI_API_KEY, AI_MODEL
```

### 3. Configure the frontend

```bash
cd neko
cp .env.example .env
# Edit .env — set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
```

### 4. Run

```bash
# Terminal 1
cd den && npm run dev

# Terminal 2
cd neko && npm run dev
```

Frontend at `http://localhost:5173` · Backend at `http://localhost:3000`

---

## AI provider options

Den works with any **OpenAI-compatible** endpoint. Set in `den/.env`:

| Provider | `AI_BASE_URL` | `AI_MODEL` |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| Azure OpenAI | `https://your-resource.openai.azure.com/openai/v1/` | your deployment name |
| Ollama (local, free) | `http://localhost:11434/v1` | `llama3.1` |
| llama.cpp server | `http://localhost:8080/v1` | `local` |

> **Local models:** Tool calling (the AI creating tasks, events, etc.) requires a model that supports function calling. Llama 3.1 8B+ and Mistral work well.

---

## Self-hosting vs cloud

| | Self-hosted | Asyncat Cloud |
|---|---|---|
| Hosting | Your machine or VPS | Managed by Asyncat |
| AI model | Your choice (BYO key or local) | Hosted, no setup |
| Team features | Yes — your team connects to your server | Yes |
| Billing | None — all features unlocked | Subscription plans |
| Storage | Azure Blob or local/MinIO | Managed |

**Team features work in self-hosted mode.** You run the server; your teammates connect to it via the browser — exactly like self-hosted Gitea, Plane, or Outline.

---

## Features

- **AI Command Center** — streaming chat that reads and writes across your workspace. Build mode scaffolds entire projects from a one-sentence brief.
- **Kanban** — drag-and-drop boards with dependencies, time tracking, and multiple views (list, gallery, Gantt, network)
- **Collaborative Notes** — block-based rich editor with 20+ block types, real-time cursors, version history
- **Calendar** — events, invites, color codes, project linking
- **Habit Tracker** — XP gamification, streaks, team leaderboards
- **Study Lab** — spaced-repetition flashcards (SM-2), active recall quizzes, saved mind maps
- **File Storage** — workspace file browser backed by configurable storage
- **MCP Integration** — connect external AI clients (Claude, Cursor, Windsurf) directly to your workspace

---

## Roadmap

- [ ] Export Supabase schema as portable SQL migrations
- [ ] Replace Supabase Auth with built-in JWT for fully offline / no-Supabase setups
- [ ] Storage adapter: local disk / MinIO / S3 (remove Azure dependency)
- [ ] `docker-compose.yml` for one-command setup
- [ ] Graceful degradation when local model doesn't support tool calling

---

## Contributing

Issues and pull requests welcome. See `den/README.md` and `neko/README.md` for per-package setup details and conventions.

---

## License

TBD — will be published before the first public release.
