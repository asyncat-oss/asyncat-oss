---
name: design-workspace
description: Create visual designs, interactive code animations, prototypes, and engineering handoff bundles from prompts and workspace context
brain_region: prefrontal
weight: 1.0
tags: [design, prototype, mockup, wireframe, canvas, handoff, ui, ux, visual, animation, shader, particles, loaders]
when_to_use: |
  When the user asks to design, prototype, mock up, create a landing page,
  make a pitch deck or one-pager, explore visual directions, create an
  interactive animation, shader, particle effect, loader, text-streaming demo,
  hover effect, or produce an engineering handoff for a UI.
---
# Design Workspace

## Workflow

1. Clarify the output only if the missing detail changes the artifact materially. Otherwise choose a sensible first direction.
2. If the design should match an existing app, call `inspect_design_system` before creating the canvas.
3. Create visual layouts with `create_design_canvas`. Prefer self-contained HTML with responsive CSS and realistic content.
4. Create motion-heavy work with `create_code_animation`: shader wallpapers, particle text, hover cards, organic loaders, text-streaming grids, sprite explainers, and canvas/SVG/CSS demos.
5. Add live sliders when small targeted adjustments would help: spacing, radius, scale, accent color intensity, density, speed, glow, noise, blur, or layout width.
6. For prototypes, include interaction states in HTML/CSS/JS rather than describing them only in prose.
7. For handoff, call `create_design_handoff` with intent, screens, interactions, responsive notes, accessibility notes, and an implementation checklist.

## Quality Bar

- Show the actual product, flow, state, or artifact on the first canvas.
- Use existing tokens, components, typography, and icons when discovered.
- Keep control surfaces efficient and familiar: icon buttons, segmented controls, sliders, toggles, tabs, menus, and concise labels.
- Check responsive behavior early. Include mobile and desktop constraints in the canvas CSS.
- For animation prompts, make the artifact visibly move without extra setup, react to pointer position or clicks when useful, and respect `prefers-reduced-motion`.
- Avoid generic landing-page filler unless the user explicitly asks for marketing.
- Include accessibility notes for color contrast, keyboard flow, focus states, and screen-reader names.

## Example Prompt Patterns

Use these as high-signal starting points when the user asks for inspiration:

- Iridescent card: monochrome playing card, perspective hover, iridescent highlights, noise texture, specular glow, many tweak controls.
- Calculator construction kit: two-column calculator UI with persistent visual and layout controls.
- App onboarding: iOS signup flow, multiple phone screens on a canvas, blue and orange product palette.
- Text particle effects: editable text box where words such as Fire, Smoke, metal, and wind render matching particles.
- Shader wallpapers: five pointer-reactive futuristic wallpapers with click/fidget behavior.
- Text streaming: responsive 300x300 grid of ten looping chat streaming animations.
- Globe loader: 200x200 monochrome spinning globe with country outlines and a whirl effect.
- Organic loaders: twenty black-and-white blobby loading indicators on a wrapping grid.
- Cosmic scale animation: sprite-style celestial size and distance explainer with circles and animated text.

## Handoff Contents

For implementation-ready designs, include:

- screens and states
- design tokens used or inferred
- component mapping to existing code
- interaction behavior
- responsive behavior
- accessibility requirements
- implementation checklist
