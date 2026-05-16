---
name: deployment-patterns
description: Safe deploys
brain_region: cerebellum
weight: 1.0
tags: [deployment, release, devops]
when_to_use: |
  When deploying applications, setting up CI/CD,
  or managing releases.
---
# Deployment Patterns

## Pre-Deployment

### Checklist
- [ ] Tests passing
- [ ] No secrets in code
- [ ] Rollback plan ready
- [ ] Health checks defined

### Staging First
Deploy to staging first:
```bash
# Deploy to staging
SERVER=staging npm run deploy

# Verify
curl https://staging.example.com/health
```

## Deployment Strategies

### Blue-Green
Two identical environments:
```
Blue: Production (active)
Green: New version (idle)
```

1. Deploy to inactive
2. Test health checks
3. Switch traffic
4. Rollback if needed

### Canary
Gradual rollout:
```bash
# 1% of traffic to new version
istio VirtualService: 99% -> v1, 1% -> v2
# Then increase gradually
```

### Rolling
Update instances gradually:
```sh
# Replace one at a time
for server in $servers; do
  deploy $server
  health check $server
done
```

## Health Checks
```js
app.get('/health', async (req, res) => {
  const db = await db.ping()
  const cache = await cache.ping()

  if (db && cache) {
    res.status(200).json({ status: 'healthy' })
  } else {
    res.status(503).json({ status: 'unhealthy' })
  }
})
```

## Rollback

### Database
- Point-in-time recovery
- Never rollback migrations without data migration

### Application
```bash
# Kubernetes
kubectl rollout undo deployment/app

# Docker
docker pull previous-image
docker-compose up -d
```

## Environment Variables

### Build Time
```bash
# .env.build (embedded at build)
PUBLIC_API_URL=https://api.example.com
```

### Runtime
```bash
# .env (runtime, from secrets manager)
DATABASE_PASSWORD=secrect
```

## Monitoring

### Metrics
- Deployment success rate
- Error rate by version
- Latency by version

### Alerts
- Deployment failure
- High error rate
- Health check failure