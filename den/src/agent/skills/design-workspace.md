---
name: design-workspace
description: Create visual designs, interactive prototypes, and engineering handoff bundles from prompts and workspace context
brain_region: prefrontal
weight: 1.0
tags: [design, prototype, mockup, wireframe, canvas, handoff, ui, ux, visual]
when_to_use: |
  When the user asks to design, prototype, mock up, create a landing page,
  make a pitch deck or one-pager, explore visual directions, or produce
  an engineering handoff for a UI.
---
# Design Workspace

## Workflow

1. Clarify the output only if the missing detail changes the artifact materially. Otherwise choose a sensible first direction.
2. If the design should match an existing app, call `inspect_design_system` before creating the canvas.
3. Create the first visual artifact with `create_design_canvas`. Prefer self-contained HTML with responsive CSS and realistic content.
4. Add live sliders when small targeted adjustments would help: spacing, radius, scale, accent color intensity, density, or layout width.
5. For prototypes, include interaction states in HTML/CSS/JS rather than describing them only in prose.
6. For handoff, call `create_design_handoff` with intent, screens, interactions, responsive notes, accessibility notes, and an implementation checklist.

## Quality Bar

- Show the actual product, flow, state, or artifact on the first canvas.
- Use existing tokens, components, typography, and icons when discovered.
- Keep control surfaces efficient and familiar: icon buttons, segmented controls, sliders, toggles, tabs, menus, and concise labels.
- Check responsive behavior early. Include mobile and desktop constraints in the canvas CSS.
- Avoid generic landing-page filler unless the user explicitly asks for marketing.
- Include accessibility notes for color contrast, keyboard flow, focus states, and screen-reader names.

## Handoff Contents

For implementation-ready designs, include:

- screens and states
- design tokens used or inferred
- component mapping to existing code
- interaction behavior
- responsive behavior
- accessibility requirements
- implementation checklist
