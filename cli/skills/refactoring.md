---
name: safe-refactoring
description: Refactor without breaking things
brain_region: prefrontal
weight: 1.0
tags: [refactoring, cleanup, code-quality]
when_to_use: |
  When improving existing code, reducing technical debt,
  or updating legacy patterns.
---
# Safe Refactoring

## Golden Rules
1. Tests first
2. Small commits
3. Verify at each step

## Before You Start
- Run existing tests
- Understand the code
- Identify boundaries

## Step-by-Step

### 1. Isolate
Find the smallest unit to refactor:
- Single function
- Single module
- Single component

### 2. Test
Write/verify tests for current behavior:
```js
// Preserve existing behavior
expect(currentFunction(input)).toBe(expectedOutput)
```

### 3. Refactor
Make changes incrementally:
```js
// Before
function oldWay() { ... }

// After (keep old working)
function newWay() { ... }
```

### 4. Verify
Run tests after each change.

## Common Patterns

### Extract Function
```js
// Before
doSomething(a, b, c)

// After
function doSomething(a, b, c) {
  const partA = extractPartA(a)
  const partB = extractPartB(b)
  return combine(partA, partB, c)
}
```

### Rename
- Rename in one commit
- Update all references
- Run tests

### Simplify Conditionals
```js
// Before
if (x === true) { ... }

// After
if (x) { ... }
```

## Warning Signs
- No tests
- Giant functions
- Tight coupling
- Hidden side effects