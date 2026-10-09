# den — Asyncat Backend

The unified backend for the AI Agent OS.

> We give the baby models the keys. They just need a bigger brain to use them properly.

Built with **Node.js** (20.19+, 22.13+, or 24+) and **Express 4**.

## What it does

Den is a single Express server that handles everything:

| Domain | Routes |
|---|---|
| AI / Agent | `/api/ai/*`, `/api/agent/*` (same router), `/api/ai/providers/*` |
| Training | `/api/training/*` |
| Config | `/api/config/*` |
| Users / Projects | `/api/users/*`, `/api/projects/*` |
| Workspaces | `/api/teams/*` |
| Kanban | `/api/cards/*`, `/api/columns/*` |
| Notes | `/api/notes/*`, `/api/attachments/*` (note attachments) |
| Files | `/api/files/*` (file explorer) |
| Storage | `/files/*`, `/api/storage/*` (uploaded files and logs) |
| Integrations | `/api/integrations/*` (GitHub, Obsidian, RSS, mail, notifications) |
| Search | `/api/search/*` |
| Browser | `/api/browser/*` (built-in browser history) |
| Install / Update | `/api/install/*`, `/api/update/*` |
| Health | `/health` |

## Getting started

### Prerequisites

- Node.js 20.19+, 22.13+, or 24+
- A local model (GGUF) OR an API key

### Install

Run `npm install` from the repository root. Its postinstall copies
`den/.env.example` to `den/.env` when it doesn't exist yet.

### Configure

`den/.env` only holds the bootstrap settings the server needs before its
database opens:

```env
PORT=8716
NODE_ENV=development
FRONTEND_URL=http://127.0.0.1:8717
PUBLIC_URL=http://127.0.0.1:8716
DB_PATH=./data/asyncat.db
STORAGE_DRIVER=local
STORAGE_PATH=./data/uploads
```

Everything else (providers and API keys, local engines, integrations) is set
in the app and stored in the database. A few optional overrides are still
read from the environment until the same setting is saved in the app:
`LLAMA_SERVER_PORT`, `MODELS_PATH`, `LLAMA_BINARY_PATH`, `LLAMA_GPU_LAYERS`.
When no provider is configured in **Models**, `AI_BASE_URL`, `AI_API_KEY`, and
`AI_MODEL` act as a fallback OpenAI-compatible endpoint.

For local GGUF models, open **Settings → Runtime** and install the recommended
managed llama.cpp build. The Runtime page inspects the machine, recommends a
CPU/GPU profile, switches among installed `llama-server` or
`llama-cpp-python` engines, and installs supported runtimes without restarting
`den`.

Do not install `llama-cpp-python` into system Python on Linux; Asyncat uses a managed binary or an Asyncat-owned venv fallback to avoid PEP 668 / externally managed Python errors.

### Run

```bash
npm run dev   # development (nodemon)
npm start     # production
npm test      # node:test suites in test/
```

Starts at `http://127.0.0.1:8716` and only accepts connections from the local
machine. Browser requests must come from Asyncat's own frontend: requests with
another `Origin`, or addressed to a non-local `Host`, are rejected.

## Local profile

Asyncat creates one local profile automatically. It is used only to associate
projects, notes, and agent history with a stable owner ID; there is no login,
password, browser session, or account setup.

## Database

SQLite. No external dependencies. The file is `data/asyncat.db` under the
backend's working directory: `den/data/asyncat.db` from source, or
`<user data>/data/asyncat.db` in the desktop app. Override it with `DB_PATH`.

## Config API

```bash
# get config (secrets masked)
GET /api/config

# update a setting (saved to the database and applied live;
# bootstrap keys such as STORAGE_PATH are written to .env and need a restart)
PUT /api/config
{ "key": "LLAMA_GPU_LAYERS", "value": "99" }

# get secrets (masked)
GET /api/config/secrets

# update a secret
PUT /api/config/secrets
{ "key": "HF_TOKEN", "value": "hf_..." }
```

Chat-provider API keys are managed on the **Models** page, not through this API.

## License

MIT
