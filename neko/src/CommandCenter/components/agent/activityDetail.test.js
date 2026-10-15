import test from 'node:test';
import assert from 'node:assert/strict';

import { activityDetail } from './activityDetail.js';

test('a step reads as plain words, without markdown marks', () => {
  assert.equal(activityDetail('## Plan\n**8 km a day** for `two` weeks'), 'Plan 8 km a day for two weeks');
  assert.equal(activityDetail('- one\n- [two](https://x)'), 'one two');
  assert.equal(activityDetail('<think>hmm</think>Walking the route'), 'Walking the route');
});

test("a tool's JSON arguments show as the fields that say what it did", () => {
  assert.equal(activityDetail('{"title":"Bakery launch plan","blocks":[{"type":"text"}]}'), 'title: Bakery launch plan');
  assert.equal(activityDetail('{"path":"birds/heron.md","content":"# Heron"}'), 'path: birds/heron.md · content: # Heron');
  assert.equal(activityDetail('{"blocks":[]}'), '');
  assert.equal(activityDetail('{not json'), '{not json');
});
