// The fade-in that pages and new answers play must leave no transform behind:
// a transformed ancestor becomes the box position:fixed children are placed
// and stacked in, so a full-screen view inside the page opened under the
// sidebar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');

test('the page fade-in keeps no end state once it has played', () => {
  const rule = /\.animate-fadeIn\s*\{([^}]*)\}/.exec(css);
  assert.ok(rule, 'no .animate-fadeIn rule');
  const animation = /animation:\s*([^;]+);/.exec(rule[1])?.[1] || '';
  assert.match(animation, /\bfadeInContent\b/);
  assert.doesNotMatch(animation, /\b(forwards|both)\b/, `it holds its last frame: ${animation}`);
  assert.doesNotMatch(rule[1], /animation-fill-mode/);
});
