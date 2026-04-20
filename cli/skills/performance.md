---
name: performance-optimization
description: Make things faster
brain_region: cerebellum
weight: 1.0
tags: [performance, optimization, profiling]
when_to_use: |
  When optimizing slow code, reducing latency,
  or improving throughput.
---
# Performance Optimization

## Before You Optimize
1. Measure first
2. Find the bottleneck
3. Know the target

## Profiling

### Node.js
```bash
node --prof src/index.js
node --prof-process isolate.log
```

### Browser DevTools
- Performance tab
- Memory snapshots

### Database
```sql
EXPLAIN ANALYZE SELECT ...
```

## Common Bottlenecks

### N+1 Queries
```js
// BAD
for (const user of users) {
  const posts = await db.getPosts(user.id)
}

// GOOD
const posts = await db.getPostsForUsers(users.map(u => u.id))
```

### Unnecessary Loops
```js
// BAD
users.filter(u => u.active).forEach(u => sendEmail(u))

// GOOD
const activeUsers = users.filter(u => u.active)
await Promise.all(activeUsers.map(sendEmail))
```

### Memory Allocations
- Avoid creating objects in loops
- Reuse buffers
- Stream large data

## Caching

### Application Cache
```js
const cache = new Map()

async function getUser(id) {
  if (cache.has(id)) {
    return cache.get(id)
  }
  const user = await db.getUser(id)
  cache.set(id, user)
  return user
}
```

### HTTP Caching
- ETag headers
- Last-Modified
- Cache-Control

## Database

### Indexes
```sql
CREATE INDEX idx_users_email ON users(email)
```

### Query Optimization
- Select only needed columns
- Use LIMIT
- Avoid functions on columns

## Async Patterns
```js
// Sequential (slow)
const a = await getA()
const b = await getB()

// Parallel (fast)
const [a, b] = await Promise.all([getA(), getB()])
```

## Measurement
- Response time P95/P99
- Throughput (req/sec)
- Memory usage