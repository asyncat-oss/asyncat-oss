---
name: error-handling
description: Graceful failure patterns
brain_region: amygdala
weight: 1.0
tags: [errors, exceptions, failsafe]
when_to_use: |
  When handling errors, creating error boundaries,
  or designing failure recovery.
---
# Error Handling

## Principles

### Fail Fast, Recover Gracefully
- Validate early
- Handle gracefully
- Inform clearly

### Never Swallow Errors
```js
// BAD
try {
  doSomething()
} catch (e) {
  // Silent failure
}

// GOOD
try {
  doSomething()
} catch (e) {
  logger.error('Failed to do something', { error: e })
  throw new AppError('Could not do something')
}
```

## Error Types

### Expected Errors
Handle explicitly:
```js
if (!user) {
  return res.status(404).json({ error: 'User not found' })
}
```

### Unexpected Errors
Catch and log:
```js
try {
  doRiskyThing()
} catch (e) {
  logger.error('Unexpected failure', { error: e })
  return res.status(500).json({ error: 'Internal error' })
}
```

## Error Objects
```js
class AppError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}
```

## Best Practices

### Always Validate Input
```js
function createUser(input) {
  if (!input?.email) {
    throw new AppError('Email required', 'INVALID_EMAIL', 400)
  }
  // ...
}
```

### Wrap External Calls
```js
async function fetchUser(id) {
  try {
    return await externalApi.get(id)
  } catch (e) {
    throw new AppError('User service unavailable', 'SERVICE_ERROR', 503)
  }
}
```

### Graceful Degradation
- Cache fallbacks
- Default values
- Circuit breakers