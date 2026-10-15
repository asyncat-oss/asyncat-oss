import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axisNumber } from './chartFormat.js';

test('axis numbers stay short', () => {
  assert.equal(axisNumber(0), '0');
  assert.equal(axisNumber(2.4567), '2.46');
  assert.equal(axisNumber(88.4), '88');
  assert.equal(axisNumber(1250), '1.3k');
  assert.equal(axisNumber(0.0002), '2e-4');
  assert.equal(axisNumber(-0.5), '-0.5');
  assert.equal(axisNumber('x'), '');
});
