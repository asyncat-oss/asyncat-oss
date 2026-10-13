---
name: scheduled-tasks
description: Set up, change and check Asyncat's scheduled tasks (prompts that run by themselves on a schedule)
brain_region: cerebellum
weight: 1.0
tags: [schedule, scheduled, reminder, recurring, automation, daily, weekly]
when_to_use: |
  When the user wants something done later or repeatedly ("every weekday at
  8am…", "each Monday…", "remind me tomorrow…", "check this every 3 hours"),
  or asks about, changes, pauses, runs or deletes one of their scheduled tasks.
---
# Scheduled Tasks

A scheduled task is a prompt Asyncat runs on its own on a schedule. Each run's
answer is added to the task's own chat and shown as a desktop notification.
The user manages them on the **Scheduled** page.

## Creating one
1. Write the prompt as a complete instruction for a run nobody watches:
   what to do, where to look, and what the answer should contain. Put the most
   useful line first; it becomes the notification.
2. Pick the schedule in plain English: "every weekday at 8am", "every Monday
   at 9", "mondays and thursdays at 9:30", "daily 18:00", "every 3 hours",
   "tomorrow at 7am", "in 2 hours", or a cron expression ("0 9 * * 1-5").
   Tasks repeat at most every 15 minutes.
3. Call `create_scheduled_task`. It uses this chat's Project unless told
   otherwise; without a Project the run can't use files, code or the shell.
4. Tools that normally ask for approval are refused in unattended runs. If the
   task needs one (sending email, writing files), ask the user, then list it in
   `pre_approved_tools`.
5. Tell the user the schedule and the next run time the tool returned.

## Managing them
- `list_scheduled_tasks` shows each task, its schedule, next run and last result.
- `update_scheduled_task`, `pause_scheduled_task`, `resume_scheduled_task`,
  `delete_scheduled_task` change them. Resuming starts from now; missed runs
  aren't made up.
- `run_scheduled_task_now` starts a run at once and returns straight away; the
  answer arrives in the task's chat. `list_scheduled_task_runs` shows history.

## Notes
- A scheduled run can't create, change or start scheduled tasks.
- If the computer was off or asleep, a run missed by less than 12 hours runs
  once when Asyncat is back; older ones are skipped.
- On Windows and Linux, Asyncat keeps running in the tray after its window is
  closed while a task is on (Settings → Background).
- Don't use system cron or sleep loops for this; that is what scheduled tasks
  are for.
