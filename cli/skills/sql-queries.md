---
name: sql-queries
description: Write efficient SQL queries
brain_region: cerebellum
weight: 1.0
tags: [sql, database, queries, data]
when_to_use: |
  When querying databases, writing reports,
  or analyzing data with SQL.
---
# SQL Queries

## Basic Structure

```sql
SELECT column1, column2
FROM table_name
WHERE condition
GROUP BY column
HAVING group_condition
ORDER BY column DESC
LIMIT 10;
```

## Common Patterns

### Filter
```sql
WHERE status = 'active'
  AND created_at > '2024-01-01'
```

### Join
```sql
SELECT o.*, c.name
FROM orders o
JOIN customers c ON o.customer_id = c.id
```

### Aggregate
```sql
SELECT 
  status,
  COUNT(*) as count,
  SUM(amount) as total
FROM orders
GROUP BY status
```

### Window Functions
```sql
SELECT 
  name,
  amount,
  SUM(amount) OVER (PARTITION BY customer_id) as customer_total
FROM orders
```

## Optimization

### Do
- SELECT specific columns
- Use WHERE to filter early
- Index WHERE columns

### Don't
- SELECT * (unless needed)
- Use OR (use IN)
- Nest subqueries (use JOIN)

## Common Queries

### Top N per Group
```sql
SELECT *
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC) as rn
  FROM sales
) t
WHERE rn <= 3
```

### Running Total
```sql
SELECT 
  date,
  amount,
  SUM(amount) OVER (ORDER BY date) as running
FROM sales
```

### Percentage of Total
```sql
SELECT 
  category,
  amount,
  amount * 100.0 / SUM(amount) OVER () as pct
FROM sales
```

## Debugging
- Run parts independently
- Check row counts at each step
- Test with known outputs