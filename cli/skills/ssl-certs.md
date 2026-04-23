---
name: ssl-certs
description: Manage SSL/TLS certificates
brain_region: amygdala
weight: 1.0
tags: [ssl, tls, https, certificates, security]
when_to_use: |
  When setting up HTTPS, renewing certificates,
  or debugging SSL issues.
---
# SSL Certificates

## Certificate Types

### DV (Domain Validation)
- Email/domain verification
- Hours to issue
- Basic encryption

### OV (Organization Validation)
- Business verification
- 1-3 days
- Shows organization

### EV (Extended Validation)
- Strict verification
- Green bar
- Highest trust

## Getting Certificates

### Let's Encrypt (Free)
```bash
# Using certbot
sudo certbot --nginx -d example.com -d www.example.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Self-Signed (Development)
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

## Certificate Files

### Cert (.crt/.pem)
- Public certificate
- Share publicly

### Key (.key)
- Private key
- NEVER share

### Chain (.crt)
- Intermediate certificates
- Full chain

### Full Chain
- Your cert + intermediates

## Installation

### Nginx
```nginx
ssl_certificate /etc/ssl/certs/server.crt;
ssl_certificate_key /etc/ssl/private/server.key;
ssl_trusted_certificate /etc/ssl/certs/ca-chain.crt;
```

### Apache
```apache
SSLCertificateFile /etc/ssl/certs/server.crt
SSLCertificateKeyFile /etc/ssl/private/server.key
SSLCertificateChainFile /etc/ssl/certs/ca-chain.crt
```

## Troubleshooting

### Certificate Expired
- Check dates: openssl x509 -dates -in cert.pem
- Renew before expiry

### Chain Issues
- Include full chain
- Check order

### Mixed Content
- All resources HTTPS
- Check console errors