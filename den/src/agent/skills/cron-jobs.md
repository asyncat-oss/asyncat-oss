---
name: cron-jobs
description: Schedule and manage cron jobs
brain_region: cerebellum
weight: 1.0
tags: [cron, scheduled, automation, devops]
when_to_use: |
  When setting up scheduled tasks,
  cron jobs, or automation.
---
# Cron Jobs

## Cron Format
```
* * * * * command
| | | | |
| | | | +- Day of week (0-6, Sun=0)
| | | +- Month (1-12)
| | +- Day of month (1-31)
| +- Hour (0-23)
+- Minute (0-59)
```

## Common Examples

### Every hour
```
0 * * * * /path/to/command
```

### Every day at midnight
```
0 0 * * * /path/to/command
```

### Every Monday at 9am
```
0 9 * * 1 /path/to/command
```

### Every 15 minutes
```
*/15 * * * * /path/to/command
```

### Every 6 hours
```
0 */6 * * * /path/to/command
```

## Managing Crons

### Add/Edit
```bash
crontab -e
```

### List
```bash
crontab -l
```

### Remove
```bash
crontab -r
```

## Best Practices

### Use Absolute Paths
```
/usr/local/bin/python /home/app/script.py
```

### Log Output
```
0 0 * * * /path/to/script >> /var/log/script.log 2>&1
```

### Environment
- SetVariables explicitly
- Source profile if needed

## Monitoring

### Check Logs
```bash
grep CRON /var/log/syslog
```

### Email on Output
```
MAILTO=email@example.com
0 0 * * * /path/to/command
```

## Common Issues
- PATH differences
- Permission problems
- Missing dependencies