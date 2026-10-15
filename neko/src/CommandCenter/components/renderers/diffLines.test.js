import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLineKind } from './diffLines.js';

test('added and removed lines are told apart from the file headers', () => {
  assert.equal(diffLineKind('+ tomatoes: 6'), 'added');
  assert.equal(diffLineKind('- tomatoes: 4'), 'removed');
  assert.equal(diffLineKind('+++ b/plan.txt'), 'meta');
  assert.equal(diffLineKind('--- a/plan.txt'), 'meta');
  assert.equal(diffLineKind('diff --git a/plan.txt b/plan.txt'), 'meta');
  assert.equal(diffLineKind('index 1a2b3c..4d5e6f 100644'), 'meta');
});

test('hunk headers and context lines are neither added nor removed', () => {
  assert.equal(diffLineKind('@@ -1,3 +1,3 @@'), 'hunk');
  assert.equal(diffLineKind(' basil: 2'), 'plain');
  assert.equal(diffLineKind(''), 'plain');
  assert.equal(diffLineKind(), 'plain');
});
