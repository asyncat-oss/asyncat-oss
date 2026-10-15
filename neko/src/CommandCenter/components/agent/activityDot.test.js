import test from 'node:test';
import assert from 'node:assert/strict';
import { activityDot, ERROR_DOT, STEP_DOT } from './activityDot.js';

test('only an error step keeps a colour', () => {
  assert.equal(activityDot('bg-red-400'), ERROR_DOT);
  assert.equal(activityDot('bg-emerald-400'), STEP_DOT);
  assert.equal(activityDot('bg-blue-400'), STEP_DOT);
  assert.equal(activityDot('bg-gray-300 dark:bg-gray-600'), STEP_DOT);
});

test('a step without a colour gets the grey dot', () => {
  assert.equal(activityDot(), STEP_DOT);
  assert.equal(activityDot(null), STEP_DOT);
});
