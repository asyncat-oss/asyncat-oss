---
name: api-endpoint-explorer
description: Map backend API routes and generate living endpoint docs
brain_region: prefrontal
weight: 1.0
tags: [api, routes, endpoints, express, backend, docs]
when_to_use: |
  Use when the user asks to explore, document, audit, or understand backend API
  routes, route directories, Express routers, or endpoint coverage.
---
# API Endpoint Explorer

## Workflow

1. Use `map_api_endpoints` to statically walk Express app/router files.
2. Review the generated endpoint map artifact.
3. Group endpoints by product area or mounted prefix when summarizing.
4. Point out missing auth, suspicious destructive endpoints, duplicated mounts, or routes that are hard to discover.

## Output

Prefer a short summary plus the generated artifact path. Include method counts and any notable route risks.
