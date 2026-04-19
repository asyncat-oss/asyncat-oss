# Asyncat CLI

The Asyncat CLI is a terminal control center for the Asyncat workspace.

It can:
- start and stop backend/frontend services
- run AI chat in-terminal
- manage local GGUF models with llama.cpp
- switch AI providers (local/cloud/custom)
- inspect logs, config, sessions, and database state
- automate repetitive tasks with aliases, snippets, macros, watch, and bench

## What this package is

This folder contains the npm CLI package exposed as `asyncat`.

In the full monorepo, the same CLI is also available through the root launcher (`./cat`).

## Requirements

- Node.js 20+
- npm 8+
- git (for first-run auto-install outside the repo)
- Python 3.x (optional, used for local llama setup paths)
- llama-server or llama-cpp-python[server] (optional, only for local models)

## Install and run

### Option A: from this repository (recommended for contributors)

From repo root:

```bash
./cat install
./cat start
```

Or from this folder:

```bash
node bin/asyncat.js install
node bin/asyncat.js start
```

### Option B: as standalone CLI

```bash
npm i -g @asyncat/asyncat
asyncat
```

When run outside the repository, first launch auto-installs into `~/.asyncat` (or `$ASYNCAT_HOME` if set), then executes from there.

## Core workflow

```bash
asyncat install      # setup env files + dependencies + llama checks
asyncat doctor       # run health checks
asyncat start        # start backend + frontend
asyncat status       # check running services
asyncat chat         # interactive AI chat (backend-based)
```

## Commands

### Services

- `start [--backend-only|-b] [--frontend-only|-f]`
- `stop`
- `status` / `ps`
- `restart`
- `open` / `o`
- `logs [backend|frontend|all]`

Notes:
- backend default URL: http://localhost:8716
- frontend default URL: http://localhost:8717
- `start` rejects using backend-only and frontend-only together

### AI chat and model runtime

- `chat [--web|-w] [--think|-t] [--style=<normal|concise|detailed|code-focused|learning>]`
- `run [model]` (direct chat to llama-server endpoint, no backend API needed)

Chat in-session slash commands:
- `/exit`, `/new`, `/clear`, `/web`, `/think`, `/style <mode>`, `/history`, `/save`, `/help`

Run in-session slash commands:
- `/bye`, `/clear`, `/reset`, `/info`

### Model management

- `models list`
- `models pull <url> [filename.gguf]`
- `models serve <filename.gguf>`
- `models stop`
- `models ps`
- `models rm <filename>`
- `models info <filename>`

Notes:
- model files live under `den/data/models`
- supported local file extensions: `.gguf`, `.bin`
- `models serve` and `models stop` call backend APIs and require auth/backend availability

### Provider management

- `provider list` / `provider get`
- `provider set local <model.gguf>`
- `provider set cloud <api-key> [model] [base-url]`
- `provider set custom <base-url> <api-key> [model]`
- `provider stop`

Notes:
- cloud default URL: `https://api.openai.com/v1`
- cloud default model: `gpt-4o`
- cloud/custom writes `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` to `den/.env`
- restart backend after provider env changes

### Sessions

- `sessions [n]`
- `sessions list [n]`
- `sessions rm <id-prefix>`
- `sessions stats`

Notes:
- default list size: 20
- requires backend auth token

### Database

- `db backup`
- `db reset`
- `db seed`

Safety:
- `db reset` permanently deletes `data/asyncat.db` (+ `-shm`, `-wal`) after typing `yes`

### Environment config

- `config show`
- `config get <KEY>`
- `config set KEY=VALUE`

Notes:
- edits `den/.env`
- secret-like keys are masked when printed

### Productivity helpers

- `watch <interval> <command>`
- `watch list`
- `watch stop <id>`
- `bench [count] <command>`
- `alias [list|add|rm|expand]`
- `snippets [list|add|show|rm|copy]`
- `macros [list|record|stop|play|show|rm]`
- `history [query]`
- `recent [n]`
- `context`

Data files in home directory:
- `~/.asyncat_aliases`
- `~/.asyncat_snippets`
- `~/.asyncat_macros`
- `~/.asyncat_history`

## Setup and maintenance

- `install` / `setup`: creates env files from examples, installs dependencies, checks local llama setup
- `doctor`: environment, ports, files, and dependency health checks
- `update`: pulls latest git changes then reinstalls deps (auto-detects package manager)
- `version` / `v`: prints versions for Asyncat + runtime tools

## Useful examples

```bash
# Start only backend
asyncat start --backend-only

# Pull and serve a local model
asyncat models pull https://example.com/Qwen3.5-4B-UD-Q8_K_XL.gguf
asyncat models serve Qwen3.5-4B-UD-Q8_K_XL.gguf

# Use cloud provider
asyncat provider set cloud sk-xxxx gpt-4o
asyncat restart

# Fast recurring task checks
asyncat watch 5 "asyncat status"

# Benchmark a command 10 times
asyncat bench 10 "node -v"

# Inspect and update env config
asyncat config get AI_MODEL
asyncat config set AI_MODEL=gpt-4o-mini
```

## Exit and help

- `help` / `?`
- `clear`
- `exit` / `quit` / `q`

Tip: in the REPL, type `/` to browse commands interactively.

## License

MIT