import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY_KIND_OPTIONS, memoryKindLabel } from './memoryKinds.js';

test('memory kinds read in sentence case', () => {
  assert.equal(memoryKindLabel('task_state'), 'Task state');
  assert.equal(memoryKindLabel('fact'), 'Fact');
  assert.equal(memoryKindLabel(''), '');
  assert.deepEqual(MEMORY_KIND_OPTIONS[0], { value: 'fact', label: 'Fact' });
});
