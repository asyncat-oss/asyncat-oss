# den — Asyncat Backend

The unified backend for the AI Agent OS.

> We give the baby models the keys. They just need a bigger brain to use them properly.

Built with **Node.js 20+** and **Express 4**.

## What it does

Den is a single Express server that handles everything:

| Domain | Routes |
|---|---|
| AI / Agent | `/api/ai/*`, `/api/agent/*` |
| Config | `/api/config/*` |
| Users | `/api/users/*` |
| Workspaces | `/api/teams/*` |
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

Edit `den/.env` for bootstrap server settings. Runtime selections are managed
from **Settings → Runtime** and persisted in Asyncat's database:

```env
PORT=8716

# Optional source-install overrides
LLAMA_SERVER_PORT=8765
MODELS_PATH=./data/models
# Optional explicit llama.cpp binary
LLAMA_BINARY_PATH=/full/path/to/llama-server
# Optional GPU offload tuning for the selected local engine
LLAMA_GPU_LAYERS=0

# OR cloud API
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
```

For local GGUF models, open **Settings → Runtime** and install the recommended
managed llama.cpp build. The Runtime page inspects the machine, recommends a
CPU/GPU profile, switches among installed `llama-server` or
`llama-cpp-python` engines, and installs supported runtimes without restarting
`den`.

Do not install `llama-cpp-python` into system Python on Linux; Asyncat uses a managed binary or an Asyncat-owned venv fallback to avoid PEP 668 / externally managed Python errors.

### Run

```bash
npm run dev   # development
npm start     # production
```

Starts at `http://127.0.0.1:8716` and only accepts connections from the local
machine.

## Local profile

Asyncat creates one local profile automatically. It is used only to associate
projects, notes, and agent history with a stable owner ID; there is no login,
password, browser session, or account setup.

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
