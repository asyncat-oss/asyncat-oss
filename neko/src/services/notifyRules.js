// Pure rules for desktop notifications (no app imports, so tests can load it).

const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;
function minutes(clock) {
  const match = String(clock || '').match(CLOCK);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Is `now` inside the quiet hours (which may run past midnight)? */
export function inQuietHours(prefs, now = new Date()) {
  const quiet = prefs?.quietHours;
  if (!quiet?.enabled) return false;
  const start = minutes(quiet.start);
  const end = minutes(quiet.end);
  if (start === null || end === null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/** May `event` ('done', 'approval', 'question', 'failed') notify now? */
export function notifyAllowed(event, prefs, now = new Date()) {
  if (!prefs) return true;
  if (prefs[event] === false) return false;
  return !inQuietHours(prefs, now);
}

