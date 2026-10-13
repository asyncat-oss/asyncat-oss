// Which events may show a desktop notification, and quiet hours: the same
// choices for chats (shown by the window) and Cats (shown by the desktop
// app). Set in Settings → Notifications; den keeps them.

import { API_BASE_URL, apiRequest } from '../CommandCenter/api/client.js';
import { notifyAllowed } from './notifyRules.js';

const URL = `${API_BASE_URL}/notifications/desktop`;
let cached = null;
let loadedAt = 0;

export { inQuietHours } from './notifyRules.js';

/** May `event` notify now, by the saved choices? */
export function notifyAllowedNow(event, now = new Date()) {
  return notifyAllowed(event, cached, now);
}

export async function loadNotifyPrefs({ force = false } = {}) {
  if (!force && cached && Date.now() - loadedAt < 60_000) return cached;
  try {
    const res = await apiRequest(URL);
    cached = res.prefs || null;
    loadedAt = Date.now();
  } catch {
    // Keep the last known choices.
  }
  return cached;
}

export async function saveNotifyPrefs(prefs) {
  const res = await apiRequest(URL, { method: 'PUT', body: JSON.stringify({ prefs }) });
  cached = res.prefs;
  loadedAt = Date.now();
  return res;
}

export const testNotification = () => apiRequest(`${URL}/test`, { method: 'POST', body: '{}' });
export const notifyStatus = () => apiRequest(URL);
