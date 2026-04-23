---
name: plan
description: Break complex goals into executable steps
brain_region: cerebellum
weight: 1.0
tags: [planning, agentic]
when_to_use: |
  When user wants to build something, create a plan,
  or start a new project. Use for any multi-step task.
---
# Planning Skill

## When to Use
- Any multi-step task the user wants to accomplish
- "build a REST API"
- "set up authentication"
- "refactor the codebase"
- "create a new feature"

## Procedure

### 1. Understand the Goal
Ask clarifying questions if needed:
- What's the end goal?
- Any constraints (deadline, tech stack, etc.)?
- Who's the user?

### 2. Check Existing Context
- Look at project structure
- Check for existing patterns, conventions
- Review relevant files

### 3. Break Into Steps
Each step should be:
- Completable in 5-10 minutes
- Independent enough to test
- Clear enough to verify

### 4. Write a Markdown Plan
```markdown
# Plan: [Goal]

## 1. [First Step]
- [Sub-task A]
- [Sub-task B]

## 2. [Second Step]
...

## Verification
- [How to verify this works]
```

### 5. Present for Confirmation
Ask: "Does this plan make sense? Should I proceed?"

## Pitfalls
- Don't over-plan (max ~10 steps)
- Don't plan every edge case upfront
- Don't execute without user sign-off

## Verification
- Plan is understandable by a human
- Each step is verifiable
- User confirms before execution