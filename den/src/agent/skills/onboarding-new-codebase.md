---
name: onboarding-new-codebase
description: Systematic approach to understanding an unfamiliar codebase — structure, patterns, entry points, conventions
brain_region: hippocampus
weight: 1.0
tags: [onboarding, exploration, codebase, architecture, understanding, new-project]
when_to_use: |
  When asked to explore, understand, or summarize an unfamiliar repository
  before making changes. Also use at the start of any task in a project
  you haven't worked in before.
---
# Onboarding a New Codebase

## Start With the Borders, Not the Middle
Don't start by reading random files. Read the map first.

1. **Root-level files**: `README.md`, `package.json` / `pyproject.toml` / `go.mod`, `Makefile`, `docker-compose.yml` — these tell you what the project is and how to run it.
2. **Directory structure**: One level deep. Note which directories exist and what they likely contain (`src/`, `app/`, `lib/`, `services/`, `tests/`, `docs/`, `scripts/`).
3. **Entry points**: Where does the program start? (`main.ts`, `index.js`, `app.py`, `cmd/main.go`, `server.js`)
4. **Config files**: `.env.example`, `tsconfig.json`, `vite.config.ts`, `next.config.js` — tells you the build system, environment, and key settings.

## Understand the Architecture
5. **Package/module boundaries**: What are the top-level modules? Are they split by feature, layer (controllers/services/models), or domain?
6. **Database schema**: Find migrations or schema files. What data does this system manage?
7. **API surface**: Route files, OpenAPI spec, GraphQL schema — what does this expose?
8. **Dependencies**: Major packages in `package.json` / `requirements.txt` — what frameworks, ORMs, and key libraries are in use?

## Find the Key Paths
9. **A simple request end-to-end**: Pick one API endpoint or page and trace it from entry (route) → handler → service → DB → response.
10. **Authentication**: How are users authenticated? (JWT, sessions, OAuth, API keys?)
11. **Tests**: Look at one test file — they document expected behavior clearly.

## Note Conventions
12. **Naming**: camelCase vs snake_case? File per component vs barrel exports?
13. **Error handling**: How are errors propagated? Exceptions, Result types, error codes?
14. **Code style**: Tabs or spaces, lint rules, formatter config.

## Summary Format
After exploration, produce a structured summary:
- **What it is**: one-line description
- **Stack**: languages, frameworks, key libraries
- **Architecture**: layers / modules and their responsibilities
- **Entry points**: where to start reading for each major feature area
- **Conventions**: naming, error handling, testing approach
- **Open questions**: anything that needs clarification before making changes

## Guardrails
- Read before writing — never modify a file you haven't read in this codebase.
- Don't assume conventions from other projects — observe what's actually here.
- If something looks unusual or inconsistent, note it rather than "fixing" it unasked.
- Save important findings to memory so future sessions don't repeat the exploration.
