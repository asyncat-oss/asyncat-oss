---
name: effective-testing
description: Writing tests that actually help
brain_region: cerebellum
weight: 1.0
tags: [testing, tdd, unit-tests, coverage]
when_to_use: |
  When writing new tests, debugging test failures,
  or improving test coverage.
---
# Effective Testing

## Test Naming
Use descriptive names:
```js
test('should return empty array for invalid input')
```

## Test Structure
Arrange, Act, Assert:
```js
// Arrange
const input = { name: 'test' }

// Act
const result = process(input)

// Assert
expect(result).toEqual({ name: 'test' })
```

## What to Test

### Happy Path
- Core functionality works

### Edge Cases
- Empty input
- Null/undefined
- Max values
- Special characters

### Error Cases
- Invalid input
- Network failures
- Permission errors

## What NOT to Test
- Third-party libs
- Configuration
- Too much mocking
- Implementation details

## Test Coverage
- Focus on critical paths
- Don't chase 100%
- Quality > quantity

## Flaky Tests
- Avoid time-based tests
- Use test databases
- Clean up after yourself
- No shared state