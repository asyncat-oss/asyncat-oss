---
name: cloud-architecture
description: Design cloud infrastructure
brain_region: prefrontal
weight: 1.0
tags: [cloud, architecture, aws, gcp, azure, infra]
when_to_use: |
  When planning cloud infrastructure,
  architectural decisions, or scaling.
---
# Cloud Architecture

## Architecture Patterns

### Single Server
- Simple, quick start
- No high availability
- Hard to scale

### Load Balanced
- Multiple instances
- Traffic distribution
- Health checks

### Microservices
- Service decomposition
- Independent scaling
- Complex networking

### Serverless
- No server management
- Pay per use
- Cold starts

## Cloud Components

### Compute
- VMs (EC2, Compute Engine)
- Containers (ECS, GKE, AKS)
- Functions (Lambda, Cloud Functions)

### Storage
- Object (S3, Cloud Storage)
- Block (EBS, Persistent Disk)
- File (EFS, Filestore)

### Networking
- VPC/Virtual Network
- Load Balancers
- CDN
- DNS

### Database
- RDS (managed SQL)
- DynamoDB (NoSQL)
- ElastiCache (cache)

## Decision Framework

### Scaling Needs
- Vertical vs horizontal
- Auto-scaling triggers

### Availability
- Single AZ vs multi-AZ
- RTO/RPO targets

### Cost Optimization
- Reserved instances
- Spot/preemptible
- Serverless where possible

### Security
- Network isolation
- Encryption
- Access control

## Common Patterns by Provider

### AWS
- ALB + ECS Fargate
- RDS + read replicas
- ElastiCache

### GCP
- Cloud Load Balancing
- Cloud Run
- Cloud SQL

### Azure
- App Service
- Azure SQL
- Redis Cache