---
name: effective-logging
description: Logs that help debug production
brain_region: hippocampus
weight: 1.0
tags: [logging, debugging, observability]
when_to_use: |
  When adding logging, debugging production issues,
  or setting up observability.
---
# Effective Logging

## Log Levels

### ERROR
- Failures that need attention
- Exceptions
- Failed operations

### WARN
- Unexpected but recoverable
- Deprecated usage
- Configuration issues

### INFO
- Important milestones
- Business events
- State changes

### DEBUG
- Detailed flow
- Variable values
- Loop iterations

## What to Log

### DO Log
- Entry/exit points
- Errors with context
- Key state changes
- Business events
- Performance metrics

### DON'T Log
- Secrets/credentials
- Passwords/tokens
- Personal data
- Large objects
- High-frequency events

## Context
Always include:
```js
logger.error('Failed to process', {
  error: err.message,
  userId: user.id,
  requestId: request.id,
  timestamp: new Date().toISOString()
})
```

## Structured Logging
```js
// Good
{ "level": "error", "msg": "User save failed", "userId": 123 }

// Bad
console.error('Error in userService.save() for user ' + userId)
```

## Performance
- Async logging
- Rate limiting
- Log rotation
- Appropriate level