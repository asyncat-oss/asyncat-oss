---
name: refactoring
description: Safe behavior-preserving code improvement with verification
brain_region: cerebellum
weight: 0.9
tags: [refactoring, cleanup, code-quality, coding]
when_to_use: |
  When improving existing code structure, reducing duplication,
  simplifying logic, or paying down technical debt.
---
# Refactoring

## Core Principle
**Preserve behavior.** Every refactor must leave the program doing the exact same thing. If tests pass before, they must pass after.

## Workflow
1. **Read the code** — understand what it does, not just what it looks like
2. **Find tests** — use `find_files` to locate test files. If none exist, note the risk
3. **Run tests BEFORE refactoring** — establish the green baseline
4. **Plan small** — identify the smallest useful structural improvement
5. **Make the change** — use `patch_file` for precision; multiple small edits > one big edit
6. **Run tests AFTER refactoring** — verify behavior is preserved
7. **Check for regressions** — `git diff` to review what changed

## Tool Workflow
```
1. find_files "*.test.*" OR find_files "*.spec.*"  → locate tests
2. run_command "npm test"                           → establish baseline
3. read_file + list_definitions                     → understand structure
4. patch_file / edit_file                           → make the change
5. read_file                                        → verify edit applied
6. run_command "npm test"                           → verify behavior preserved
```

## Good Targets
- Remove meaningful duplication (3+ copies of the same logic)
- Clarify confusing conditionals (deeply nested if/else)
- Extract helpers only when they reduce real complexity
- Move code to a shared module when 2+ callers need the same behavior
- Rename unclear variables/functions for readability
- Reduce function size (> 50 lines is a smell)

## Rules
- **Do NOT mix refactoring with feature work.** Separate commits.
- **Do NOT refactor without reading the code first.** Always `read_file` first.
- **Do NOT make speculative changes.** Only refactor code you understand.
- **Do NOT rename exports** without checking all call sites with `code_search`.
- **Keep the same indentation style** as the existing code.
- If tests don't exist or can't run, state the risk explicitly.

## Anti-Patterns
- ❌ "Cleaning up" code you haven't read
- ❌ Changing function signatures without updating callers
- ❌ Adding abstraction where none is needed (premature abstraction)
- ❌ Moving files without updating all import paths
- ❌ Refactoring and adding features in the same change
