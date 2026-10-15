// Checks the theme tokens in index.css: in every theme, the three text levels
// stay readable (WCAG AA, 4.5:1) on the canvas, surface and elevated colours,
// and dark and midnight are plain greys.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

// The first block of each theme that sets --as-canvas, as { name: '#rrggbb' }.
function themeTokens(selector) {
  const escaped = selector.replace('.', '\\.');
  const block = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*--as-canvas[^}]*)\\}`).exec(css);
  assert.ok(block, `no token block for ${selector}`);
  const tokens = {};
  for (const [, name, value] of block[1].matchAll(/--as-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) tokens[name] = value.toLowerCase();
  return tokens;
}

const channel = (hex, at) => {
  const value = parseInt(hex.slice(at, at + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

for (const theme of [':root', '.dark', '.midnight']) {
  test(`${theme}: text is readable on every background`, () => {
    const tokens = themeTokens(theme);
    for (const background of ['canvas', 'surface', 'elevated']) {
      for (const text of ['fg', 'fg-muted', 'fg-subtle', 'accent']) {
        const ratio = contrast(tokens[text], tokens[background]);
        assert.ok(ratio >= 4.5, `${text} ${tokens[text]} on ${background} ${tokens[background]} is ${ratio.toFixed(2)}:1`);
      }
    }
  });
}

for (const theme of ['.dark', '.midnight']) {
  test(`${theme}: backgrounds and text are plain greys`, () => {
    const tokens = themeTokens(theme);
    for (const name of ['canvas', 'sidebar', 'surface', 'elevated', 'bubble', 'fg', 'fg-muted', 'fg-subtle']) {
      const hex = tokens[name];
      assert.ok(hex, `${theme} has no --as-${name}`);
      assert.ok(hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7), `--as-${name} ${hex} has a tint`);
    }
  });
}
