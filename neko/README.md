# neko — Asyncat Frontend

The browser interface for your AI Agent OS.

> The window into your computer's soul. If your computer had a soul. Which it doesn't. But the AI might.

Built with **React 19**, **Vite 6**, and **TailwindCSS 4**.

## What it is

The UI for the full Asyncat experience:

- **Command Center** — Chat (direct model chat) and Work (agent runs with Plan, Action, and Yolo modes), streaming, tool approvals, memory
- **Projects & Tasks** — kanban and list views
- **Notes** — block-based editor with tables, charts, media, and DOCX/PDF export
- **Models** — LLM providers, local models and runtimes, audio and image models
- **Tools & Skills**, **Agents** (profiles), **Workflows**, **Schedules**, **Activity**, **Training**
- **Terminal** — integrated xterm.js terminal (desktop app) plus live agent process output
- **Built-in browser** shared with the agent
- **Settings** — profile, appearance, integrations, and server config

## Getting started

### Install

Run `npm install` from the repository root. Its postinstall copies
`neko/.env.example` to `neko/.env` when it doesn't exist yet.

### Configure

```env
VITE_USER_URL=http://127.0.0.1:8716
VITE_MAIN_URL=http://127.0.0.1:8716
VITE_NOTES_URL=http://127.0.0.1:8716
VITE_KANBAN_URL=http://127.0.0.1:8716
```

All four point at the local den backend.

### Run

```bash
npm run dev    # http://localhost:8717
npm run build  # production build to dist/
npm run lint   # ESLint
```

## Local access

The frontend opens directly into the app. Asyncat is a local desktop tool and
does not have a login, password, or account session.

## Settings

- **Profile** — local display name and avatar
- **Projects** — create projects and control their local folder access
- **Appearance** — theme, navigation, motion, desktop pet, keyboard shortcuts
- **Connections** — external integrations
- **Workbench** — built-in browser, terminal, and layout
- **Runtime** — managed local engines
- **Advanced** — storage & logs, local server config
- **About** — version, updates, and (on Windows) uninstall

## Themes

Light, Dark, Midnight, and System (the default).

When adding Tailwind classes:

```css
bg-white dark:bg-gray-900 midnight:bg-gray-950
```

## License

MIT
