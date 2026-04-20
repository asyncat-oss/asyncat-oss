---
name: nginx-config
description: Configure Nginx web server
brain_region: cerebellum
weight: 1.0
tags: [nginx, web-server, config, devops]
when_to_use: |
  When configuring Nginx, setting up reverse proxy,
  or debugging web server issues.
---
# Nginx Configuration

## Basic Structure
```
http {
    upstream backend {
        server localhost:3000;
    }

    server {
        listen 80;
        server_name example.com;

        location / {
            proxy_pass http://backend;
        }
    }
}
```

## Common Directives

### Server Block
- listen: Port
- server_name: Domain
- root: Document root

### Location
- proxy_pass: Proxi backend
- fastcgi_pass: PHP backend
- static files: root alias

## Common Setups

### Reverse Proxy
```
location / {
    proxy_pass http://backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Static Files
```
location /static {
    alias /var/www/static;
    expires 30d;
}
```

### SSL/TLS
```
listen 443 ssl;
ssl_certificate /etc/ssl/certs/server.crt;
ssl_certificate_key /etc/ssl/private/server.key;
```

## Common Issues

### 502 Bad Gateway
- Backend down
- Wrong proxy_pass
- Timeout

### 403 Forbidden
- Wrong permissions
- Index file missing
- Wrong root path

### 404 Not Found
- Wrong root path
- Missing index

## Commands
```bash
# Test config
nginx -t

# Reload
nginx -s reload

# Check status
systemctl status nginx
```