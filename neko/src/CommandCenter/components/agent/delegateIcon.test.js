import test from 'node:test';
import assert from 'node:assert/strict';
import { delegateIcon } from './delegateIcon.js';

test('a saved agent shows the emoji it was given', () => {
  assert.equal(delegateIcon({ profile: { id: 'p-1', icon: '🐱' }, name: 'Scout' }), '🐱');
  assert.equal(delegateIcon({ data: { profileId: 'p-1', profileIcon: '🧪' }, name: 'Lab' }), '🧪');
});

test('a one-off helper role shows its initial, not the placeholder robot', () => {
  assert.equal(delegateIcon({ profile: { id: 'default', icon: '🤖' }, name: 'Researcher' }), 'R');
  assert.equal(delegateIcon({ data: { profileId: 'default', profileIcon: '🤖' }, name: 'writer' }), 'W');
});

test('an agent without an emoji shows its initial', () => {
  assert.equal(delegateIcon({ profile: { id: 'p-2' }, name: ' tester' }), 'T');
  assert.equal(delegateIcon({ name: '' }), 'A');
  assert.equal(delegateIcon(), 'A');
});
