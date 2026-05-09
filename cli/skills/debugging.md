---
name: systematic-debugging
description: Evidence-first debugging for code, tests, runtime errors, and regressions
brain_region: cerebellum
weight: 1.0
tags: [debugging, investigation, troubleshooting, coding]
when_to_use: |
  When there are errors, failing tests, broken builds, regressions,
  unexpected behavior, logs, or "it doesn't work" reports.
---
# Systematic Debugging

## Workflow
1. Gather evidence: read the full error, stack trace, logs, failing test, and recent Git diff.
2. Reproduce narrowly: run the smallest command or scenario that shows the failure.
3. Isolate cause: compare expected vs actual behavior and inspect the responsible code path.
4. Fix the root cause with the smallest safe change.
5. Verify by rerunning the original failing scenario and any focused regression tests.

## Coding Rules
- Do not guess and patch randomly.
- Do not change multiple unrelated things at once.
- Prefer reading relevant code and tests before editing.
- If verification cannot run, explain why and state the residual risk.

## Useful Checks
```bash
git status --short --branch
git diff --stat
npm test
npm run build
```
