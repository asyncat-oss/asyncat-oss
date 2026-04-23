---
name: kubernetes-basics
description: Kubernetes fundamentals
brain_region: cerebellum
weight: 1.0
tags: [kubernetes, k8s, containers, devops]
when_to_use: |
  When deploying to Kubernetes, managing pods,
  or debugging K8s issues.
---
# Kubernetes Basics

## Core Concepts

### Pod
- Smallest deployable unit
- One or more containers
- Shared networking

### Service
- Stable endpoint
- Load balancing
- ClusterIP, NodePort, LoadBalancer

### Deployment
- ReplicaSets
- Rolling updates
- Rollbacks

### ConfigMap/Secret
- Configuration
- Sensitive data

## Common Commands

```bash
# Get resources
kubectl get pods
kubectl get services
kubectl get deployments

# Describe
kubectl describe pod mypod

# Logs
kubectl logs mypod

# Execute
kubectl exec -it mypod -- sh

# Apply config
kubectl apply -f deployment.yaml

# Scale
kubectl scale deployment myapp --replicas=3
```

## Key Files

### deployment.yaml
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: myapp
        image: myapp:latest
        ports:
        - containerPort: 8080
```

### service.yaml
```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  selector:
    app: myapp
  ports:
  - port: 80
    targetPort: 8080
```

## Troubleshooting
```bash
# Events
kubectl get events

# Pod status
kubectl get pod mypod -o wide

# Resource issues
kubectl top nodes
kubectl top pods
```