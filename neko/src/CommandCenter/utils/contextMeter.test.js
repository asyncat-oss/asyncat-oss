import test from 'node:test';
import assert from 'node:assert/strict';

import { contextMeter } from './contextMeter.js';

test('the meter shows the context in use, in thousands', () => {
  const meter = contextMeter({ currentContextTokens: 12300, totalTokens: 40000, contextWindow: 100000, contextWindowSource: 'model' });
  assert.equal(meter.label, '12.3k');
  assert.equal(Math.round(meter.percent), 12);
  assert.equal(meter.nearlyFull, false);
  assert.equal(meter.title, '12.3k current context · 40.0k total used · 12% of 100k context (model)');
});

test('an estimate is marked with a tilde', () => {
  const meter = contextMeter({ estimated: true, inputTokens: 500 });
  assert.equal(meter.label, '~0.5k');
  assert.match(meter.title, /^Estimated: /);
});

test('it is nearly full from 80% and never goes past 100%', () => {
  assert.equal(contextMeter({ currentContextTokens: 79000, contextWindow: 100000 }).nearlyFull, false);
  const full = contextMeter({ currentContextTokens: 80000, contextWindow: 100000 });
  assert.equal(full.nearlyFull, true);
  assert.match(full.title, /Nearly full/);
  assert.equal(contextMeter({ currentContextTokens: 250000, contextWindow: 100000 }).percent, 100);
});

test('with no usage yet it reads zero of the default window', () => {
  const meter = contextMeter();
  assert.equal(meter.label, '0.0k');
  assert.equal(meter.percent, 0);
  assert.match(meter.title, /of 128k context \(unknown\)$/);
});
