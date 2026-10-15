import test from 'node:test';
import assert from 'node:assert/strict';
import { importanceDots, memorySource, memorySummary, memoryTags, sqliteDate } from './memoryFormat.js';

test('tags come as a list or as a bracketed string', () => {
  assert.deepEqual(memoryTags({ tags: ['garden', 'bees'] }), ['garden', 'bees']);
  assert.deepEqual(memoryTags({ tags: '[garden, "bees"]' }), ['garden', 'bees']);
  assert.deepEqual(memoryTags({ tags: '[]' }), []);
  assert.deepEqual(memoryTags({}), []);
});

test('importance is five dots, half when unset', () => {
  assert.equal(importanceDots({ importance: 0.6 }), 3);
  assert.equal(importanceDots({ importance: '1' }), 5);
  assert.equal(importanceDots({}), 3);
  assert.equal(importanceDots({ importance: 'lots' }), 3);
  assert.equal(importanceDots({ importance: 7 }), 5);
});

test('SQLite dates read as UTC', () => {
  assert.equal(sqliteDate('2026-10-15 02:11:12').toISOString(), '2026-10-15T02:11:12.000Z');
  assert.equal(sqliteDate('2026-10-15T02:11:12Z').toISOString(), '2026-10-15T02:11:12.000Z');
});

test('where a memory came from', () => {
  assert.equal(memorySource('agent'), null);
  assert.equal(memorySource(''), null);
  assert.equal(memorySource('user'), 'Written by you');
  assert.equal(memorySource('correction'), 'From a correction you made');
  assert.equal(memorySource('extracted'), 'Picked up from a chat');
});

test('the counts line', () => {
  const stats = { total: 4, cap: 750, byType: { task_state: 1, preference: 1, fact: 2, feedback: 0 } };
  assert.equal(memorySummary(stats, { shown: 4 }), '4 of 750 memories · Fact 2 · Preference 1 · Task state 1');
  assert.equal(memorySummary(stats, { shown: 1, filtered: true }), '1 shown · 4 of 750 memories · Fact 2 · Preference 1 · Task state 1');
  assert.equal(memorySummary(null, { shown: 1 }), '1 memory');
  assert.equal(memorySummary(null, { shown: 0, filtered: true }), '0 shown');
});
