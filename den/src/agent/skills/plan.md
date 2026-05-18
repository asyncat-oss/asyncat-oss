---
name: plan
description: Break complex goals into executable, verifiable steps with recovery strategies
brain_region: cerebellum
weight: 1.0
tags: [planning, agentic]
when_to_use: |
  When user wants to build something, create a plan,
  or start a new project. Use for any multi-step task.
---
# Planning Skill

## When to Use
- Any task with 3+ steps
- "Build a REST API"
- "Set up authentication"
- "Refactor the codebase"
- "Create a new feature with tests"

## Procedure

### 1. Gather Context First (CRITICAL)
Do NOT plan blindly. Before creating a plan:
- Read the project structure with `list_directory`
- Read key files (package.json, config, entry point)
- Use `find_definition` or `code_search` to understand existing patterns

### 2. Break Into Atomic Steps
Each step must be:
- **Completable in 1-3 tool calls** (not "build the whole feature")
- **Independently verifiable** (has a clear success criterion)
- **Ordered by dependency** (don't edit a file before creating it)

### 3. Write the Plan with `todo_write`
```json
{
  "name": "todo_write",
  "arguments": {
    "todos": [
      {"content": "Read existing auth middleware", "status": "in_progress", "activeForm": "Reading auth middleware"},
      {"content": "Create JWT validation utility", "status": "pending", "activeForm": "Creating JWT utility"},
      {"content": "Add login endpoint to routes", "status": "pending", "activeForm": "Adding login endpoint"},
      {"content": "Write tests for login flow", "status": "pending", "activeForm": "Writing login tests"},
      {"content": "Run tests and verify", "status": "pending", "activeForm": "Running verification"}
    ]
  }
}
```

### 4. Execute Each Step
For each step:
1. Update status to `in_progress` with `todo_write` (merge mode)
2. Do the work (read → edit → verify)
3. Update status to `completed`
4. Move to next step

### 5. Handle Failures Mid-Plan
If a step fails:
- **Do NOT skip it.** Re-read the relevant files.
- **Do NOT repeat the same failed approach.** Try a different strategy.
- **If truly blocked**, mark it as completed with a note and continue with remaining steps.
- **Update the plan** if you discover the original plan was wrong. Adding/removing steps is fine.

### 6. When "Continue" is Requested
If the user says "continue" and there are incomplete plan items:
- Review which items are still pending/in_progress
- Pick up from where you left off — don't restart from scratch
- Re-read any files that may have changed since the last run

## Plan Quality Checklist
- [ ] Each step is 1 sentence (imperative form)
- [ ] Each step has a clear "done" condition
- [ ] No step says "implement the feature" (too vague)
- [ ] Steps are ordered by dependency
- [ ] Verification step is included at the end
- [ ] Plan has ≤ 10 steps (split into phases if more)

## Anti-Patterns
- ❌ Planning before reading any code
- ❌ Steps like "understand the codebase" (too vague)
- ❌ More than 10 steps (break into phases)
- ❌ Skipping the verification step
- ❌ Not updating plan status as you work