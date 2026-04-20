---
name: systematic-debugging
description: 4-phase root cause investigation
brain_region: cerebellum
weight: 1.0
tags: [debugging, investigation, troubleshooting]
when_to_use: |
  When there are errors, bugs, unexpected behavior,
  or anything that "doesn't work as expected".
---
# Systematic Debugging

## When to Use
- Any error message
- Something that "doesn't work"
- Weird behavior
- Tests failing

## Phase 1: Gather Evidence

### Read the error
- Full error message + stack trace
- What triggered it?
- Can you reproduce it?

### Check environment
```bash
# What's the state?
node -v
npm version
git log --oneline -5
```

## Phase 2: Isolate

### Minimal reproduction
- Can you make it smaller?
- Does it happen in isolation?

### Compare to working state
```bash
git diff HEAD~1
git log --oneline -3
```

## Phase 3: Hypothesize

What's causing this?
- Recent changes?
- Missing dependency?
- Configuration?
- Race condition?

Pick the most likely and test it.

## Phase 4: Verify + Fix

### Test your hypothesis
```bash
# If you think X causes Y, test X:
```

### Fix properly
- Don't just patch symptoms
- Find the root cause

### Verify it works
Run the original problem again.

## Pitfalls
- Don't guess wildly
- Don't change multiple things at once
- Don't skip Phase 1 (evidence)

## Verification
- Original error is fixed
- No new regressions