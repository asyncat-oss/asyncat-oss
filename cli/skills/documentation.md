---
name: effective-documentation
description: Docs that get read
brain_region: hippocampus
weight: 1.0
tags: [docs, readme, comments]
when_to_use: |
  When writing documentation, README, or code comments.
---
# Effective Documentation

## Principles

### Write Less, Mean More
- Don't document the obvious
- Document the Why, not What
- Code should be self-explanatory

### Keep Updated
- Outdated docs worse than none
- Update in same commit as code

## README Structure

### Project Name + Tagline
```
# Asyncat
Neural-inspired AI Agent OS
```

### Quick Start
```bash
npm install asyncat
asyncat start
```

### Key Features
- 3-5 bullet points
- Most important first

### API Reference
- Link to full docs
- Don't duplicate

## Code Comments

### DO comment
- Complex algorithms
- Business logic
- Non-obvious choices
- TODO/FIXME

### DON'T comment
- Obvious code
- What the code does
- Commented-out code

```js
// GOOD
// Retry with exponential backoff to handle momentary network issues
await retry(request)

// BAD
// Loop through users
users.forEach(user => process(user))
```

## API Docs

### Endpoint Documentation
```js
/**
 * Get user by ID
 * @param {number} id - User ID
 * @returns {Promise<User>} User object
 */
async function getUser(id) { ... }
```

### OpenAPI/Swagger
```yaml
/users/{id}:
  get:
    summary: Get user by ID
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: integer
    responses:
      200:
        description: User found
```

## Markdown Best Practices
- Clear headings
- Code blocks with language
- Links to resources
- Keep it concise