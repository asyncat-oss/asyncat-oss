---
name: codebase-metrics
description: Analyze a codebase for LOC by language, file counts, tech stack, git history stats, and hotspot files
brain_region: prefrontal
weight: 0.9
tags: [metrics, loc, tech-stack, git, onboarding, codebase, analysis]
when_to_use: |
  Use when the user wants codebase stats, lines of code, tech stack detection,
  most-changed files, repo history, or a quick snapshot of a project's size and shape.
---
# Codebase Metrics

## Workflow

1. Call `codebase_metrics` on the project root.
2. Summarize: total LOC, top languages, tech stack, git commit count and date range.
3. Highlight the largest files (potential complexity hotspots).
4. Highlight the most-changed files from git log (churn hotspots — likely to have bugs).
5. Note dependency counts across detected package managers.

## Good follow-ups

- Combine with `onboarding-new-codebase` skill for a full project intro.
- Use `local_rag_index` after metrics to enable semantic search across the codebase.
- Suggest refactoring the top-churn files if their change frequency is high relative to their size.
