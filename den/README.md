# den — Asyncat Backend

The unified backend monolith for [Asyncat](https://asyncat.com) — merged from 7 microservices into a single Express app for simple self-hosting and open-source deployment.

Built with **Node.js 20+** and **Express 4**.

## What it is

Den is a single Express server that handles every backend concern for Asyncat:

| Domain | Routes | Source |
|---|---|---|
| AI / Chat / Build / Packs | `/api/ai/*` | `src/ai/` |
| Study Lab (flashcards, recall, mind maps) | `/api/studylab/*` | `src/ai/` |
| MCP OAuth + tools | `/mcp/*`, `/.well-known/*` | `src/ai/` |
| Users | `/api/users/*` | `src/users/` |
| Teams / Workspaces | `/api/teams/*` | `src/users/` |
| Projects | `/api/projects/*` | `src/users/` |
| Dashboard | `/api/dashboard/*` | `src/users/` |
| Calendar events | `/api/events/*` | `src/calendar/` |
| Event invites | `/api/event-invites/*` | `src/calendar/` |
| Habits | `/api/habits/*` | `src/habits/` |
| Kanban cards | `/api/cards/*` | `src/kanban/` |
| Kanban columns | `/api/columns/*` | `src/kanban/` |
| Kanban dependencies | `/api/dependencies/*` | `src/kanban/` |
| Time tracking | `/api/time/*` | `src/kanban/` |
| Notes | `/api/notes/*` | `src/notes/` |
| Note attachments | `/api/attachments/*` | `src/notes/` |
| Shared attachments | `/api/shared-attachments/*` | `src/notes/` |
| File storage | `/api/teams/:teamId/projects/*` | `src/storage/` |

## Getting started

### Prerequisites

- Node.js 20+
- A Supabase project (cloud at [supabase.com](https://supabase.com) or self-hosted)
- An AI provider (Azure OpenAI, OpenAI, or a local Ollama/llama.cpp instance)

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` with your values. Minimum required to boot:

```env
PORT=3000
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
```

### Run (development)

```bash
npm run dev
```

Server starts at `http://localhost:3000`.

### Run (production)

```bash
npm start
```

## AI provider

Den supports any **OpenAI-compatible** API endpoint. Set these three env vars:

| Provider | `AI_BASE_URL` | `AI_MODEL` |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| Azure OpenAI | `https://your-resource.openai.azure.com/openai/v1/` | your deployment name |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |
| llama.cpp server | `http://localhost:8080/v1` | `local` |

> Note: Tool calling (the AI taking actions on tasks, events, etc.) requires a model that supports function calling. Llama 3.1 8B+ and Mistral work well. Smaller models may not support it reliably.

## Database

Den uses **Supabase** (PostgreSQL + Auth + RLS) as its data layer. You need:

1. A Supabase project with the Asyncat schema applied
2. The three Supabase env vars set (`URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`)

Migrations are in `../supabase/migrations/` (coming soon — currently in the hosted Supabase project).

## File storage

Currently uses **Azure Blob Storage**. Set `AZURE_STORAGE_ACCOUNT` and `AZURE_STORAGE_ACCOUNT_KEY` in `.env`.

If no storage credentials are provided, den will boot normally but file upload/download endpoints will return errors. A local/MinIO storage adapter is planned.

## Billing

Billing is disabled by default (`BILLING_ENABLED=false`). In this mode:
- No AI usage limits are enforced
- No Stripe calls are made
- All plan features are available to all users

Set `BILLING_ENABLED=true` and configure your Stripe keys only if you are running a hosted/paid version.

## Project structure

```
src/
├── index.js          Entry point — mounts all routes, CORS, middleware
├── ai/               AI chat, Study Lab, MCP (from asy_b_main)
│   ├── routes/
│   └── controllers/
├── users/            Users, teams, projects, dashboard (from asy_b_users)
│   ├── routes/
│   └── controllers/
├── calendar/         Events, invites (from asy_b_calendar)
│   ├── routes/
│   └── services/
├── habits/           Habit tracking (from asy_b_habit)
│   ├── routes/
│   └── controllers/
├── kanban/           Cards, columns, time, dependencies (from asy_b_kanban)
│   ├── routes/
│   └── controllers/
├── notes/            Notes, attachments, versions (from asy_b_notes)
│   ├── routes/
│   └── controllers/
└── storage/          File storage (from asy_b_storage)
    ├── routes/
    └── middleware/
```

## Roadmap (open source)

- [ ] Export Supabase schema as portable SQL migrations
- [ ] Abstract AI provider (multi-provider config)
- [ ] Abstract storage (local disk / MinIO / S3)
- [ ] Replace Supabase Auth with built-in JWT auth for fully self-hosted setups
- [ ] `docker-compose.yml` for one-command local setup
- [ ] Remove Supabase dependency for solo / offline mode
