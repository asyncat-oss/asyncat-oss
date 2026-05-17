---
name: project-management
description: Plan, track, and manage projects using Scrum, Kanban, and hybrid methodologies
brain_region: prefrontal
weight: 1.1
tags: [project-management, scrum, kanban, agile, planning, roadmap, estimation]
when_to_use: |
  When planning a project, creating roadmaps, managing sprints,
  estimating effort, tracking progress, or setting up project boards.
---
# Project Management

## Planning Workflow
1. Define the goal and success criteria
2. Break into epics → stories → tasks
3. Estimate effort and map dependencies
4. Create a prioritized backlog
5. Set milestones and deadlines
6. Track velocity and adjust

## Estimation Techniques

### Story Points (Scrum)
- 1: Trivial, < 1 hour
- 2: Simple, 1-2 hours
- 3: Moderate, half a day
- 5: Complex, 1-2 days
- 8: Significant, 3-5 days
- 13: Epic-level, needs breakdown

### T-Shirt Sizing (Quick)
- XS: < 2 hours
- S: 2-4 hours
- M: 1-2 days
- L: 3-5 days
- XL: 1-2 weeks

### Planning Poker Rules
- Each person estimates independently
- Discuss outliers (highest and lowest)
- Re-estimate until convergence
- If consensus fails after 3 rounds, take the median

## Methodologies

### Scrum
- Sprint: 1-2 week iteration
- Ceremonies: Planning → Daily Standup → Review → Retro
- Roles: Product Owner, Scrum Master, Team
- Artifacts: Backlog, Sprint Board, Burndown Chart

### Kanban
- WIP Limits per column (e.g., In Progress: max 3)
- Continuous flow, no fixed iterations
- Cycle time = Time from "Started" to "Done"
- Lead time = Time from "Requested" to "Done"

### Hybrid
- Use Scrum ceremonies with Kanban flow
- Limit WIP within sprints
- Measure both velocity and cycle time

## Tool Usage
- Use `todo_write` / `list_plan` for sprint planning and task tracking
- Use `create_diagram` for Gantt charts, flowcharts, and dependency maps
- Use `create_markdown` for project briefs, specs, and retrospectives
- Use `create_csv` for burndown/velocity data
- Use `db_query` to analyze workspace task data

## Risk Assessment Matrix
| Likelihood \ Impact | Low | Medium | High |
|---------------------|-----|--------|------|
| High                | M   | H      | C    |
| Medium              | L   | M      | H    |
| Low                 | L   | L      | M    |

- L = Log and monitor
- M = Mitigate with contingency plan
- H = Proactive mitigation required
- C = Critical — must be addressed before proceeding

## Status Reporting Format
```
## Sprint/Week [N] Status — [Date]

### Done
- [x] Item 1
- [x] Item 2

### In Progress
- [ ] Item 3 (50%, on track)
- [ ] Item 4 (30%, blocked by X)

### Blocked
- Item 4 → Blocked by X, expected resolution: [date]

### Upcoming
- Item 5, Item 6

### Metrics
- Velocity: [N] points
- Burndown: [N]% complete
- Blockers: [N]
```
