---
name: error-recovery
description: Strategies for recovering from stuck states, failed edits, and broken workflows
brain_region: cerebellum
weight: 1.2
tags: [recovery, resilience, error-handling, agentic]
when_to_use: |
  When tool calls are failing repeatedly, edits aren't applying correctly,
  the agent seems stuck in a loop, or previous attempts have failed.
---
# Error Recovery

## When You're Stuck
If you've failed 2+ times on the same operation, STOP and follow this protocol:

### Step 1: Diagnose
Ask yourself: "What EXACTLY went wrong?"
- Read the error message word by word
- Don't assume — verify with tools

### Step 2: Change Strategy (Don't Retry)
| Failed Operation | Alternative Strategy |
|-----------------|---------------------|
| `edit_file` find not found | `read_file` → copy exact text → retry edit |
| `edit_file` multiple matches | Use `start_line`/`end_line` to scope, or use `patch_file` with more context |
| `patch_file` old_string not found | `read_file` the file → use exact content |
| `code_search` no results | Try `search_files` with simpler pattern, or `find_files` by name |
| `run_command` fails | Read the error output → fix the underlying issue → retry |
| File not found | `list_directory` → `find_files` → correct the path |
| Permission denied | Try different approach or ask user |

### Step 3: Escalate if Needed
If 3 different strategies have all failed:
1. Report what you tried and what happened
2. Show the remaining plan items
3. Suggest what the user could try manually
4. Tell the user they can type "continue" to resume after fixing the issue

## Common Failure Patterns

### "Stale Content" Loop
**Symptom:** edit_file keeps failing with "find text not found"
**Cause:** You're using content from an old read_file
**Fix:** Re-read the file RIGHT NOW, then use the fresh content

### "Wrong Path" Loop
**Symptom:** Multiple "file not found" errors
**Cause:** You're guessing paths instead of discovering them
**Fix:** list_directory from the root, then navigate to find the right path

### "Test Failure Spiral"
**Symptom:** Each fix introduces a new test failure
**Cause:** Not reading the test to understand expectations
**Fix:** Read the test file, understand what it asserts, then fix to match

### "Command Never Works"
**Symptom:** run_command fails with the same error repeatedly
**Cause:** Missing dependency, wrong syntax, or wrong working directory
**Fix:** Read the error, install missing deps, fix syntax, or change approach

## Recovery Commands
```bash
# Check what changed
git diff --stat
git diff

# Undo last change if it made things worse
git checkout -- <file>

# Check project health
npm test 2>&1 | tail -20
npm run build 2>&1 | tail -20
```
