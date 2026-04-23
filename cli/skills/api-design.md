---
name: rest-api-design
description: RESTful API best practices
brain_region: prefrontal
weight: 1.0
tags: [api, rest, endpoints, http]
when_to_use: |
  When designing new API endpoints, improving existing APIs,
  or following REST conventions.
---
# REST API Design

## HTTP Methods

### GET
- Read resources
- Idempotent
- No side effects
```
GET /users        # List users
GET /users/123   # Get user
```

### POST
- Create resources
- Non-idempotent
```
POST /users       # Create user
```

### PUT/PATCH
- Update resources
- PUT = full replace
- PATCH = partial update
```
PUT /users/123    # Replace user
PATCH /users/123  # Update user
```

### DELETE
- Remove resources
```
DELETE /users/123   # Delete user
```

## Status Codes

### Success
- 200 OK
- 201 Created
- 204 No Content

### Client Errors
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 422 Unprocessable

### Server Errors
- 500 Internal Error
- 503 Unavailable

## URL Design

### Nouns, Not Verbs
```
/users           # ✓
/getUsers        # ✗
```

### Collections
```
/users/123/posts # User's posts
```

### Filtering
```
GET /users?role=admin
GET /posts?limit=10
```

### Sorting
```
GET /posts?sort=-created_at
```

## Request/Response

### Request Body
```json
{ "name": "John", "email": "john@example.com" }
```

### Response
```json
{ "id": 123, "name": "John", "email": "john@example.com" }
```

### Error Response
```json
{ "error": { "code": "INVALID_EMAIL", "message": "Email required" } }
```

## Best Practices
- Version APIs: /v1/users
- Use JSON
- Consistent naming
- Pagination for lists
- HATEOAS for discovery