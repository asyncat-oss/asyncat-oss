---
name: backup-scripts
description: Create reliable backup scripts
brain_region: amygdala
weight: 1.0
tags: [backup, scripts, devops, data]
when_to_use: |
  When creating backups, restoring data,
  or setting up backup automation.
---
# Backup Scripts

## Backup Strategy

### What to Back Up
- Database data
- User uploads
- Configuration
- Application code

### Where to Store
- Different server
- Different region
- Different provider

### How Often
- Critical: Daily
- Important: Weekly
- Archive: Monthly

## Simple Backup Script

```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups"
SOURCE_DIR="/var/www"
MAX_BACKUPS=7

# Create backup
tar -czf $BACKUP_DIR/www-$DATE.tar.gz $SOURCE_DIR

# Remove old backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +$MAX_BACKUPS -delete

echo "Backup complete: $DATE"
```

## Database Backup

```bash
# PostgreSQL
pg_dump -U user dbname > backup-$DATE.sql

# MySQL
mysqldump -u user -p dbname > backup-$DATE.sql

# Compress
gzip backup-$DATE.sql
```

## Incremental Backup (rsync)

```bash
#!/bin/bash
rsync -avz --delete /source/ /backup/
```

## Restore Process

```bash
# Extract
tar -xzf backup-20240101.tar.gz

# Database
psql -U user dbname < backup-20240101.sql
```

## Testing
- Test restores regularly
- Document procedures
- Verify checksums