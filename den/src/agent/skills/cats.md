---
name: cats
description: Set up, change and check Cats, Asyncat's agents that work on their own (on a schedule or when something happens)
brain_region: cerebellum
weight: 1.0
tags: [cat, cats, schedule, scheduled, reminder, recurring, automation, daily, weekly, watch, monitor]
when_to_use: |
  When the user wants something done later, repeatedly or whenever something
  happens ("every weekday at 8am…", "each Monday…", "remind me tomorrow…",
  "tell me when this page changes", "when an email from X arrives…"), or asks
  about, changes, pauses, wakes or deletes one of their Cats.
---
# Cats

A Cat is an agent that works on its own for the user. It has a mission in
plain words and wakes up when something happens: a schedule, new email, a new
RSS post, a web page or a folder changing, or the user writing in its chat.
Its report goes to its chat, the inbox on the **Cats** page and a desktop
notification. A Cat with just a timer is what used to be a scheduled task.

## Making one
1. Write the mission as complete instructions for runs nobody watches: what
   to look after, where to look, and what a report should contain (most
   useful line first; it becomes the notification).
2. Pick what wakes it: a schedule in plain English ("every weekday at 8am",
   "every Monday at 9", "daily 18:00", "every 3 hours", "tomorrow at 7am", or
   cron such as "0 9 * * 1-5"; at most every 15 minutes), and/or watchers:
   `watch_email`, `watch_rss`, `watch_pages`, `watch_folders`.
3. Freedom: "ask_risky" (default) lets it work but asks before risky steps;
   "ask_first" asks before anything that changes something; "alone" works
   without asking (payments, passwords and sensitive steps are always asked).
   Asking pauses the run until the user answers in their inbox.
4. Call `create_cat`. It shares this chat's project unless told otherwise and
   has its own working folder, browser profile and memories.
5. Tell the user what wakes it and the next run time the tool returned.

## Managing them
- `list_cats` shows each Cat, what wakes it, its next wake and last result.
- `update_cat`, `pause_cat`, `resume_cat`, `delete_cat` change them. Resuming
  counts timers from now; missed runs aren't made up.
- `wake_cat` starts a run at once; `list_cat_runs` shows history.

## Notes
- A Cat's run can't create, change or wake Cats.
- If the computer was off or asleep, a timed run missed by less than 12 hours
  runs once when Asyncat is back; older ones are skipped.
- Asyncat keeps running in the tray after its window is closed while a Cat is
  on (Settings → Background), so Cats keep working.
- Don't use system cron or sleep loops for this; that is what Cats are for.
