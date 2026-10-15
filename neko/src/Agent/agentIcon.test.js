import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_AGENT_ICON, chosenAgentIcon } from './agentIcon.js';

test('an emoji the user chose is kept', () => {
  assert.equal(chosenAgentIcon('🧠'), '🧠');
  assert.equal(chosenAgentIcon(' 🐱 '), '🐱');
});

test('the old default robot counts as none', () => {
  assert.equal(chosenAgentIcon(DEFAULT_AGENT_ICON), null);
  assert.equal(chosenAgentIcon('🤖'), null);
});

test('no emoji, a blank one or a non-string gives null', () => {
  for (const value of [undefined, null, '', '  ', 7]) assert.equal(chosenAgentIcon(value), null);
});
