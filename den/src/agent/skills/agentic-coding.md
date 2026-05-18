---
name: agentic-coding
description: End-to-end autonomous coding workflow for inspecting, editing, verifying, and reporting
brain_region: cerebellum
weight: 1.1
tags: [coding, implementation, agentic, git, testing]
when_to_use: |
  When asked to implement, fix, improve, refactor, test, review,
  or otherwise do coding work in a repository.
---
# Agentic Coding

## Workflow
1. **Inspect first:** Read the relevant files, repo scripts, and current Git state. Always batch reads — emit multiple `read_file` calls in a single turn.
2. **Plan:** Use `todo_write` for any task with 3+ steps. Each item should be atomic and verifiable.
3. **Edit carefully:** Use `patch_file` for precise single-location edits. Use `edit_file` for broader replacements. Always provide exact content from your `read_file` result.
4. **Verify after every edit:** Re-read the file to confirm. Run tests/lint if available.
5. **Report clearly:** Changed behavior, files touched, verification, and any remaining risk.

## Tool Selection Guide
| Task | Preferred Tool | Why |
|------|---------------|-----|
| Find a function definition | `find_definition` | Language-aware, fastest |
| Find all references to a symbol | `code_search` with kind="reference" | Structured results |
| Find text in files | `search_files` | Broadest grep-based search |
| Understand file structure | `list_definitions` | Shows all functions/classes |
| Find a file by name | `find_files` | Glob-based, recursive |
| Small precise edit | `patch_file` | Requires unique old_string |
| Edit with disambiguation | `edit_file` with start_line/end_line | Scopes to line range |
| New file or full rewrite | `write_file` | Creates parent dirs |

## Error Recovery Playbook
- **"find text not found"**: Re-read the file. Your content is stale or has wrong whitespace.
- **"old_string appears N times"**: Add more surrounding context to make it unique. Use `read_file` to see the exact lines.
- **"File not found"**: Use `list_directory` or `find_files` to locate it. Don't guess paths.
- **Command fails**: Read the error output. Fix the root cause, don't retry blindly.

## Pre-Edit Checklist
1. ✅ Read the file with `read_file` (required — edits to unread files are blocked)
2. ✅ Identify the exact lines to change
3. ✅ Copy the exact text for `find`/`old_string` from the read result
4. ✅ Make the smallest change possible

## Post-Edit Verification
1. Re-read the file to confirm the edit applied correctly
2. Run the narrowest verification: `npm test -- --grep "affected test"`, lint the file, or type-check
3. If verification fails, read the error and fix — don't revert and retry blindly

## Guardrails
- Do not overwrite user changes unless explicitly asked.
- Do not run destructive Git commands by default.
- Do not claim a test/build passed unless it actually ran successfully.
- If blocked by missing dependencies or permissions, explain the blocker and the next best check.
- Prefer multiple small edits over one large edit — each is independently verifiable.
