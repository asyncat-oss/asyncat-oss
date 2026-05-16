---
name: docker-basics
description: Docker container fundamentals
brain_region: cerebellum
weight: 1.0
tags: [docker, containers, devops, deployment]
when_to_use: |
  When containerizing applications, writing Dockerfiles,
  or debugging container issues.
---
# Docker Basics

## Core Concepts

### Images
- Base images
- Building images
- Image layers

### Containers
- Running containers
- Container lifecycle
- Port mapping

### Volumes
- Data persistence
- Shared directories

## Common Commands

```bash
# Build image
docker build -t myapp .

# Run container
docker run -p 8080:80 myapp

# List running containers
docker ps

# View logs
docker logs -f container_id

# Execute in container
docker exec -it container_id sh

# Stop and remove
docker stop container_id
docker rm container_id
```

## Dockerfile Best Practices

### 1. Use specific base versions
```dockerfile
FROM node:20-alpine
```

### 2. Layer caching
```dockerfile
#Dependencies first
COPY package*.json ./
RUN npm ci

#Code later
COPY . .
```

### 3. Non-root user
```dockerfile
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

### 4. Cleanup in same layer
```dockerfile
RUN npm ci && rm -rf /tmp/*
```

## Debugging
```bash
# Enter container
docker exec -it container_id sh

# View processes
docker top container_id

# Resource usage
docker stats container_id
```