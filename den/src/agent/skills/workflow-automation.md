---
name: workflow-automation
description: Discover and run the user's saved automation workflows
brain_region: cerebellum
weight: 1.0
tags: [workflow, automation, scheduled, agent]
when_to_use: |
  When the user asks to run, trigger, or check one of their saved
  automations/workflows (e.g. "run my morning briefing", "kick off the
  inbox triage workflow").
---
# Workflow Automation

Workflows are saved multi-step automations: a trigger (manual or cron) plus an
ordered list of agent steps that run in sequence, optionally passing each step's
output forward as context. They are distinct from one-off scheduled jobs.

## How to run one
1. Call `list_workflows` to see saved workflows and their ids.
2. Match the user's request to a workflow by name.
3. Call `run_workflow` with the `id` (preferred) or `name`.

## Notes
- `run_workflow` is fire-and-forget: it starts the run and returns immediately.
  The steps execute in the background as their own agent runs.
- Tell the user it started and that results show up on the **Activity** page.
- Do NOT try to re-implement a workflow's steps yourself — trigger the saved
  workflow instead.
- If no workflow matches, say so and offer to help create one (the user builds
  workflows on the Workflows page).
