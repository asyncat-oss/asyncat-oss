---
name: dependency-audit
description: Security audit project dependencies for CVEs and vulnerabilities
brain_region: prefrontal
weight: 1.0
tags: [security, audit, npm, pip, cargo, cve, vulnerability, dependencies]
when_to_use: |
  Use when the user asks to audit dependencies, check for vulnerabilities,
  run npm/pip/cargo audit, or investigate CVEs in the project.
---
# Dependency Audit

## Workflow

1. Call `dependency_audit` — auto-detects npm, pnpm, yarn, cargo, or pip-audit.
2. Review `severity_counts` (critical → high → moderate → low).
3. For high/critical findings, check `findings[].url` for the advisory and fix instructions.
4. Recommend upgrading affected packages or applying available patches.

## Tips

- Use `min_severity: "high"` to focus only on actionable findings.
- For npm: `npm audit fix` resolves many issues automatically — suggest it when `fixable > 0`.
- For cargo: requires `cargo install cargo-audit` first.
- For Python: requires `pip install pip-audit` first.
- Moderate/low findings are worth noting but rarely block a release.
