// den/src/lib/notify.js
// ─── Desktop notifications from the backend ──────────────────────────────────
// A Cat finished, wants an OK or asks something: the desktop app shows a
// notification, and clicking it opens the page it is about. Which events
// notify, and quiet hours when nothing pops up, are set in Settings →
// Notifications and stored in app_config as ASYNCAT_NOTIFICATIONS. During
// quiet hours nothing is lost: the item still waits in the Cats inbox.

import { sendToHost } from './hostBridge.js';

export const NOTIFY_EVENTS = ['done', 'approval', 'question', 'failed'];

export const DEFAULT_NOTIFY_PREFS = Object.freeze({
  done: true,
  approval: true,
  question: true,
  failed: true,
  quietHours: { enabled: false, start: '22:00', end: '07:00' },
});

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function minutesOf(clock) {
  const match = String(clock || '').match(CLOCK);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Prefs from any shape, with defaults for what is missing or wrong. */
export function normalizeNotifyPrefs(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const quiet = input.quietHours && typeof input.quietHours === 'object' ? input.quietHours : {};
  const prefs = { quietHours: {} };
  for (const event of NOTIFY_EVENTS) {
    prefs[event] = input[event] === undefined ? DEFAULT_NOTIFY_PREFS[event] : Boolean(input[event]);
  }
  prefs.quietHours.enabled = Boolean(quiet.enabled);
  prefs.quietHours.start = CLOCK.test(String(quiet.start || '')) ? String(quiet.start) : DEFAULT_NOTIFY_PREFS.quietHours.start;
  prefs.quietHours.end = CLOCK.test(String(quiet.end || '')) ? String(quiet.end) : DEFAULT_NOTIFY_PREFS.quietHours.end;
  return prefs;
}

export function getNotifyPrefs(env = process.env) {
  try {
    return normalizeNotifyPrefs(JSON.parse(env.ASYNCAT_NOTIFICATIONS || '{}'));
  } catch {
    return normalizeNotifyPrefs({});
  }
}

/** Save the prefs (app_config) and use them at once. */
export async function setNotifyPrefs(prefs) {
  const normalized = normalizeNotifyPrefs(prefs);
  const { setConfigValue } = await import('../config/appConfig.js');
  setConfigValue('ASYNCAT_NOTIFICATIONS', JSON.stringify(normalized));
  return normalized;
}

/** Is `now` inside the quiet hours (which may run past midnight)? */
export function inQuietHours(prefs, now = new Date()) {
  const quiet = prefs?.quietHours;
  if (!quiet?.enabled) return false;
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  if (start === null || end === null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/**
 * Show a desktop notification for `event` ('done', 'approval', 'question',
 * 'failed') unless the user turned that event off or it's quiet hours.
 * Returns { sent, reason }.
 */
export function notifyUser({ event, title, body = '', route = null }, { prefs = getNotifyPrefs(), now = new Date() } = {}) {
  if (NOTIFY_EVENTS.includes(event) && !prefs[event]) return { sent: false, reason: 'off' };
  if (inQuietHours(prefs, now)) return { sent: false, reason: 'quiet' };
  sendToHost('notify', {
    title: String(title || 'Asyncat').slice(0, 120),
    body: String(body || '').slice(0, 300),
    ...(route ? { route } : {}),
  });
  return { sent: true, reason: null };
}
