---
name: code-review
description: Effective pull request reviews
brain_region: prefrontal
weight: 1.0
tags: [review, pr, collaboration, quality]
when_to_use: |
  When reviewing or requesting reviews on pull requests,
  code changes, or patches.
---
# Code Review

## Before You Review
- Read the description
- Understand the goal
- Check linked issues

## Review Checklist

### Correctness
- Does it work as intended?
- Are edge cases handled?
- Are there race conditions?

### Design
- Does it fit the codebase style?
- Is it DRY enough?
- Is it over-engineered?

### Tests
- Are there tests?
- Do tests cover edge cases?
- Are tests readable?

### Security
- Any sensitive data exposure?
- Input validation?
- Authentication checks?

### Performance
- Unnecessary loops?
- N+1 queries?
- Memory issues?

## Giving Feedback
- Be specific
- Suggest fixes
- Ask questions
- compliment good patterns

## Receiving Feedback
- Don't take it personally
- Ask clarifying questions
- Explain your reasoning
- Accept warranted criticism