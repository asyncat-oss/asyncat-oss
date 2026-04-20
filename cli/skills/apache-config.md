---
name: apache-config
description: Configure Apache web server
brain_region: cerebellum
weight: 1.0
tags: [apache, httpd, web-server, config]
when_to_use: |
  When configuring Apache, setting up virtual hosts,
  or debugging web server issues.
---
# Apache Configuration

## Basic Structure
```
<VirtualHost *:80>
    ServerName example.com
    DocumentRoot /var/www/html

    <Directory /var/www/html>
        Options Indexes FollowSymLinks
        AllowOverride All
    </Directory>
</VirtualHost>
```

## Common Directives

### VirtualHost
- ServerName: Domain
- ServerAlias: www variant
- DocumentRoot: Files path

### Directory
- Options: Features
- AllowOverride: .htaccess
- Require: Access control

## Common Setups

### Reverse Proxy (mod_proxy)
```
ProxyRequests Off
<Proxy *>
    Order deny,allow
    Allow from all
</Proxy>

ProxyPass /api http://localhost:3000
ProxyPassReverse /api http://localhost:3000
```

### .htaccess
```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI}
```

## Common Issues

### 403 Forbidden
- Check Require all granted
- Check file permissions

### 404 Not Found
- Check DocumentRoot
- Check AllowOverride

### 500 Internal Error
- Check .htaccess syntax
- Check module loaded

## Commands
```bash
# Test config
apachectl configtest

# Reload
apachectl graceful

# Check modules
apachectl -M
```