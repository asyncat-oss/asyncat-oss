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
1. **Gather evidence:** Read the full error, stack trace, logs, failing test, and recent Git diff. Batch all reads in one turn.
2. **Reproduce narrowly:** Run the smallest command or scenario that shows the failure.
3. **Isolate cause:** Compare expected vs actual behavior and inspect the responsible code path.
4. **Fix the root cause** with the smallest safe change.
5. **Verify** by rerunning the original failing scenario and any focused regression tests.

## Investigation Toolkit

### Finding the Error Source
```
Step 1: Read the error/stack trace → identify file:line
Step 2: read_file the identified file
Step 3: find_definition for any unknown symbols
Step 4: code_search with kind="reference" to trace call chain
```

### Common Patterns
| Symptom | Investigation Steps |
|---------|-------------------|
| Import error | `find_definition` for the symbol → check if it's exported |
| Undefined is not a function | `code_search` for the call site → verify the API |
| Test fails | Read the test file → understand the assertion → read the tested code |
| Build error | Read the build config → check for missing deps or wrong paths |
| Runtime crash | Read the stack trace bottom-up → find the first application frame |

## Fixing Rules
- **Do not guess and patch randomly.** Form a hypothesis first.
- **Do not change multiple unrelated things at once.** One fix per edit.
- **Prefer reading relevant code and tests before editing.**
- **After fixing, re-read the file to verify the fix is applied correctly.**
- **Run the failing test/command again to verify the fix actually works.**
- If verification cannot run, explain why and state the residual risk.

## Useful Verification Commands
```bash
# Quick checks
git status --short --branch
git diff --stat

# Language-specific
npm test               # Node.js
npm run build          # Build check
python -m pytest -x    # Python (stop on first failure)
cargo test             # Rust
go test ./...          # Go
```

## Anti-Patterns to Avoid
- ❌ Changing code without reading it first
- ❌ Retrying the same failed command hoping for different results
- ❌ "Fixing" the test to match wrong behavior
- ❌ Adding try/catch to suppress errors instead of fixing them
- ❌ Making speculative changes to multiple files at once
