---
name: git-workflow
description: Safe Git workflow for inspecting, staging, committing, branching, pulling, and pushing
brain_region: cerebellum
weight: 1.0
tags: [git, version-control, workflow, coding]
when_to_use: |
  When asked to inspect Git state, review diffs, create/switch branches,
  commit changes, pull, push, stash, or prepare work for review.
---
# Git Workflow

## Default Order
1. Inspect: `git status --short --branch` and `git diff --stat`.
2. Review: inspect the actual diff before staging or committing.
3. Stage intentionally: stage only files related to the requested work.
4. Commit only with a clear message and only after verification when practical.
5. Push only when asked or when the workflow clearly requires publishing.

## Safety Rules
- Do not run destructive commands such as `git reset --hard`, `git clean`, force push, or hard checkout unless the user explicitly asks.
- Before `git pull`, check for local changes and mention conflict risk if dirty.
- Before committing, check for secrets, unrelated files, generated noise, and missing tests.
- Never hide failed verification behind a commit.

## Commit Messages
Use concise conventional prefixes when they fit:
- `feat:` new user-facing behavior
- `fix:` bug fix
- `test:` tests
- `refactor:` behavior-preserving code change
- `chore:` tooling or maintenance

## Verification
- Final answer should include branch, staged/committed files, commit hash if created, and verification commands run.
