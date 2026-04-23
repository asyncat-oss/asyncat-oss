---
name: tdd
description: Test-driven development — red, green, refactor
brain_region: cerebellum
weight: 1.0
tags: [testing, development, tdd]
when_to_use: |
  When asked to write tests, fix bugs with tests first,
  or build new features with TDD methodology.
---
# TDD Skill — Test-Driven Development

## When to Use
- "write tests for X"
- "fix the bug"
- "add a new feature"
- Any code change should have tests

## The Cycle

### Red: Write a Failing Test
```javascript
test('should do X', () => {
  expect(doX()).toBe(expectedResult); // This fails!
});
```

### Green: Make It Pass
```javascript
function doX() {
  return expectedResult; // Minimal fix
}
```

### Refactor: Improve
```javascript
function doX() { // Better implementation
  // ...

## Pitfalls
- Don't write implementation before tests
- Don't test implementation details, test behavior
- Keep tests simple and readable

## Verification
- Tests pass
- Tests cover the happy path + edge cases
- Refactored code is cleaner than before