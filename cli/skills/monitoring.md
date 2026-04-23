---
name: monitoring-setup
description: Set up application monitoring
brain_region: cerebellum
weight: 1.0
tags: [monitoring, observability, metrics, alerts]
when_to_use: |
  When setting up monitoring, alerts,
  or debugging production issues.
---
# Monitoring Setup

## The Three Pillars

### 1. Metrics
- Quantitative measurements
- CPU, memory, request rate
- Error rates, latencies

### 2. Logs
- Discrete events
- Timestamps
- Structured data

### 3. Traces
- Request flow across services
- Latency attribution
- Error tracing

## What to Monitor

### Application Health
- Is it running?
- Is it responding?
- Is it working correctly?

### Performance
- Response time (P50, P95, P99)
- Throughput (req/sec)
- Resource usage

### Errors
- Error rate
- Error types
- Affected users

### Business Metrics
- Conversions
- Revenue
- User actions

## Common Tools

### Prometheus + Grafana
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'myapp'
    static_configs:
      - targets: ['localhost:9090']
```

### ELK Stack
- Elasticsearch (storage)
- Logstash (processing)
- Kibana (visualization)

## Alerting Rules

### Critical
- Site down
- High error rate
- Service unreachable

### Warning
- High latency
- Disk space low
- Elevated errors

### Info
- Deployment completed
- Certificate expiring
- Unusual traffic

## Dashboard Layout
1. Summary row (KPIs)
2. Health indicators
3. Detailed charts
4. Recent events