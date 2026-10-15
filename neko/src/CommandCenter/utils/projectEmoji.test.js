import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PROJECT_EMOJI, chosenProjectEmoji } from './projectEmoji.js';

test('an emoji the user chose is kept', () => {
  assert.equal(chosenProjectEmoji('🌱'), '🌱');
  assert.equal(chosenProjectEmoji(' 🚀 '), '🚀');
});

test('the default folder emoji counts as none', () => {
  assert.equal(chosenProjectEmoji(DEFAULT_PROJECT_EMOJI), null);
  assert.equal(chosenProjectEmoji('📁'), null);
});

test('no emoji, a blank one or a non-string gives null', () => {
  for (const value of [undefined, null, '', '   ', 3, {}]) {
    assert.equal(chosenProjectEmoji(value), null);
  }
});
