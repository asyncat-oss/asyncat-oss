---
name: browser-utility-artifacts
description: Create self-contained in-browser utility tools as HTML/JS artifacts
brain_region: cerebellum
weight: 0.9
tags: [browser, utility, artifact, regex, color, schema, dependency-graph]
when_to_use: |
  Use when the user asks for small browser-native tools such as a regex tester,
  color palette extractor, JSON schema generator, dependency graph viewer, or
  similar zero-backend interactive utility.
---
# Browser Utility Artifacts

## Workflow

1. Prefer `create_design_canvas` or `create_code_animation` for a self-contained HTML artifact.
2. Keep all logic in the artifact: HTML, CSS, and vanilla JavaScript.
3. Include practical controls and sample input.
4. Make the result usable offline, with no CDN dependencies.
5. Use concise labels and dense utility-tool layout.

## Useful Patterns

- Regex tester: pattern, flags, test text, match list, capture groups, replacement preview.
- Color palette extractor: image/file URL input, manual color list, swatches, contrast table, CSS variables export.
- JSON schema generator: JSON input, inferred schema, validation preview, copy buttons.
- Dependency graph viewer: paste package/import data, render nodes/edges, filter by module, export JSON.
