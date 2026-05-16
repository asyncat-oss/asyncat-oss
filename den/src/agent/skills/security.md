---
name: security-best-practices
description: Keep systems safe
brain_region: amygdala
weight: 1.0
tags: [security, vulnerabilities, threats]
when_to_use: |
  When reviewing code for security, handling sensitive data,
  or building secure systems.
---
# Security Best Practices

## OWASP Top 10
1. Injection
2. Broken Auth
3. Sensitive Data Exposure
4. XML External Entities
5. Broken Access Control
6. Security Misconfiguration
7. XSS
8. Insecure Deserialization
9. Using Components with Vulnerabilities
10. Insufficient Logging

## Common Vulnerabilities

### SQL Injection
```js
// BAD
db.query(`SELECT * FROM users WHERE id = ${userId}`)

// GOOD (parameterized)
db.query('SELECT * FROM users WHERE id = ?', [userId])
```

### XSS
```js
// BAD
element.innerHTML = userInput

// GOOD
element.textContent = userInput
```

### CSRF
```js
// Use CSRF tokens
app.use(csrf())
app.use((req, res, next) => {
  res.locals.csrf = req.csrfToken()
  next()
})
```

### Password Storage
```js
// BAD
const hash = crypto.createHash('md5').update(password).digest('hex')

// GOOD
const hash = await bcrypt.hash(password, 12)
```

## Security Checklist

### Authentication
- Strong passwords
- Rate limiting
- Account lockout
- 2FA support

### Authorization
- Least privilege
- Role-based access
- Sanitize inputs

### Data Protection
- Encrypt sensitive data
- HTTPS everywhere
- Secure cookies

### Logging
- Log auth failures
- Detect attacks
- Don't log secrets

## Environment
```bash
# Never commit these
.env
*.pem
credentials.json
```

## Dependencies
```bash
# Check for vulnerabilities
npm audit
npm outdated
```