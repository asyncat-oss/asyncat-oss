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
│  │  Planning   │     │  Reasoning │     │ Permission │ │
│  │  Prioritize │     │  Tool call │     │  Warnings  │ │
│  │  Delegate   │     │  Decide    │     │  Context   │ │
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
│  │                 (Habit Formation + Self-Improvement)  │  │
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

## Pitfalls
- Don't over-plan upfront
- Keep plans to ~10 steps max
- Get user sign-off before running

## Example Output
# Plan: REST API for Users

## 1. Create route handler
- `POST /api/users`
- `GET /api/users`
- Validation with Zod

## 2. Add to database
- New migration
- TypeScript types

## 3. Tests
- Unit tests for handler
- Integration test

## Verification
Does this plan make sense?
```

### Core Skills (Starting Set — 15 skills)

| Skill | Description |
|-------|-------------|
| `plan` | Break goals into executable steps |
| `tdd` | Test-driven development cycle |
| `systematic-debugging` | Root cause investigation |
| `code-review` | Review changes before commit |
| `file-operations` | Safe file read/write/delete |
| `search-grep` | Regex search across files |
| `terminal-commands` | Run shell commands safely |
| `project-context` | Understand project structure |
| `read-codebase` | Explore and summarize code |
| `git-workflow` | Branch, commit, PR workflow |
| `web-search` | Search the web |
| `fetch-url` | Read any webpage |
| `api-client` | HTTP requests |
| `memory-manage` | Store/recall memories |
| `context-inject` | Add context from files |

### Loading Strategy

- **Progressive**: Only load relevant skills in context
- **Context trigger**: Skills auto-suggest based on what user is asking
- **Slash command**: `/skills` lists all available

---

## Self-Improvement (Basal Ganglia)

The agent learns from repeated behavior pattern:

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

## First-Run Detection

```
~/.asyncat/
├── first-run          // Created on first successful start
├── onboard-completed // Set after wizard finishes
├── skills/           // Cerebellum skills
├── memory/            // Hippocampus (memories, sessions)
├── habits/            // Basal Ganglia (learned patterns)
└── config.yaml       // User configuration
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

| Feature | Hermes | OpenClaw | Asyncat (ours) |
|---------|--------|-----------|---------------|
| Self-improving | ✅ | ✅ | ✅ (Basal Ganglia) |
| Skills | 118 | 100+ | 15 (start) → grows |
| Memory | 3-layer | 2-layer | 4-layer (Spatial added) |
| Channels | 15+ | 20+ | CLI + Web (for now) |
| Brain-inspired | ❌ | ❌ | ✅ |
| Local-first | ✅ | ✅ | ✅ |
| Runs locally | ✅ | ✅ | ✅ |

---

## Roadmap

### Phase 1: Foundation
- [ ] First-run detection
- [ ] Onboard wizard
- [ ] Brain architecture in agent code

### Phase 2: Core Skills
- [ ] Skill file format + loader
- [ ] 15 bundled skills
- [ ] `/skills` command

### Phase 3: Memory
- [ ] Short-term memory (session)
- [ ] Long-term memory (memory.md + user.md)
- [ ] Episodic search (FTS5)
- [ ] Spatial memory (project context)

### Phase 4: Self-Improvement
- [ ] Pattern tracking
- [ ] Auto-skill creation
- [ ] Feedback learning

### Phase 5: Polishing
- [ ] More skills
- [ ] Skills hub
- [ ] Messaging gateway (future)

---

## The "Why"

We built Asyncat because:

1. **Your computer can't run billion-dollar cloud models** — but a quantized baby model can run locally if given the right tools

2. **Cloud AI is ephemeral** — it forgets everything after each conversation. Asyncat remembers.

3. **Tools exist to be automated** — skills are muscle memory, the agent should execute them without thinking

4. **Local-first is the future** — your data, your model, your agent

5. **The brain is the perfect architecture** — we modeled after what actually works

---

## Contributing

Issues and PRs welcome. Build something cool.

🐱 — The cat watches it all burn.