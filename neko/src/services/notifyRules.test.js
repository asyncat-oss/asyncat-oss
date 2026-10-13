import test from 'node:test';
import assert from 'node:assert/strict';
import { inQuietHours, notifyAllowed } from './notifyRules.js';

const at = (h, m) => { const d = new Date(2026, 9, 14, h, m); return d; };

test('quiet hours can run past midnight', () => {
  const prefs = { done: true, approval: true, quietHours: { enabled: true, start: '22:00', end: '07:00' } };
  assert.equal(inQuietHours(prefs, at(23, 30)), true);
  assert.equal(inQuietHours(prefs, at(6, 59)), true);
  assert.equal(inQuietHours(prefs, at(7, 0)), false);
  assert.equal(inQuietHours({ quietHours: { enabled: false, start: '22:00', end: '07:00' } }, at(23, 0)), false);
  assert.equal(inQuietHours({ quietHours: { enabled: true, start: '09:00', end: '17:00' } }, at(12, 0)), true);
});

test('an event notifies when it is on and it is not quiet', () => {
  const prefs = { done: false, approval: true, quietHours: { enabled: true, start: '22:00', end: '07:00' } };
  assert.equal(notifyAllowed('done', prefs, at(12, 0)), false);
  assert.equal(notifyAllowed('approval', prefs, at(12, 0)), true);
  assert.equal(notifyAllowed('approval', prefs, at(23, 0)), false);
  assert.equal(notifyAllowed('done', null), true, 'unknown choices: notify');
});
