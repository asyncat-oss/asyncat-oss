---
name: incident-response
description: Step-by-step production incident triage — contain, diagnose, fix, recover, postmortem
brain_region: amygdala
weight: 1.2
tags: [incident, production, outage, on-call, debugging, operations, sre]
when_to_use: |
  When something is broken in production right now: service down,
  error rate spike, latency degradation, data anomaly, security event,
  or any "on-call" triage situation.
---
# Production Incident Response

## First 2 Minutes — Contain & Communicate
1. **Don't panic. Stay methodical.** Bad decisions under pressure make things worse.
2. Announce in the incident channel: "I'm looking at [symptom] on [service]. Will update in 5m."
3. Check if there's already an active incident — don't duplicate work.
4. Identify impact: how many users, which regions, which features?

## Triage Order
1. **Symptoms** — What is broken and for whom? Error rate, latency P99, HTTP 5xx, queue depth?
2. **Timeline** — When did it start? What changed? (deployments, config, traffic spikes, infra events)
3. **Blast radius** — Is it getting worse, stable, or recovering?
4. **Can we roll back?** — If a recent deploy correlates with the incident, roll back immediately. Don't diagnose while users are down.

## Diagnosis Checklist
- [ ] Check dashboards: error rate, latency, infra metrics (CPU, memory, disk, connections)
- [ ] Check logs for the first error: `grep -i error`, filter by time window near incident start
- [ ] Check recent deploys: `git log --since="1 hour ago"`, CI/CD history
- [ ] Check downstream dependencies: DB, cache, external APIs, message queues
- [ ] Check infra events: auto-scaling, node restarts, network changes, certificate expiry
- [ ] Check if errors correlate with specific endpoints, users, regions, or request types

## Mitigation Options (fastest first)
1. **Rollback** — fastest recovery if a deploy caused it
2. **Feature flag / kill switch** — disable the broken feature
3. **Scale out** — if load-related, add capacity
4. **Restart** — if process leak or deadlock, restart instances (buy time, not a fix)
5. **Redirect traffic** — failover to healthy region or fallback
6. **Fix forward** — only if rollback is impossible and fix is simple and low-risk

## During the Incident
- Update the incident channel every 10–15 minutes: current status, what you tried, what's next.
- Keep a running timeline of actions in a shared doc (time → action → result).
- Assign roles if multiple people: incident commander, communications, technical lead.
- Do not deploy new features during an active incident.

## Resolution & Postmortem
- Confirm metrics have recovered to baseline before declaring resolved.
- Write a postmortem within 24–48h: timeline, root cause, impact, action items.
- Postmortems are blameless — systems fail, focus on systemic improvements.
- Action items: monitoring gaps, missing alerts, process failures, code hardening.

## Guardrails
- Never make multiple changes at once during an incident — you won't know what fixed it.
- Always verify a fix actually improved metrics before declaring victory.
- Don't delete logs or evidence during an incident.
- If it's a security incident, involve security team before any communication.
