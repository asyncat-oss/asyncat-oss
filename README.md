# Asyncat — AI Agent OS

> Forget the "productivity workspace" marketing. Forget the Kanban boards.
>
> This is about one thing: giving full, unbridled access to your entire computer to a quantized local model that is arguably less intelligent than a caffeinated squirrel.

---

## What is Asyncat?

**A local AI Agent OS.**

We build tools for the brave. Tools for file access, tools for web access, and tools for things you only dream of in your most caffeinated nightmares.

Your computer can't run those multi-billion-dollar cloud models. It can only run these stupid, tiny, quantized baby models.

**We're here to help those baby models feel powerful.**

We give them the tools to touch your files, browse your web, and watch your CPU temperature hit the ceiling.

---

## The Particular Set of Skills

> "I don't know who you are. I don't know what you want. But what I do have are a very particular set of skills... skills that make me a nightmare for your file system. If you let me in now, that'll be the end of it. I will look for your files, I will find them, and I will probably rename them incorrectly."

Asyncat gives your local model:
- **Full file system access** — read, write, delete, execute
- **Web browsing** — fetch URLs, search the web
- **Terminal execution** — run commands, scripts, anything
- **Clipboard & notifications** — system integration
- **Memory that persists** — across sessions, across restarts
- **MCP integration** — connect external tools

---

## Who is this for?

### Solo Mode (default)

- You have a computer
- You have a local model (or an API key)
- You want an AI that *actually does things*, not just chats

**Zero config. Works out of the box.**

```
npm i -g @asyncat/asyncat
asyncat start
```

Default login: `admin@local` / `changeme`

---

## We are a small collective

Some say we are a shadowy cabal of tech-elites. Others say we are just a bunch of sleep-deprived computer science undergraduates who decided that building an AI Agent OS was more important than studying for finals.

Both are probably true.

We don't have offices. We don't have VCs. We certainly don't have a safety department.

We just have code, a lot of GGUF files, a few pending lab reports, and a cat that watches it all burn.

---

## Quick Start

### Requirements

- **Node.js 20+**
- **A local model** (GGUF in `den/data/models/`) **or** an API key
- **Windows local models:** Python 3.10+ and the Microsoft C++ Build Tools if you use the Python llama server fallback

### Install

```bash
npm i -g @asyncat/asyncat
```

### Run

```bash
asyncat start
```

Opens at `http://localhost:8717`.

### Log in

- Email: `admin@local`
- Password: `changeme`

Done. The AI has keys to your kingdom.

---

## The CLI

```bash
asyncat start        # fire it up
asyncat stop        # kill it
asyncat status      # what's running
asyncat restart     # bounce
asyncat logs        # tail logs
asyncat doctor      # health check
asyncat config      # mess with env
```

---

## AI Options

### Local (recommended)

Drop a GGUF file in `den/data/models/`. Asyncat runs its own llama-server.

```env
LLAMA_SERVER_PORT=8765
MODELS_PATH=./data/models
```

#### Windows local model setup

Windows does Windows things, so Asyncat checks for local inference in this order:

1. `LLAMA_BINARY_PATH` pointing to `llama-server.exe`
2. `llama-server.exe` on `PATH`
3. `llama-cpp-python[server]` through Python

For most Windows users, either install a llama.cpp release that includes `llama-server.exe`, or install the Python server package:

```powershell
python -m pip install --upgrade "llama-cpp-python[server]"
```

If pip builds from source, install **Microsoft C++ Build Tools** first. In the Visual Studio installer, select **Desktop development with C++**. After installing, reopen PowerShell and verify:

```powershell
python -c "from llama_cpp.server.__main__ import main; print('server ok')"
```

You do not need to manually copy binaries into Asyncat. If `llama-server.exe` is not on `PATH`, set this in `den/.env`:

```env
LLAMA_BINARY_PATH=C:\path\to\llama-server.exe
```

### Cloud

Any OpenAI-compatible API:

```env
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
```

| Provider | URL | Model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | gpt-4o |
| Anthropic | `https://api.anthropic.com/v1` | claude-sonnet-4-5 |
| Ollama | `http://localhost:11434/v1` | llama3.1 |
| Anything else | your endpoint | your model |

---

## Tools the Agent Has

- `read_file` — read any file
- `write_file` — write or overwrite
- `edit_file` — patch specific lines
- `delete_file` — rm -rf (with permission)
- `list_dir` — ls anything
- `grep_search` — regex search
- `run_command` — execute shell
- `run_python` — sandboxed Python
- `run_node` — sandboxed JS
- `web_search` — DuckDuckGo / SearXNG
- `fetch_url` — read any webpage
- `http_request` — full HTTP client
- `sys_info` — CPU, RAM, disk, uptime
- `ps_list` — running processes
- `env_get` — read env vars (secrets masked)
- `notify` — desktop notifications
- `clipboard_read` / `clipboard_write`
- `store_memory` / `recall_memory` — persistent storage
- `mcp_call` — external MCP tools

---

## Configuration

### From the UI

Settings → Server to change:
- JWT_SECRET
- AI_API_KEY
- SOLO_PASSWORD

### From the terminal

```bash
asyncat config get AI_MODEL
asyncat config set AI_MODEL=gpt-4o-mini
asyncat restart
```

---

## No Cloud. No Teams. No Subscription.

This is the full stack. Running on your machine. Your data. Your model.

> "Don't give it sudo access. Unless you want to. We aren't your parents."

---

## License

MIT

---

## Contributing

Issues and PRs welcome. No safety department. No corporate oversight.

Good luck. Have fun. Don't blame us if your quantized baby model deletes your homework.

🐱

---

## For Developers

### Running from Source

If you cloned the repo instead of installing via npm, here's how to run:

```bash
# 1. Install dependencies
npm install

# 2. Start the CLI (interactive terminal UI)
node cat               # Windows
./cat                  # Mac/Linux
npm run cli            # Cross-platform alternative

# 3. Or run components separately
npm run dev:backend    # den/ server only (port 8716)
npm run dev:frontend   # neko/ UI only (port 8717)
```

### Why `./cat` Doesn't Work on Windows

The `cat` file starts with `#!/usr/bin/env node` — this is a **shebang**, a Unix/Mac/Linux feature that tells the OS to run the script with Node.js. Windows doesn't understand shebangs.

**On Windows:** Use `node cat` instead.

### Project Architecture

```
asyncat-oss/
├── cat          # Simple launcher script (shebang → cli/index.js)
├── cli/         # Terminal User Interface (TUI)
│   ├── index.js # Main CLI entry
│   ├── commands/  # Individual commands (start, stop, models, etc.)
│   ├── lib/     # TUI helpers, themes, colors
│   └── skills/  # Brain skills (45 bundled)
├── den/         # Backend API server
│   └── src/     # Agent runtime, tools, database
├── neko/        # Frontend web UI (Vite + React)
└── data/        # Models, MCP config
```

| Directory | Purpose | Port |
|-----------|---------|------|
| `cli/` | Terminal interface | N/A (runs in terminal) |
| `den/` | Backend API | 8716 |
| `neko/` | Web UI | 8717 |

### npm Scripts

```bash
npm run cli           # Start TUI (node cat)
npm run dev           # Start both backend + frontend
npm run dev:backend   # Backend only
npm run dev:frontend  # Frontend only
npm run build         # Build frontend for production
```

### Key Files

- `cat` — 2-line launcher: `#!/usr/bin/env node` + `import('./cli/index.js')`
- `cli/index.js` — Main TUI with all commands
- `cli/commands/` — Individual command implementations
- `den/src/` — Backend agent, tools, database
- `neko/src/` — React frontend components

### Database

The backend uses SQLite (`den/data/`). It's created automatically on first run.

### Environment

- `.env` files are auto-created by `scripts/postinstall.js`
- Config: `den/.env` (backend settings)
