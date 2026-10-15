# neko — Asyncat Frontend

The browser interface for your AI Agent OS.

> The window into your computer's soul. If your computer had a soul. Which it doesn't. But the AI might.

Built with **React 19**, **Vite 6**, and **TailwindCSS 4**.

## What it is

The UI for the full Asyncat experience:

- **Chat** — one chat box for direct model chat and agent runs (Plan, Action, and Yolo), streaming, tool approvals, memory, a model of its own per chat, temporary chats, and `Cmd/Ctrl+K` search with pinned chats; a chat can also be answered by Claude Code or Codex
- **Projects** — instructions, files the agent knows, chats and optional folders, sized to the model's context window
- **Notes** — documents the agent writes in chat, opened in a block editor with tables, charts, media, and DOCX/PDF export
- **Claude Code & Codex** — sessions from this computer in the sidebar, and Agents → Coding agents
- **Models** — LLM providers, local models and their engines, **Voice**, **Images**, and **Training** (LoRA fine-tuning, marked Labs)
- **Customize** — Models, Agents (your agents and coding agents) and Tools & Skills, grouped in the sidebar
- **Cats** — agents that work on their own, on a schedule or when something happens, and report in their own chat and the Cats inbox
- **Terminal** — integrated xterm.js terminal (desktop app) plus live agent process output
- **Built-in browser** shared with the agent (it runs in the desktop app)
- **Files** — what agents made, with a viewer for each, and everything else Asyncat keeps on this computer
- **Settings** — General, Appearance, Personalization, Shortcuts, Notifications, Connections, Privacy & safety, Workbench, Desktop, and About

## Getting started

### Install

Run `npm install` from the repository root. Its postinstall copies
`neko/.env.example` to `neko/.env` when it doesn't exist yet.

### Configure

```env
VITE_USER_URL=http://127.0.0.1:8716
VITE_MAIN_URL=http://127.0.0.1:8716
VITE_NOTES_URL=http://127.0.0.1:8716
```

All three point at the local den backend.

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

- **General** — your name and picture, how new chats start, what closing the window does, and running setup again
- **Appearance** — theme, motion and what the sidebar shows
- **Personalization** — what Asyncat should know about you, how it answers, and its instructions file
- **Shortcuts** — keys for getting around Asyncat, and the ones that work from any app
- **Notifications** — what shows a notification, for chats and Cats, and quiet hours
- **Connections** — connectors (MCP servers) and the services Asyncat uses
- **Privacy & safety** — what agents may do and where they may go, saved keys, and your data: where it lives, export it, delete it
- **Workbench** — the browser and terminal beside your chats
- **Desktop** — the pet, Quick ask, Asyncat's data folder and (on Windows) uninstalling
- **About** — version, updates and developer options

Projects have their own pages, engines are under Models → Local models, and
logs and caches are in Files.

## Errors and confirmations

Report a failed action with `useToast()` from `src/components/toastContext.js`
(`toast.error("Couldn't save", { detail: errorDetail(err) })`) rather than only logging it, and ask
before destructive actions with `useConfirm()`. Both providers are mounted
once in `src/router/AppRouter.jsx`.

## Themes

Light, Dark, Midnight, and System (the default).

Colours are semantic tokens defined once per theme in `src/index.css`, so one
class covers all three themes:

```css
bg-canvas bg-surface bg-hover text-fg text-fg-muted border-line text-accent
```

Every screen uses them, and Dark and Midnight are plain greys: don't colour
app chrome with Tailwind's gray, slate or indigo scales or with `dark:` and
`midnight:` variants.

## Shared UI pieces

`src/components/ui/` holds the building blocks screens use: `Button` and
`IconButton`, `Dialog`, `Menu` (with `MenuItem`), `Popover`, `Tooltip`, `Tabs`
and `Segmented`, `Field`/`Input`, `Select` and `Combobox` (never a native
`<select>`), `Switch`, `Checkbox`, `RadioGroup`, `SearchField`, `Progress`,
`Rows`, `Notice`, `PageHeader`, `AsyncatMark` (the logo) and `Cat` (the
mascot, in several poses).

## License

MIT
