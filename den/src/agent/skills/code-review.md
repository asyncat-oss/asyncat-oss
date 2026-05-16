---
name: code-review
description: High-signal code review focused on bugs, regressions, tests, and maintainability
brain_region: prefrontal
weight: 1.0
tags: [review, pr, collaboration, quality, coding]
when_to_use: |
  When reviewing code changes, diffs, pull requests, commits, or patches.
---
# Code Review

## Review Order
1. Understand the goal and changed files.
2. Inspect the diff and the surrounding code that defines behavior.
3. Lead with concrete findings: bugs, regressions, data loss, security risks, missing tests.
4. Include file/line references when possible.
5. Keep style suggestions secondary unless they affect correctness or maintainability.

## Checklist
- Correctness: edge cases, state transitions, async/race behavior, error paths.
- Tests: missing regression coverage, brittle assertions, unverified behavior.
- Security: auth, path safety, secrets, injection, unsafe shell/file operations.
- Maintainability: consistency with local patterns, unnecessary abstraction, dead code.
- UX: loading, empty, error, mobile, and permission states.

## Output Style
- Findings first, ordered by severity.
- If no issues, say so clearly and mention any remaining test gap.
- Avoid vague feedback; name the concrete risk and a practical fix.
