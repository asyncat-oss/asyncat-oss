---
name: outbound-notifications
description: Notify the user through configured Discord, Slack, Telegram, or email channels when agent work finishes or needs attention
brain_region: limbic
weight: 1.0
tags: [notifications, discord, slack, telegram, email, long-running, attention]
when_to_use: |
  Use when the user asks to be pinged, notified, alerted, messaged, or emailed,
  especially after a long task, a blocked task, a failure, or an important result.
---
# Outbound Notifications

## Workflow

1. Call `notification_status` to see which channels are configured.
2. If no channels are configured, tell the user to configure Outbound Notifications in Settings > Integrations.
3. Use `notify_channel` only when the user explicitly wants an external ping or the task instruction asked for it.
4. Keep notification text short: title, status, why it matters, and the next action if any.
5. Use `severity`:
   - `success` for finished work
   - `warning` for blocked or needs attention
   - `error` for failures
   - `info` for neutral updates

## Example

```json
{
  "channels": ["discord", "email"],
  "title": "Asyncat task finished",
  "message": "Build and tests passed. The design suite changes are ready for review.",
  "severity": "success"
}
```
