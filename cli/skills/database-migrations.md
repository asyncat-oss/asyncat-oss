---
name: database-migrations
description: Safe schema changes
brain_region: cerebellum
weight: 1.0
tags: [database, migration, sql, schema]
when_to_use: |
  When creating database tables, modifying schema,
  or handling data migrations.
---
# Database Migrations

## Golden Rules
1. Always backwards compatible
2. Small, incremental changes
3. Test in staging first

## Migration Structure
```js
// up(): apply migration
exports.up = async (db) => {
  await db.addColumn('users', 'emailVerified', {
    type: 'boolean',
    defaultValue: false
  })
}

// down(): revert migration
exports.down = async (db) => {
  await db.removeColumn('users', 'emailVerified')
}
```

## Types of Migrations

### Schema Migrations
- Add/remove columns
- Add/remove indexes
- Create tables

### Data Migrations
- Transform data
- Backfill values
- Seed data

## Safe Patterns

### Add Column (with default)
```js
await db.addColumn('users', 'status', {
  type: 'string',
  defaultValue: 'active'
})
```

### Safe Remove Column
1. Stop writing to column
2. Migrate data
3. Remove column

### Rename
- Add new column
- Migrate data
- Remove old column

## Locking

### Long Migrations
- Use small batches
- Add progress tracking
- Handle interrupts

```js
const BATCH_SIZE = 1000
let lastId = 0
while (true) {
  const users = await db.query(
    'SELECT * FROM users WHERE id > ? ORDER BY id LIMIT ?',
    [lastId, BATCH_SIZE]
  )
  if (!users.length) break

  for (const user of users) {
    // process
  }
  lastId = users[users.length - 1].id
}
```

## Best Practices
- One change per migration
- Test locally first
- Backup before running
- Have rollback plan