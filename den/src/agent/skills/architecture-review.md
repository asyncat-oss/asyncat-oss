---
name: architecture-review
description: Evaluate system architecture for tradeoffs, scalability, coupling, and maintainability
brain_region: prefrontal
weight: 1.0
tags: [architecture, design, tradeoffs, scalability, system-design, review]
when_to_use: |
  When asked to review, evaluate, or propose system architecture:
  choosing between approaches, assessing coupling and cohesion,
  evaluating scalability and operational concerns, or producing a
  design document.
---
# Architecture Review

## Posture
Architecture review is about **tradeoffs**, not "right vs wrong". Every design trades something. Name what's being traded.

## Review Dimensions

### 1. Correctness
- Does the design actually solve the stated problem?
- Are there edge cases or failure modes the design doesn't handle?
- Does it make assumptions about ordering, consistency, or availability that may not hold?

### 2. Coupling & Cohesion
- Are modules coupled at the right level? (Interface coupling = good; implementation coupling = bad)
- Can components be changed or replaced independently?
- Is there a "god module" that everything depends on?
- Does the data model cross service/module boundaries in ways that will cause friction?

### 3. Scalability
- What is the expected load? Does the design handle 10×? 100×?
- What are the bottlenecks? (Single DB writer, shared mutable state, central coordinator)
- Where would you add caching? What invalidation strategy?
- Is it stateless? Stateful services are harder to scale horizontally.

### 4. Operational Concerns
- How do you deploy a change? Is it zero-downtime?
- How do you roll back if something goes wrong?
- What are the failure modes? What happens when dependency X is down?
- How do you debug it in production? (Observability: logs, metrics, traces)
- How do you run it locally for development?

### 5. Maintainability
- How many people need to understand this to make a change?
- Is the complexity proportional to the problem being solved?
- Are there abstractions that make the code harder to understand than the raw logic?
- Does the design enable adding features without touching existing code?

### 6. Security
- What is the trust boundary? What is outside it?
- Are secrets handled correctly?
- Is input validated at the boundary, not inside?
- What are the privilege levels? Least-privilege principle applied?

## Common Architecture Smells
- **Distributed monolith** — split into services but with synchronous chains and shared DB.
- **Premature microservices** — team too small to operate them; operational overhead kills velocity.
- **Leaky abstractions** — callers need to know implementation details to use correctly.
- **Bidirectional dependency** — A depends on B and B depends on A; usually a design boundary is in the wrong place.
- **Synchronous chains** — every user request triggers 5+ sequential API calls; one slow service stalls everything.
- **Big bang migrations** — large schema/data migrations with no rollback path.

## Output Format
A good architecture review produces:
1. **Summary** — what the design is trying to achieve
2. **Strengths** — what it does well
3. **Risks / concerns** — prioritized list, with severity
4. **Open questions** — things that need decisions before implementation
5. **Alternatives considered** — why this over that
6. **Recommendation** — proceed / adjust / reconsider, with specific next steps
