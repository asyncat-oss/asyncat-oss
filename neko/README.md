# neko — Asyncat Frontend

The browser interface for your AI Agent OS.

> The window into your computer's soul. If your computer had a soul. Which it doesn't. But the AI might.

Built with **React 19**, **Vite 6**, and **TailwindCSS 4**.

## What it is

The UI for the full Asyncat experience:

- **Agent Chat** — streaming, function calling, memory
- **Terminal** — in-browser command execution
- **Notes** — block-based editor
- **Habits** — XP and streaks
- **Settings** — profile, appearance, integrations, and server config

## Getting started

### Install

```bash
npm install
```

Auto-creates `.env` from `.env.example`.

### Configure

```env
VITE_API_URL=http://127.0.0.1:8716
```

### Run

```bash
npm run dev    # http://localhost:8717
npm run build  # production build to dist/
```

## Local access

The frontend opens directly into the app. Asyncat is a local desktop tool and
does not have a login, password, or account session.

## Settings

- **Profile** — local display name and avatar
- **Workspace** — workspace name and icon
- **Appearance** — light/dark/midnight
- **Connections** — external integrations
- **Advanced** — storage and local server config

## Themes

Light, Dark, Midnight.

When adding Tailwind classes:

```css
bg-white dark:bg-gray-900 midnight:bg-gray-950
```

## License

MIT
