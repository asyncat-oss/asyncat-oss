import test from 'node:test';
import assert from 'node:assert/strict';
import { getSkillOrigin } from './skillOrigin.js';

test('a skill saved from a chat is the user\'s, whatever its tags', () => {
  assert.equal(getSkillOrigin({ source: 'user', created_by: 'chat-suggestion', tags: ['notes'] }), 'user');
  assert.equal(getSkillOrigin({ source: 'user', created_by: 'chat-suggestion', tags: ['learned'] }), 'user');
  assert.equal(getSkillOrigin({ source: 'user', tags: ['notes'] }), 'user');
});

test('skills older versions wrote on their own stay auto-created; bundled ones are default', () => {
  assert.equal(getSkillOrigin({ source: 'user', created_by: 'skill-synthesizer', tags: ['notes'] }), 'auto');
  assert.equal(getSkillOrigin({ source: 'user', created_by: 'basal-ganglia' }), 'auto');
  assert.equal(getSkillOrigin({ source: 'user', tags: ['auto-synthesized'] }), 'auto');
  assert.equal(getSkillOrigin({ source: 'bundled', created_by: 'chat-suggestion' }), 'default');
  assert.equal(getSkillOrigin(null), 'default');
});
