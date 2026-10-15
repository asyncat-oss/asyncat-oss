// What shows before the app's page paints (the desktop window's background,
// its loading screen, the Quick ask window on Windows and the browser's theme
// colour) uses the dark theme's own greys from index.css, so a dark launch
// doesn't flash the old blue-grey.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const css = read('./index.css');
const windowJs = read('../../electron/window.js');
const quickJs = read('../../electron/quick.js');
const indexHtml = read('../index.html');

function darkToken(name) {
  const block = /(?:^|\n)\.dark\s*\{([^}]*--as-canvas[^}]*)\}/.exec(css);
  assert.ok(block, 'no .dark token block in index.css');
  const value = new RegExp(`--as-${name}:\\s*([^;]+);`).exec(block[1]);
  assert.ok(value, `.dark has no --as-${name}`);
  return value[1].trim().toLowerCase();
}

// The value a `dark ? '<dark>' : '<light>'` background picks in dark mode.
function darkBackground(source) {
  const match = /shouldUseDarkColors \? '([^']+)'/.exec(source);
  assert.ok(match, 'no dark background colour');
  return match[1].toLowerCase();
}

test('the desktop window is the dark canvas before the page paints', () => {
  assert.equal(darkBackground(windowJs), darkToken('canvas'));
});

test("the loading screen's dark colours are the theme's", () => {
  const dark = /prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(windowJs);
  assert.ok(dark, 'no dark block on the loading screen');
  const value = (name) => new RegExp(`--${name}:\\s*([^;]+);`).exec(dark[1])?.[1].trim().toLowerCase();
  assert.equal(value('background'), darkToken('canvas'));
  assert.equal(value('foreground'), darkToken('fg'));
  assert.equal(value('muted'), darkToken('fg-muted'));
  assert.equal(value('track'), darkToken('line-strong'));
});

test('the Quick ask window on Windows starts as the dark card', () => {
  assert.equal(darkBackground(quickJs), darkToken('elevated'));
});

test("the browser's dark theme colour is the canvas", () => {
  const match = /<meta name="theme-color" content="([^"]+)" media="\(prefers-color-scheme: dark\)"/.exec(indexHtml);
  assert.ok(match, 'no dark theme-color');
  assert.equal(match[1].toLowerCase(), darkToken('canvas'));
});
