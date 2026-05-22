---
name: test-runner
description: Run the project test suite and return structured pass/fail/skip results with error excerpts
brain_region: prefrontal
weight: 1.0
tags: [testing, jest, vitest, pytest, mocha, cargo, go, tdd, ci]
when_to_use: |
  Use when the user asks to run tests, check test results, debug failing tests,
  or verify that a change didn't break anything.
---
# Test Runner

## Workflow

1. Call `run_tests` — it auto-detects the framework and returns structured results.
2. If tests fail, read the `failures` array for test names and error excerpts.
3. Open the relevant source files and fix the failures.
4. Re-run `run_tests` to confirm all tests pass before finishing.

## Framework detection order

jest → vitest → mocha → (falls back to npm test script) → pytest → cargo test → go test

## Tips

- Use `filter` to run only specific tests during iteration: `run_tests { filter: "auth" }`
- If the framework auto-detection is wrong, pass `framework` explicitly.
- For long test suites, set a longer `timeout` (seconds).
- After fixing failures, always run the full suite (no filter) to confirm nothing else broke.
