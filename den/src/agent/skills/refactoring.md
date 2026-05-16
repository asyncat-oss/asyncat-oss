---
name: refactoring
description: Safe behavior-preserving code improvement
brain_region: cerebellum
weight: 0.9
tags: [refactoring, cleanup, code-quality, coding]
when_to_use: |
  When improving existing code structure, reducing duplication,
  simplifying logic, or paying down technical debt.
---
# Refactoring

## Rules
- Preserve behavior unless the user explicitly asks for behavior changes.
- Inspect current tests and call sites before moving shared logic.
- Keep refactors small enough to review.
- Do not mix unrelated cleanup with feature work.

## Workflow
1. Establish current behavior and verification commands.
2. Identify the smallest useful structural improvement.
3. Make the change in local style.
4. Run focused tests/build/lint when available.
5. Summarize behavior preserved and verification completed.

## Good Targets
- Remove meaningful duplication.
- Clarify confusing conditionals.
- Extract helpers only when they reduce real complexity.
- Move code to a shared module when multiple callers need the same behavior.
