---
name: ci-cd-pipeline
description: Build CI/CD pipelines
brain_region: cerebellum
weight: 1.0
tags: [ci, cd, pipelines, automation, devops]
when_to_use: |
  When setting up automated builds, tests,
  or deployment pipelines.
---
# CI/CD Pipeline

## Pipeline Stages

### 1. Trigger
- Push to repo
- Pull request
- Scheduled
- Manual

### 2. Checkout
- Clone repository
- Checkout specific ref

### 3. Build
- Install dependencies
- Compile code
- Build artifacts

### 4. Test
- Unit tests
- Integration tests
- E2E tests

### 5. Security Scan
- Dependency scan
- Code scan
- Container scan

### 6. Deploy
- Build/push image
- Deploy to environment

## Common Patterns

### GitHub Actions
```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: npm ci && npm run build
      - name: Test
        run: npm test
```

### GitLab CI
```yaml
stages:
  - build
  - test
  - deploy

build:
  stage: build
  script: npm ci

test:
  stage: test
  script: npm test

deploy:
  stage: deploy
  script: npm run deploy
  only:
    - main
```

## Best Practices

### Fast Fail
- Fail fast on tests
- Parallelize where possible
- Cache dependencies

### Security
- Scan for secrets
- Dependency vulnerabilities
- Container security

### Environment Isolation
- Separate dev/staging/prod
- secrets management
- Review gates