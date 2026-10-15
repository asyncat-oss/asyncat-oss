import test from 'node:test';
import assert from 'node:assert/strict';
import { ORIGIN_LABELS, filterByOrigin, getSkillOrigin, originCounts } from './skillOrigin.js';

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

test('counts and the origin filter', () => {
  const skills = [
    { name: 'a', source: 'bundled' },
    { name: 'b', source: 'bundled' },
    { name: 'c', source: 'user' },
    { name: 'd', source: 'user', tags: ['learned'] },
  ];
  assert.deepEqual(originCounts(skills), { default: 2, user: 1, auto: 1 });
  assert.deepEqual(originCounts(), { default: 0, user: 0, auto: 0 });
  assert.deepEqual(filterByOrigin(skills, 'user').map((skill) => skill.name), ['c']);
  assert.equal(filterByOrigin(skills, 'all'), skills);
  assert.deepEqual(Object.keys(ORIGIN_LABELS), ['default', 'user', 'auto']);
});
