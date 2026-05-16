---
name: data-engineering
description: Data pipeline patterns — ETL/ELT, dbt, Airflow, streaming, data quality, warehouse design
brain_region: cerebellum
weight: 1.0
tags: [data-engineering, etl, pipeline, dbt, airflow, kafka, spark, warehouse]
when_to_use: |
  When working with data pipelines, ETL/ELT workflows, dbt models,
  Airflow DAGs, streaming systems (Kafka, Flink), data warehouse design,
  or data quality checks.
---
# Data Engineering Patterns

## ETL vs ELT
- **ETL** (Extract → Transform → Load): transform before loading. Use when target storage is expensive or transformations are complex and best done in the extraction layer.
- **ELT** (Extract → Load → Transform): load raw first, transform in the warehouse. Preferred with modern warehouses (BigQuery, Snowflake, Redshift, DuckDB) — cheap storage, powerful SQL.

## Pipeline Design Principles
1. **Idempotent** — running a pipeline twice produces the same result. Use `INSERT OVERWRITE` / `MERGE` not `INSERT INTO`.
2. **Incremental by default** — process only new/changed data; avoid full table scans.
3. **Fail loudly** — missing data should fail the pipeline, not silently produce zeros.
4. **Partition by time** — date-partitioned tables are cheaper to query and easier to backfill.
5. **Schema on write** — define and enforce schema at ingestion, not discovery at query time.

## dbt Patterns
```yaml
# models/staging/stg_orders.sql — clean raw data
SELECT
  id AS order_id,
  user_id,
  created_at::timestamp AS created_at,
  amount_cents / 100.0 AS amount_usd
FROM {{ source('raw', 'orders') }}
WHERE created_at IS NOT NULL
```
- `staging/` — 1:1 with source tables, rename + type-cast only
- `intermediate/` — joins and business logic, not exposed to end users
- `marts/` — final business-facing models (`dim_`, `fct_` prefix)
- Tests: `not_null`, `unique`, `accepted_values`, `relationships` in `schema.yml`
- Use `{{ ref() }}` for model dependencies, never hardcode schema names

## Airflow DAG Patterns
```python
from airflow.decorators import dag, task
from datetime import datetime

@dag(schedule='@daily', start_date=datetime(2024, 1, 1), catchup=False)
def my_pipeline():
    @task
    def extract() -> list[dict]:
        return fetch_data_from_api()

    @task
    def load(records: list[dict]):
        bulk_insert(records)

    load(extract())
```
- `catchup=False` unless you explicitly want historical backfill
- Use `depends_on_past=False` for most tasks
- Set `retries=3, retry_delay=timedelta(minutes=5)` for flaky external calls
- XComs for small data between tasks; S3/GCS for large data

## Streaming (Kafka / Flink)
- Kafka is a durable log — consumers can replay. Treat it as the source of truth.
- Consumer groups allow multiple independent consumers of the same topic.
- Set `auto.offset.reset=earliest` for new consumers that need history.
- For exactly-once semantics: enable idempotent producers + transactional API.
- Prefer compacted topics for changelog (latest state per key).

## Data Quality Checks
- Row count validation: compare source vs destination counts after load.
- Null checks on not-null columns before insert.
- Freshness checks: alert if `max(created_at)` is older than expected.
- Referential integrity: foreign keys exist in dimension tables.
- Statistical drift: alert if aggregate values (avg, sum) shift by >20% day-over-day.

## Warehouse Design
- **Fact tables**: events/transactions — `fct_orders`, `fct_pageviews`. Narrow, many rows.
- **Dimension tables**: entities — `dim_users`, `dim_products`. Wider, fewer rows.
- Use surrogate keys (integer) as primary keys, natural keys for joining to source.
- Avoid `SELECT *` in production queries — always explicit column list.
- Cluster/sort keys based on common filter patterns.

## Guardrails
- Never `DELETE FROM` a production table without a `WHERE` clause and a backup.
- Always test pipelines on a small date range before running full history.
- Log row counts and timing at each pipeline stage.
- Don't store PII in non-encrypted columns or logs.
- Schema changes (rename, drop column) require coordination with downstream consumers.
