# Asyncat — Neural-Inspired AI Agent OS

> We're building an AI Agent OS modeled after the human brain.
> The agent doesn't just chat — it has memory, learns skills, gets better over time, and actually does things on your computer.

---

## The Vision

Asyncat isn't a chatbot. It's an AI Agent OS that runs locally on your machine, gives your quantized baby model superpowers, and gets smarter the more you use it.

Inspired by:
- **Hermes Agent** (Nous Research) — self-improving skills, 3-layer memory
- **OpenClaw** — multi-channel messaging, skills system
- **The actual brain** — we're modeling our architecture after neuroscience

---

## Brain Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   ASYNCAT BRAIN                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐ │
│  │  PREFRONTAL │     │   CORTEX    │     │  AMYGDALA   │ │
│  │   (Exec)    │────▶│   (Agent)   │────▶│  (Safety)   │ │
│  │             │     │             │     │             │ │
│  │  Planning   │     │  Reasoning  │     │ Permission  │ │
│  │  Prioritize │     │  Tool call  │     │  Warnings   │ │
│  │  Delegate   │     │  Decide     │     │  Context    │ │
│  └─────────────┘     └─────────────┘     └─────────────┘ │
│         │                   │                   │            │
│         ▼                   ▼                   ▼            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                   HIPPOCAMPUS                       │  │
│  │                 (Memory System)                     │  │
│  │                                                    │  │
│  │  Short-term    Long-term      Episodic    Spatial  │  │
│  │  Working Mem  ──▶ Facts ──▶ Sessions ──▶ Project  │  │
│  │  (session)     (memory.md)   (search)     (config)  │  │
│  └─────────────────────────────────────────────────────┘  │
│                           │                               │
│                           ▼                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                   CEREBELLUM                         │  │
│  │                 (Skills as Muscle Memory)             │  │
│  │                                                    │  │
│  │  Bundled skills execute automatically               │  │
│  │  — like walking, you don't "think" about them        │  │
│  │                                                    │  │
│  │  plan/  tdd/  debug/  git/  file-ops/  terminal/     │  │
│  └─────────────────────────────────────────────────────┘  │
│                           │                               │
│                           ▼                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                   BASAL GANGLIA                      │  │
│  │               (Habit Formation + Self-Improvement)   │  │
│  │                                                    │  │
│  │  Agent learns from repeated patterns               │  │
│  │  Auto-creates skills from successful workflows       │  │
│  │  Silent improvement — like human muscle memory      │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Memory System (Hippocampus)

| Layer | Storage | Purpose | Limit |
|-------|---------|---------|-------|
| Short-term | Session RAM | Current conversation | Auto-cleared |
| Semantic | `memory.md` | Facts, lessons learned | ~2KB |
| User | `user.md` | Preferences, style | ~1KB |
| Episodic | `sessions.db` FTS5 | Past conversations | Searchable |
| Spatial | Project context | File structure, conventions | Per-project |

---

## Skills (Cerebellum)

Skills are automated behaviors — like muscle memory, the agent doesn't consciously think about using them, it just does.

### Format

```yaml
---
name: plan
description: Break complex goals into executable steps
when_to_use: |
  When user wants to build something, create a plan,
  or start a new project. Use for any multi-step task.
brain_region: cerebellum
weight: 1.0
tags: [planning, agentic]
---
# Planning Skill

## When to Use
- Any multi-step task
- "build a REST API"
- "set up authentication"
- "migrate the database"

## Procedure
1. Understand the goal + constraints
2. Identify all required steps
3. Check existing files/context
4. Write a markdown plan
5. Ask for confirmation before executing
```

### Loading Strategy

- **Progressive**: Only load relevant skills in context
- **Context trigger**: Skills auto-suggest based on what user is asking
- **Slash command**: `/skills` lists all available

---

## Self-Improvement (Basal Ganglia)

The agent learns from repeated behavior patterns:

```javascript
// Pattern detection
if (workflow_repeated(3+ times)) {
  suggest_skill_creation(workflow)
}

// Silent creation
if (user_corrects_multiple_times()) {
  learn_from_feedback(pattern)
  create_improved_skill(pattern)
}
```

- Tracks tool call sequences
- Detects repeated workflows
- Auto-creates skills from successful patterns
- Silent improvement — no popup asking, just gets better

---

## Tool System

The agent's **tools** are its hands — the actual capabilities to read files, run commands, search the web, and interact with the system. Tools are executable code (JavaScript), not markdown files.

### Tool Categories

```
FILE          — read, write, edit, search, diff, copy, move, delete files
SHELL         — run commands, python, node code, docker, sandbox
SEARCH        — web search, URL fetch, HTTP
MEMORY        — store and recall facts
SCREEN        — screenshot, OCR, click, type
BROWSER       — navigate URLs, capture pages
WORKSPACE     — notes, tasks, events (kanban/calendar)
AGENT         — delegate to sub-agent
SYSTEM        — sys info, process list, clipboard, notifications
GIT           — clone, pull, commit, push, branch, log, diff, status
DEV           — linter, build runner, package manager, console reader
OS            — process kill/spawn, port scan, disk, memory, network
MCP           — call external MCP tool servers
```

### Current Tools (~50)

| Tool | Category | Permission | Description |
|------|----------|------------|-------------|
| `read_file` | file | SAFE | Read file contents with line numbers |
| `write_file` | file | MODERATE | Create or overwrite a file |
| `edit_file` | file | MODERATE | Replace specific text in a file |
| `search_files` | file | SAFE | Regex search across files |
| `list_directory` | file | SAFE | List directory contents |
| `find_files` | file | SAFE | Find files by name pattern |
| `file_diff` | file | SAFE | Compare file with git HEAD or another path |
| `glob_find` | file | SAFE | Find files by glob pattern |
| `file_copy` | file | MODERATE | Copy file to destination |
| `file_move` | file | MODERATE | Move/rename file or directory |
| `file_delete` | file | DANGEROUS | Delete file or directory |
| `file_watch` | file | SAFE | Watch file for changes |
| `run_command` | shell | DANGEROUS | Execute shell command |
| `run_python` | shell | DANGEROUS | Execute Python code |
| `run_node` | shell | DANGEROUS | Execute JavaScript code |
| `docker_run` | shell | DANGEROUS | Run command in Docker container |
| `docker_build` | shell | DANGEROUS | Build Docker image |
| `docker_ps` | shell | SAFE | List running containers |
| `docker_stop` | shell | DANGEROUS | Stop a container |
| `sandbox_exec` | shell | DANGEROUS | Run command in resource-limited sandbox |
| `web_search` | search | SAFE | Search the web |
| `fetch_url` | search | SAFE | Read webpage content (reader mode) |
| `http_request` | search | SAFE | Full HTTP client (GET/POST/etc) |
| `store_memory` | memory | SAFE | Store a persistent fact |
| `recall_memory` | memory | SAFE | Search stored memories |
| `list_memories` | memory | SAFE | List all memories |
| `take_screenshot` | screen | MODERATE | Capture screen as PNG |
| `screen_read` | screen | SAFE | OCR — extract text from screenshot |
| `screen_click` | screen | DANGEROUS | Move mouse and click |
| `screen_type` | screen | DANGEROUS | Type text at cursor |
| `screen_key` | screen | DANGEROUS | Press keyboard shortcut |
| `screen_find_window` | screen | SAFE | Find windows by title |
| `browse_url` | browser | SAFE | Fetch URL content |
| `screenshot_page` | browser | SAFE | Capture webpage screenshot |
| `get_notes` | workspace | SAFE | Get workspace notes |
| `create_note` | workspace | MODERATE | Create a note |
| `get_tasks` | workspace | SAFE | Get kanban tasks |
| `get_events` | workspace | SAFE | Get calendar events |
| `delegate_task` | agent | MODERATE | Spawn a sub-agent |
| `mcp_call` | mcp | SAFE | Call external MCP tool server |
| `sys_info` | system | SAFE | System info (CPU, RAM, disk) |
| `ps_list` | system | SAFE | List running processes |
| `env_get` | system | SAFE | Read environment variables |
| `notify` | system | SAFE | Send desktop notification |
| `run_tests` | system | MODERATE | Run project test suite |
| `clipboard_read` | system | SAFE | Read clipboard |
| `clipboard_write` | system | SAFE | Write to clipboard |
| `git_clone` | git | SAFE | Clone a git repository |
| `git_pull` | git | SAFE | Pull from remote |
| `git_status` | git | SAFE | Show working tree status |
| `git_diff` | git | SAFE | Show changes between commits |
| `git_log` | git | SAFE | Show commit history |
| `git_branch` | git | SAFE | List/create/delete/switch branches |
| `git_commit` | git | MODERATE | Stage and commit files |
| `git_push` | git | MODERATE | Push commits to remote |
| `git_stash` | git | MODERATE | Stash/pop changes temporarily |
| `git_remote` | git | SAFE | List/add/remove remotes |
| `linter_run` | dev | MODERATE | Run linter (ESLint, Ruff, etc.) |
| `code_fix` | dev | MODERATE | Auto-fix lint issues |
| `package_manager` | dev | SAFE | Run package manager commands |
| `build_runner` | dev | MODERATE | Detect and run build commands |
| `console_read` | dev | SAFE | Read application log files |
| `process_kill` | os | DANGEROUS | Kill a process by PID or name |
| `process_spawn` | os | DANGEROUS | Spawn a long-running process |
| `port_scan` | os | SAFE | Check which ports are in use |
| `disk_usage` | os | SAFE | Show disk space usage |
| `memory_detail` | os | SAFE | Detailed RAM breakdown |
| `network_check` | os | SAFE | Test connectivity to a host |

---

## Tool Roadmap

What we're building next, organized by priority.

### Tier 1 — Foundation (Core Agent) ✅ COMPLETE

```
FILE OPERATIONS    read_file ✅, write_file ✅, edit_file ✅
                   search_files ✅, list_directory ✅, find_files ✅
                   file_diff ✅, glob_find ✅, file_watch ✅
                   file_copy ✅, file_move ✅, file_delete ✅

SHELL + CODE       run_command ✅, run_python ✅, run_node ✅
                   docker_run ✅, docker_build ✅, docker_ps ✅, docker_stop ✅
                   sandbox_exec ✅

SEARCH             web_search ✅, fetch_url ✅, http_request ✅
                   deep_search — future
                   url_metadata — future
                   research_compile — future
```

### Tier 2 — Development Workflow ✅ COMPLETE

```
GIT                git_clone ✅, git_pull ✅, git_commit ✅, git_push ✅
                   git_branch ✅, git_log ✅, git_diff ✅, git_status ✅
                   git_stash ✅, git_remote ✅

DEV WORKFLOW       linter_run ✅, code_fix ✅, package_manager ✅
                   build_runner ✅, console_read ✅
                   debugger_attach — future
```

### Tier 3 — OS-Level Control ✅ COMPLETE

```
OS                 process_kill ✅, process_spawn ✅
                   port_scan ✅, disk_usage ✅, memory_detail ✅
                   network_check ✅

ALREADY EXISTS:    sys_info ✅, ps_list ✅, env_get ✅
                   notify ✅, clipboard_read ✅, clipboard_write ✅
```

### Tier 4 — Project Management (Asyncat's unique advantage)

```
ENHANCE:
- create_task       NEW — full CRUD for tasks
- update_task      NEW — update task fields, move between columns
- delete_task      NEW — archive or delete task
- get_projects     NEW — list all projects
- create_project  NEW — create new project
- get_columns      NEW — list kanban columns for project
- create_column   NEW — add column to project
- move_card        NEW — move task card between columns

ENHANCE:
- create_event     NEW — create calendar event (title, time, recurrence)
- delete_event     NEW — delete calendar event
- set_reminder     NEW — set reminder for task or event
- notes_search     NEW — full-text search across all notes
- notes_update     NEW — update existing note
- notes_delete     NEW — delete note
```

### Tier 5 — Screen + Browser Automation

```
SCREEN:
ALREADY EXISTS:
- take_screenshot ✅
- screen_read (OCR) ✅
- screen_click ✅
- screen_type ✅
- screen_key ✅
- screen_find_window ✅

NEW:
- screen_drag          drag mouse from X,Y to X,Y
- screen_scroll        scroll at current cursor
- screen_window_move   move window by title
- screen_window_resize resize window
- screen_record        record screen to video/GIF
- screen_text_copy     OCR-based select and copy text

BROWSER:
ALREADY EXISTS:
- browse_url ✅
- screenshot_page ✅

NEW:
- browser_click        click element on page
- browser_type         type into input field
- browser_scroll       scroll page
- browser_back         navigate back
- browser_forward     navigate forward
- browser_press       press keyboard key
- browser_get_links    get all links on page
- browser_get_forms    get all forms and fields
- browser_fill_form   fill and submit form
- browser_console      read browser console errors
- browser_cookies      read/write cookies
```

### Tier 6 — AI/Vision (Local model considerations)

```
VISION:
- vision_analyze     NEW — analyze image (requires vision-capable model)
                      Note: Most vision models (GPT-4V, Claude Vision) are API-only.
                      Local vision: LLaVA GGUF exists but is limited.
                      Asyncat uses tesseract OCR for screen reading (already working).
                      For actual image understanding, API access recommended for now.

- image_generate     NEW — generate image from text (DALL-E/StableDiffusion API)

TEXT AI:
- document_summarize NEW — summarize long documents
- text_translate     NEW — translate text between languages
- text_sentiment     NEW — analyze sentiment
- audio_transcribe   NEW — transcribe audio to text
- audio_speak        NEW — text-to-speech (ElevenLabs/system TTS)
```

### Tier 7 — Messaging + Notifications

```
NEW:
- send_telegram      send message via Telegram bot
- send_discord      send message via Discord webhook
- send_email        send email via SMTP
- receive_telegram  receive Telegram messages (polling/webhook)
- receive_discord   receive Discord messages
```

### Tier 8 — Delegation + Multi-Agent

```
ENHANCE:
- delegate_task    ALREADY EXISTS ✅
- delegate_wait    NEW — wait for sub-agent to complete
- delegate_cancel  NEW — cancel running sub-agent
- delegate_list    NEW — list all running sub-agents
- agent_status     NEW — check remote agent status
```

### Tier 9 — MCP (Model Context Protocol)

```
ENHANCE:
- mcp_list_servers  NEW — list all available MCP servers
- mcp_list_tools    NEW — list tools from connected MCP servers
- mcp_server_add    NEW — add new MCP server by URL
- mcp_server_remove NEW — remove MCP server
- mcp_server_status NEW — check MCP server health
- mcp_expose        NEW — expose Asyncat tools as MCP server (host mode)
```

---

## Local Model + OCR — The Reality

### Local Models (GGUF via llama.cpp)

Asyncat runs local GGUF models via `llama.cpp` (`llama-server`). This works well for:
- Text completion
- Code generation
- Reasoning (with good prompting)
- Tool calling (with proper format)

**What local models CAN do:**
- Coding tasks, refactoring, debugging
- Writing files, running commands
- Web search + research
- Memory and skill application
- Multi-step task execution

**What local models struggle with:**
- Very long context handling (window size limits)
- Complex multi-agent coordination
- Vision (most GGUF models are text-only)

### OCR — Local is Already Working

`screen_read` uses **tesseract-ocr** — which is fully local, no API needed. It works on screenshots to extract text. This is already implemented in `screenTools.js`.

### Vision AI — API Required for Now

For actual *image understanding* (not just OCR text extraction):
- GPT-4V, Claude Vision, Gemini Vision are API-only
- LLaVA GGUF exists but quality is significantly lower than API models
- **Recommendation:** Use local models for text/coding tasks, use API (OpenAI/Anthropic) for vision tasks when needed

This is a hybrid approach — not all-or-nothing.

---

## Architecture: Daemon + Messaging

### The Goal

Asyncat as a **always-on desktop agent** — like OpenClaw's gateway, but simpler.

```
asyncat server --daemon    ← runs in background, survives terminal close
                          ← systemd service or launchd
                          ← starts on machine boot

Messaging channels:
  Telegram bot  ──inbound message──▶  agent pipeline  ──▶ response
  Discord bot   ──inbound message──▶  agent pipeline  ──▶ response
  CLI/TUI      ──WebSocket────────▶  same pipeline   ──▶ streaming
```

### What's Needed

| What | Status | Priority |
|------|--------|----------|
| Always-on server (systemd/launchd) | ❌ | HIGH |
| WebSocket upgrade (bidirectional) | ❌ | HIGH |
| Telegram bot handler | ❌ | MEDIUM |
| Discord webhook handler | ❌ | MEDIUM |
| Plugin SDK + manifest | ❌ | LOW (defer) |

### Single Process (Recommended)

For MVP, a single Node process handles everything:
- Express server (HTTP + WebSocket)
- Agent runtime
- Messaging channel handlers
- Kanban/calendar/notes

Split-process (gateway + agent runtime) adds resilience but complexity. Defer until proven needed.

---

## First-Run Detection

```
~/.asyncat/
├── first-run           // Created on first successful start
├── onboard-completed   // Set after wizard finishes
├── skills/             // Cerebellum skills (bundled + user-created)
├── memory/             // Hippocampus (memories, sessions)
├── habits/              // Basal Ganglia (learned patterns)
├── credentials/        // API keys, tokens (not in git)
└── config.yaml         // User configuration
```

---

## Onboard Wizard Flow

1. **Welcome** — Cat ASCII art + "You're now the conductor"
2. **AI Provider** — Local GGUF / Cloud API / Skip
3. **API Key** (if cloud) or **Model** (if local)
4. **JWT_SECRET** — auto-generate from system entropy
5. **First credentials** — print them, ask to change password
6. **Done** — ready to go!

All automated. No manual `.env` editing required.

---

## Comparison to Hermes/OpenClaw

| Feature | Hermes | OpenClaw | Asyncat |
|---------|--------|---------|---------|
| Self-improving | ✅ | ✅ | ✅ (Basal Ganglia) |
| Skills | 45+ | 100+ | 45 + grows |
| Memory | 3-layer | 2-layer | **5-layer** |
| Local model | ✅ | ✅ | ✅ (llama.cpp) |
| FTS5 search | ❌ | ❌ | ✅ |
| Tool count | 40+ | 40+ | **61** |
| Messaging channels | 15+ | 20+ | **Planned** |
| Kanban/calendar/notes | ❌ | ❌ | ✅ |
| MCP integration | ✅ | ✅ | ✅ (basic) |
| Docker sandboxing | ❌ | ✅ | ✅ (Tier 1) |
| Daemon mode | ✅ | ✅ | **Planned** |

---

## Roadmap

### Phase 1: Foundation ✅
- [x] First-run detection
- [x] Onboard wizard
- [x] Brain architecture in agent code
- [x] Tool registry + permission system
- [x] ~61 tools implemented (file, git, docker, dev, os, shell, search, memory, screen, system)

### Phase 2: Core Skills ✅
- [x] Skill file format + loader
- [x] **45 bundled skills**
- [x] `/skills` command

### Phase 3: Memory ✅
- [x] Short-term memory (session)
- [x] Long-term memory (agent_memory table)
- [x] **Episodic search (FTS5)**
- [ ] Spatial memory (project context) — defer

### Phase 4: Self-Improvement ✅
- [x] Pattern tracking
- [x] Auto-skill creation
- [x] **Feedback learning**

### Phase 5: Tool Expansion ✅ COMPLETE
- [x] Git tools (git_clone, git_commit, git_push, git_branch, git_log, git_diff, git_status, git_stash, git_remote)
- [x] Docker + sandboxing (docker_run, docker_build, docker_ps, docker_stop, sandbox_exec)
- [x] Dev tools (linter_run, code_fix, package_manager, build_runner, console_read)
- [x] OS tools (process_kill, process_spawn, port_scan, disk_usage, memory_detail, network_check)
- [x] File tools (file_diff, glob_find, file_copy, file_move, file_delete, file_watch)
- [ ] Enhanced kanban CRUD (create_task, update_task, move_card) — Tier 4
- [ ] Screen automation (screen_drag, screen_window_move/resize) — Tier 5

### Phase 6: Daemon + Messaging
- [ ] Always-on server (systemd unit, `--daemon` flag)
- [ ] WebSocket bidirectional communication
- [ ] Telegram bot handler
- [ ] Discord webhook handler

### Phase 7: Interoperability
- [ ] MCP host mode (expose Asyncat tools via MCP)
- [ ] Plugin SDK (manifest + loader)
- [ ] Skills hub (download community skills)

---

## The "Why"

We built Asyncat because:

1. **Your computer can't run billion-dollar cloud models** — but a quantized baby model can run locally if given the right tools

2. **Cloud AI is ephemeral** — it forgets everything after each conversation. Asyncat remembers.

3. **Tools exist to be automated** — skills are muscle memory, the agent should execute them without thinking

4. **Local-first is the future** — your data, your model, your agent

5. **The brain is the perfect architecture** — we modeled after what actually works

6. **Asyncat is different** — it's the only local agent with built-in kanban/calendar/notes management, FTS5 episodic memory, and a hybrid local+API vision approach

---

## Contributing

Issues and PRs welcome. Build something cool.

🐱 — The cat watches it all burn.
