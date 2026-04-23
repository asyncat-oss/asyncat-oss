# den — Asyncat Backend

The unified backend for the AI Agent OS.

> We give the baby models the keys. They just need a bigger brain to use them properly.

Built with **Node.js 20+** and **Express 4**.

## What it does

Den is a single Express server that handles everything:

| Domain | Routes |
|---|---|
| Auth (JWT) | `/api/auth/*` |
| AI / Agent | `/api/ai/*`, `/api/agent/*` |
| Config | `/api/config/*` |
| Users | `/api/users/*` |
| Workspaces | `/api/teams/*` |
| Calendar | `/api/events/*` |
| Habits | `/api/habits/*` |
| Kanban | `/api/cards/*`, `/api/columns/*` |
| Notes | `/api/notes/*` |
| Storage | `/api/attachments/*` |

## Getting started

### Prerequisites

- Node.js 20+
- A local model (GGUF) OR an API key

### Install

```bash
npm install
```

Auto-creates `.env` from `.env.example`.

### Configure

Edit `den/.env`:

```env
PORT=8716
JWT_SECRET=change-this-to-a-long-random-string

# Local model (recommended)
LLAMA_SERVER_PORT=8765
MODELS_PATH=./data/models
# Optional explicit llama.cpp binary; asyncat install --local-engine sets this
LLAMA_BINARY_PATH=/full/path/to/llama-server

# OR cloud API
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
```

For local GGUF models, prefer the CLI-managed llama.cpp install:

```bash
asyncat install --local-engine
```

Do not install `llama-cpp-python` into system Python on Linux; Asyncat uses a managed binary or an Asyncat-owned venv fallback to avoid PEP 668 / externally managed Python errors.

### Run

```bash
npm run dev   # development
npm start     # production
```

Starts at `http://localhost:8716`.

## Solo mode

Default. One user, SQLite database, no network access needed.

```env
SOLO_MODE=true
SOLO_EMAIL=admin@local
SOLO_PASSWORD=changeme
```

## Database

SQLite. No external dependencies. Data in `data/asyncat.db`.

## Config API

```bash
# get config (secrets masked)
GET /api/config

# update config
PUT /api/config
{ "key": "AI_MODEL", "value": "llama3.1", "restart": true }

# get secrets (unmasked)
GET /api/config/secrets

# update secret
PUT /api/config/secrets
{ "key": "AI_API_KEY", "value": "sk-new-key" }
```

## License

MIT
