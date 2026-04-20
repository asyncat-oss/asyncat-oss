---
name: log-analysis
description: Analyze system and application logs
brain_region: cerebellum
weight: 1.0
tags: [logs, debugging, analysis, troubleshooting]
when_to_use: |
  When debugging issues, analyzing errors,
  or investigating incidents.
---
# Log Analysis

## Log Locations

### System Logs
- /var/log/syslog
- /var/log/messages
- /var/log/dmesg

### Application Logs
- /var/log/app/
- journalctl

### Web Server
- /var/log/nginx/
- /var/log/apache/

## Key Commands

### View Logs
```bash
# Tail in real-time
tail -f /var/log/app.log

# Search pattern
grep "error" /var/log/app.log

# Last N lines
tail -n 100 /var/log/app.log

# Time range
sed -n '/10:00/,/10:30/p' /var/log/app.log
```

### Analysis
```bash
# Count errors
grep -c ERROR /var/log/app.log

# Unique errors
grep ERROR /var/log/app.log | sort | uniq -c

# Timeline
awk '/ERROR/ {print $1}' /var/log/app.log | sort | uniq -c
```

## Common Patterns

### Error Detection
```
ERROR
Exception
Failed
Timeout
Out of memory
```

### Performance
```
slow query
high latency
timeout
```

### Security
```
unauthorized
invalid token
blocked
```

## Tools
- less: View
- grep: Search
- awk: Process
- journalctl: Systemd
- lnav: Log navigator

## Structured Logs

### Key Fields
- Timestamp
- Level (ERROR/WARN/INFO)
- Message
- Trace ID

### Tools
- ELK Stack
- Splunk
- Datadog
- CloudWatch