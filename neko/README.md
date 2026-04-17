# neko — Asyncat Frontend

The React frontend for [Asyncat](https://asyncat.com) — an AI-powered all-in-one workspace for teams and individuals.

Built with **React 19**, **Vite 6**, and **TailwindCSS 4**.

## What it is

Neko is the browser-based UI for the full Asyncat product:

- AI Command Center — streaming chat, Build mode, Ghost mode, artifact rendering
- Kanban boards with drag-and-drop, dependencies, and time tracking
- Collaborative block-based notes with version history
- Calendar with event invites
- Habit tracker with XP and streaks
- Study Lab — flashcards (SM-2), active recall quizzes, mind maps
- File storage
- MCP (Model Context Protocol) integration for external AI clients
- Workspace and team management

## Getting started

### Prerequisites

- Node.js 20+
- A running instance of **den** (the backend) — see `../den/README.md`

### Install

```bash
npm install
```

### Configure

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Key variables:

| Variable | Description |
|---|---|
| `VITE_API_URL` | URL of the den backend (e.g. `http://localhost:3000`) |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |

### Run (development)

```bash
npm run dev
```

App runs at `http://localhost:5173` by default.

### Build (production)

```bash
npm run build
```

Output goes to `dist/`. Serve with any static file host (nginx, Caddy, Azure Static Web Apps, Netlify, etc.).

## Themes

Three built-in themes: **Light**, **Dark**, and **Midnight**. Selected per user, persisted to `localStorage`.

When adding Tailwind classes always include midnight variants alongside dark:
```
bg-white dark:bg-gray-900 midnight:bg-gray-950
```

## Project structure

```
src/
├── CommandCenter/     AI chat (context, API, renderers, tool call cards)
├── StudyLab/          Flashcards, active recall, mind maps
├── Packs/             AI workflow packs
├── projects/          Project management views
├── calendar/          Calendar
├── habits/            Habit tracker
├── notes/             Notes editor
├── storage/           File storage
├── sidebar/           App sidebar
├── Settings/          User settings
├── auth/              Login, signup, invite flows
├── router/            AppRouter.jsx — all route definitions
└── appcontainer/      AppLayout.jsx — shell + page detection
```

## Adding a new feature

1. Build your page component(s) in `src/<feature>/`
2. Add routes to `src/router/AppRouter.jsx`
3. Add sidebar nav if it is a top-level section
4. Add page detection to `src/appcontainer/AppLayout.jsx` `getPageFromRoute()`
5. Add API methods to the relevant `*Api.js` file in the feature folder
