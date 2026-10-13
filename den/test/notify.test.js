import test from 'node:test';
import assert from 'node:assert/strict';

import { inQuietHours, normalizeNotifyPrefs, notifyUser, getNotifyPrefs } from '../src/lib/notify.js';
import { resetHostBridge, waitForHostMessages } from '../src/lib/hostBridge.js';

const at = (clock) => new Date(`2026-10-14T${clock}:00`);

test('preferences fill in defaults and drop junk', () => {
  const prefs = normalizeNotifyPrefs({ done: false, approval: 'yes', quietHours: { enabled: true, start: '25:00', end: '06:30' } });
  assert.equal(prefs.done, false);
  assert.equal(prefs.approval, true);
  assert.equal(prefs.question, true);
  assert.deepEqual(prefs.quietHours, { enabled: true, start: '22:00', end: '06:30' });
  assert.deepEqual(getNotifyPrefs({ ASYNCAT_NOTIFICATIONS: 'not json' }), normalizeNotifyPrefs({}));
});

test('quiet hours can run past midnight', () => {
  const overnight = normalizeNotifyPrefs({ quietHours: { enabled: true, start: '22:00', end: '07:00' } });
  assert.equal(inQuietHours(overnight, at('23:30')), true);
  assert.equal(inQuietHours(overnight, at('06:59')), true);
  assert.equal(inQuietHours(overnight, at('07:00')), false);
  assert.equal(inQuietHours(overnight, at('12:00')), false);
  const lunch = normalizeNotifyPrefs({ quietHours: { enabled: true, start: '12:00', end: '13:00' } });
  assert.equal(inQuietHours(lunch, at('12:30')), true);
  assert.equal(inQuietHours(lunch, at('13:30')), false);
  assert.equal(inQuietHours(normalizeNotifyPrefs({}), at('23:30')), false, 'off by default');
});

test('a notification goes to the desktop app unless its event is off or it is quiet', async () => {
  resetHostBridge();
  const prefs = normalizeNotifyPrefs({ done: false, quietHours: { enabled: true, start: '22:00', end: '07:00' } });
  assert.deepEqual(notifyUser({ event: 'done', title: 'Cat' }, { prefs, now: at('12:00') }), { sent: false, reason: 'off' });
  assert.deepEqual(notifyUser({ event: 'approval', title: 'Cat' }, { prefs, now: at('23:00') }), { sent: false, reason: 'quiet' });
  assert.deepEqual(notifyUser({ event: 'approval', title: 'Cat wants your OK', body: 'Delete it?', route: '/cats/1' }, { prefs, now: at('12:00') }), { sent: true, reason: null });
  const messages = await waitForHostMessages({ waitMs: 0 });
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].payload, { title: 'Cat wants your OK', body: 'Delete it?', route: '/cats/1' });
});
