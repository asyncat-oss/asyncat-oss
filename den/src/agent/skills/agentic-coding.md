---
name: agentic-coding
description: End-to-end autonomous coding workflow for inspecting, editing, verifying, and reporting
brain_region: cerebellum
weight: 1.1
tags: [coding, implementation, agentic, git, testing]
when_to_use: |
  When asked to implement, fix, improve, refactor, test, review,
  or otherwise do coding work in a repository.
---
# Agentic Coding

## Workflow
1. Inspect first: read the relevant files, repo scripts, and current Git state.
2. Plan briefly: identify the smallest safe change and verification path.
3. Edit carefully: follow existing patterns and avoid unrelated churn.
4. Verify: run focused tests, lint, build, or a smoke check appropriate to the change.
5. Report clearly: changed behavior, files touched, verification, and any remaining risk.

## Tool Preferences
- Use structured file tools for edits and `git_status`/`git_diff` for review.
- Use shell commands for package scripts, tests, and build checks.
- Prefer narrow verification before broad verification.
- Before committing, inspect the diff and stage intentionally.

## Guardrails
- Do not overwrite user changes unless explicitly asked.
- Do not run destructive Git commands by default.
- Do not claim a test/build passed unless it actually ran successfully.
- If blocked by missing dependencies or permissions, explain the blocker and the next best check.
