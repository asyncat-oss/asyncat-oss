---
name: git-workflow
description: Standard branch, commit, PR workflow
brain_region: cerebellum
weight: 0.9
tags: [git, version-control, workflow]
when_to_use: |
  When asked to commit, create a branch, or manage git workflow.
---
# Git Workflow

## When to Use
- "commit these changes"
- "create a new branch"
- "make a PR"
- Any git operation

## Standard Workflow

### 1. Check status
```bash
git status
git log --oneline -5
```

### 2. Create branch (for new work)
```bash
git checkout -b feature/my-new-feature
# or
git checkout -b fix/the-bug
```

### 3. Make changes + commit
```bash
git add -A
git commit -m "description: what and why"
```

### 4. Push
```bash
git push -u origin branch-name
```

## Commit Messages

Format: `type: description`

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `style:` formatting
- `refactor:` code improvement
- `test:` adding tests
- `chore:` maintenance

## Pitfalls
- Don't commit sensitive stuff
- Don't force push to shared branches
- Don't commit without a message

## Verification
- Changes are committed
- Branch is pushed (if needed)