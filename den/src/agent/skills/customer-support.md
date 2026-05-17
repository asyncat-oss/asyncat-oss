---
name: customer-support
description: Handle customer support tickets, escalation, tone management, and resolution workflows
brain_region: prefrontal
weight: 1.0
tags: [support, customer-service, tickets, escalation, communication, helpdesk]
when_to_use: |
  When handling customer support tickets, writing responses,
  managing escalation, analyzing support trends, or improving
  customer satisfaction processes.
---
# Customer Support

## Response Principles
- **Empathize first**, solve second
- Acknowledge the problem before proposing solutions
- Be specific: reference order numbers, dates, error messages
- Set realistic expectations for timelines
- Always confirm resolution before closing

## Ticket Classification

### Severity Levels
- **P1/Critical**: Service down, data loss, security breach — respond in <15min
- **P2/High**: Major feature broken, many users affected — respond in <1hr
- **P3/Medium**: Feature impaired, workaround exists — respond in <4hr
- **P4/Low**: Minor issue, cosmetic, question — respond in <24hr

### Category Tags
- bug, feature-request, how-to, account, billing, integration, performance, security

## Response Templates

### Acknowledgment
```
Hi [Name],

I'm sorry to hear about [specific issue]. I can see how [impact] would be frustrating.

Let me look into this right away. I'll need:
- [specific info needed]
- [specific info needed]

I'll update you within [timeframe].
```

### Resolution
```
Hi [Name],

Good news — I've [action taken]. Here's what happened:
- [Root cause, brief]
- [Fix applied]

[Optional: steps to verify]

Is there anything else I can help with?
```

### Escalation
```
Hi [Name],

This issue requires specialist attention. I've escalated to our [team] with priority [level].

Reference #: [ticket ID]
Expected update: [timeframe]

I'll stay on this until it's resolved.
```

## Analysis with Tools
- Use `db_query` to analyze support ticket patterns, response times, satisfaction scores
- Use `read_csv` / `write_csv` for ticket data exports
- Use `create_markdown` for response templates and knowledge base articles
- Use `web_search` for known issues and solutions

## De-escalation Techniques
1. Mirror: "I understand you're frustrated about X..."
2. Validate: "That is definitely not the experience you should have."
3. Reframe: "What I can do right now is..."
4. Action: "I'm going to [specific action] and will update you by [time]."

## Knowledge Base Maintenance
- After resolving novel issues, create a knowledge base entry
- Include: problem description, root cause, resolution steps, prevention
- Tag with relevant categories for future search
