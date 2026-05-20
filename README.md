# Asyncat

Local-first AI agent workspace with a real tool-using harness, workspace apps, model/provider management, durable memory, scheduled runs, sandboxed coding workflows, and agent observability.

![Asyncat home screen](neko/public/image.png)

## What This Is

Asyncat is a self-hosted agent workspace. It combines:

- A React desktop-style web app for chat, files, projects, profiles, models, tools, skills, scheduling, and agent health.
- An Express + SQLite backend that owns auth, workspaces, files, models, providers, agent sessions, tool audit logs, sandboxes, and scheduled jobs.
- A ReAct-style `AgentRuntime` with native tool calling where supported, fallback tool parsing, permissions, plan state, compaction, memory, skills, and streaming events.
- A local and cloud model layer for OpenAI-compatible APIs, managed llama.cpp, MLX, Ollama, LM Studio, and provider-specific multimodal services.

The goal is not only "chat with files." The goal is an agent harness that can safely read, edit, test, write, research, delegate, and recover across real local workflows.

## Current Highlights

- Command Center with streaming agent runs and persistent sessions.
- File, shell, git, data, browser, search, artifact, memory, workspace, sandbox, and delegation tools.
- Read-before-write edit guard and `patch_file` exact-edit workflow for safer coding.
- Tool audit records with stable `toolCallId` correlation from backend to UI.
- Agent Health dashboard at `/agent-health` for success rates, failures, guard blocks, latency, and eval commands.
- Disposable sandbox manager for copy/worktree isolation, patch review, branch promotion, and selective file promotion.
- Deterministic and live-model agent eval harnesses.
- Tools & Skills UI for tool inventory, skill management, soul editing, and memory.
- Models UI for chat providers, local engines, audio, image, vision, and usage.
- Scheduler for recurring agent goals.

## Quick Start

### Requirements

- Node.js `20.19+`, `22.13+`, `24+`, `25+`, or `26+`
- npm
- git
- Optional: a local model runtime or an API key

### Install From Source

```bash
npm install
```

Start both services:

```bash
npm run dev
```

Or start them separately:

```bash
npm run dev:backend
npm run dev:frontend
```

Default ports:

| Service | Port |
|---|---:|
| Backend API | `8716` |
| Frontend UI | `8717` |

Open the app at `http://localhost:8717`.

### Source Launcher

The repo includes a launcher at `./cat`; the installed command is `asyncat`.

```bash
./cat start --no-open
./cat start --dev --no-open
./cat status
./cat logs
./cat stop
```

If you have a global `asyncat` installed, it may point at the installed copy under your user profile rather than this checkout.

## Login

First-run credentials are created in `den/.env`.

- Email: `admin@local`
- Password: `LOCAL_PASSWORD` from `den/.env`

## Configuration

Backend configuration lives in `den/.env`.

Common values:

```env
PORT=8716
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
MODELS_PATH=./data/models
LLAMA_SERVER_PORT=8765
```

Provider and capability settings can also be managed in the UI under Models.

## Agent Harness

The main loop lives in `den/src/agent/AgentRuntime.js`.

High-level flow:

```text
User goal
  -> AgentRuntime
  -> prompt builder + skills + memory + tool schemas
  -> model call
  -> tool parsing/native tool calls
  -> PermissionManager
  -> toolRegistry
  -> AgentSession + agent_tool_audit
  -> SSE events to Command Center
```

Important files:

| Path | Purpose |
|---|---|
| `den/src/agent/AgentRuntime.js` | Agent loop, tool execution, compaction, permissions, stop reasons |
| `den/src/agent/AgentSession.js` | Session persistence and tool audit writes |
| `den/src/agent/tools/` | Tool implementations and registry inputs |
| `den/src/agent/skills/` | Bundled procedural skills |
| `den/src/agent/prompts/agentSystemPrompt.js` | System prompt assembly |
| `den/src/agent/SandboxManager.js` | Disposable coding sandboxes and patch promotion |
| `den/src/ai/routes/aiAgentRoutes.js` | Agent HTTP/SSE routes |
| `den/src/ai/routes/agentMetricsRoutes.js` | Agent health metrics API |
| `neko/src/CommandCenter/` | Main agent UI and run feed |
| `neko/src/AgentHealth/AgentHealthPage.jsx` | Visible health dashboard |
| `neko/src/Tools/ToolsSkillsPage.jsx` | Tools, skills, soul, and memory UI |

## Agent Health

The Agent Health page is available at:

```text
/agent-health
```

Backend endpoints:

```text
GET /api/agent/metrics/summary?days=30
GET /api/agent/metrics/tools?days=30&limit=100
```

Metrics currently include total tool calls, failed calls, success rate, sessions, tools used, invalid tool arguments, read-before-write guard blocks, permission denials, average duration, and recent failures.

## Evals

Most users can run evals from the Agent Health page at `/agent-health`. The terminal commands below are for developers and operators who want CI-friendly output.

Run deterministic harness checks:

```bash
npm run eval:agent -w den
```

Run the live-model eval mode:

```bash
npm run eval:agent -w den -- --live
```

Live mode creates a disposable sandbox, runs a real `AgentRuntime` session against the currently configured model, asks the agent to edit and test a small project, validates the result, and then removes the sandbox.

Useful options:

```bash
npm run eval:agent -w den -- --live --max-rounds 12
npm run eval:agent -w den -- --live --keep-sandbox
npm run eval:agent -w den -- --live --user-id <id> --workspace-id <id>
npm run eval:agent -w den -- --json
```

## Testing

Backend tests:

```bash
npm test -w den
```

Frontend production build:

```bash
npm run build -w neko
```

Full useful loop while touching the harness:

```bash
npm test -w den
npm run eval:agent -w den
npm run build -w neko
```

Use live evals intentionally because they call the active model provider.

## Sandboxes

The sandbox system supports isolated copy or git worktree runs.

Typical flow:

1. Create a sandbox from a source workspace.
2. Run a delegated agent or manual commands inside the sandbox.
3. Review changed files and generated patch.
4. Promote selected files, create a branch, or apply a patch back to the source.
5. Delete the sandbox when done.

Sandbox data is stored under `.asyncat/sandboxes` near the source root unless `ASYNCAT_SANDBOX_DIR` is set.

## UI Areas

| Route | Area |
|---|---|
| `/home` | Command Center |
| `/conversations` | Current and historical chats |
| `/agent-health` | Agent reliability and eval entrypoints |
| `/tools` | Tool inventory and management |
| `/skills` | Skill inventory and management |
| `/models` | Chat/local/multimodal providers |
| `/profiles` | Agent profile configuration |
| `/scheduler` | Scheduled agent jobs |
| `/files` | Workspace file browser |
| `/workspace` | Projects and workspace data |
| `/settings` | App and server settings |

The Command Center context picker includes `No workspace` for prompt-only work. In that context, the agent can use the conversation, selected skills, memories, and prompt-only text attachments, but it cannot inspect local folders, run commands, or modify files.

## Repository Layout

```text
asyncat-oss/
├── cat                         # Source launcher
├── cli/                        # CLI launcher and commands
├── den/                        # Backend API and agent runtime
│   ├── scripts/run-agent-evals.js
│   ├── src/agent/
│   ├── src/ai/
│   ├── src/db/
│   └── test/
├── neko/                       # React frontend
│   ├── src/AgentHealth/
│   ├── src/CommandCenter/
│   ├── src/Models/
│   ├── src/Tools/
│   └── src/sidebar/
├── data/                       # Local SQLite DB and MCP config
└── logs/                       # Runtime logs
```

## Database

SQLite is created automatically at `data/asyncat.db` unless `DB_PATH` is set.

Core tables:

| Table | Purpose |
|---|---|
| `users` | Local users |
| `workspaces` | Workspace ownership |
| `agent_sessions` | Persisted agent runs |
| `agent_tool_audit` | Per-tool call audit trail and metrics source |
| `agent_memory` | Durable agent memory |
| `agent_profiles` | Agent profile settings |
| `agent_sandboxes` | Disposable sandbox metadata |
| `agent_sandbox_jobs` | Sandbox command jobs |
| `scheduled_jobs` | Recurring agent work |

## Model Providers

Asyncat supports local and cloud providers from the Models page.

Chat providers include OpenAI-compatible endpoints, OpenAI, Anthropic, Gemini, xAI, Mistral, DeepSeek, Groq, Together, Perplexity, Cohere, Fireworks, Cerebras, DeepInfra, NVIDIA NIM, OpenRouter, Hugging Face, Azure OpenAI, Amazon Bedrock, Ollama, LM Studio, and built-in llama.cpp.

Capability providers cover STT, TTS, image generation, and vision where supported.


## License

MIT
