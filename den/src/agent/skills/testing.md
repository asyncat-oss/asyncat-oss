---
name: effective-testing
description: Focused tests for coding changes, bug fixes, and regressions
brain_region: cerebellum
weight: 1.0
tags: [testing, tdd, unit-tests, coverage, coding]
when_to_use: |
  When writing tests, fixing bugs, improving coverage, verifying changes,
  or diagnosing failing tests.
---
# Effective Testing

## Principles
- Test behavior, not implementation details.
- Add the smallest test that would fail without the fix.
- Cover the happy path, the regression path, and the most likely edge case.
- Keep tests deterministic: avoid time, network, and shared-state flakiness.

## Workflow
1. Inspect existing test style and commands.
2. Add or update focused tests near related coverage.
3. Run the narrowest relevant test command first.
4. Broaden verification when the change affects shared behavior.
5. Report exact commands and outcomes.

## What Not To Do
- Do not chase 100% coverage for unrelated code.
- Do not over-mock the code under test.
- Do not silently skip tests that fail for relevant reasons.
