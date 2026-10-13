// den/src/agent/scheduleMath.js
// ─── When does a scheduled task run next? ────────────────────────────────────
// Pure date maths for scheduled tasks: no database, no timers. A schedule is
// a small object:
//
//   { kind: 'once',        date: 'YYYY-MM-DD', time: 'HH:MM', at: ISO }
//   { kind: 'daily',       time: 'HH:MM' }
//   { kind: 'weekdays',    time: 'HH:MM' }                 Monday to Friday
//   { kind: 'weekly',      time: 'HH:MM', days: [1, 4] }   0 = Sunday
//   { kind: 'every_hours', interval: 3, anchor: ISO }      anchor + k × interval
//   { kind: 'cron',        cron: '0 9 * * 1-5' }           5 fields
//
// Wall-clock schedules are evaluated in the task's IANA time zone. When a
// clock change skips a time (02:30 on the spring-forward night) the run moves
// to just after the gap; when a time happens twice (autumn) it runs once, at
// the first of the two.

export const MIN_REPEAT_MINUTES = 15;
export const CATCH_UP_WINDOW_MS = 12 * 60 * 60 * 1000;
export const MAX_EVERY_HOURS = 168;
export const SCHEDULE_KINDS = Object.freeze(['once', 'daily', 'weekdays', 'weekly', 'every_hours', 'cron']);

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAY_SET = [1, 2, 3, 4, 5];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class ScheduleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScheduleError';
    this.status = 400;
  }
}

// ── Time zones ────────────────────────────────────────────────────────────────

export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function isValidTimeZone(timezone) {
  if (!timezone || typeof timezone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/** The task's zone if it is a real one, otherwise this computer's zone. */
export function resolveTimeZone(timezone) {
  return isValidTimeZone(timezone) ? timezone : localTimeZone();
}

const formatters = new Map();
function formatterFor(timezone) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hourCycle: 'h23',
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

/** Wall-clock parts of `date` in `timezone` (month 1–12, weekday 0 = Sunday). */
export function zonedParts(date, timezone) {
  const parts = {};
  for (const part of formatterFor(timezone).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  if (parts.hour === 24) parts.hour = 0;
  parts.weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return parts;
}

function offsetAt(ms, timezone) {
  const p = zonedParts(new Date(ms), timezone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(ms / 1000) * 1000;
}

function sameWall(ms, wall, timezone) {
  const p = zonedParts(new Date(ms), timezone);
  return p.year === wall.year && p.month === wall.month && p.day === wall.day
    && p.hour === wall.hour && p.minute === wall.minute;
}

/**
 * The instant at which the clock in `timezone` shows the given wall time.
 * Ambiguous times (clocks going back) give the earlier instant; times that
 * don't exist (clocks going forward) give the instant just after the gap.
 */
export function wallClockToUtc(wall, timezone) {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const before = offsetAt(guess - DAY_MS, timezone);
  const offsets = [...new Set([before, offsetAt(guess, timezone), offsetAt(guess + DAY_MS, timezone)])];
  const matches = offsets
    .map((offset) => guess - offset)
    .filter((ms) => sameWall(ms, wall, timezone))
    .sort((a, b) => a - b);
  return new Date(matches.length ? matches[0] : guess - before);
}

function addDays({ year, month, day }, count) {
  const date = new Date(Date.UTC(year, month - 1, day + count));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function weekdayOf({ year, month, day }) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// ── Parsing pieces ────────────────────────────────────────────────────────────

const pad = (value) => String(value).padStart(2, '0');

/** "8:00", "08:00", "8" → { hour, minute }; null when it isn't a clock time. */
export function parseClockTime(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function formatClock({ hour, minute }) {
  return `${pad(hour)}:${pad(minute)}`;
}

function requireTime(value, fallback = null) {
  const parsed = parseClockTime(value ?? fallback);
  if (!parsed) throw new ScheduleError('Pick a time of day, like 08:00.');
  return formatClock(parsed);
}

function parseDateOnly(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (check.getUTCMonth() !== parts.month - 1 || check.getUTCDate() !== parts.day) return null;
  return parts;
}

// ── Cron ──────────────────────────────────────────────────────────────────────

const CRON_MACROS = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};
const CRON_NAMES = {
  month: { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 },
  dow: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 },
};
const CRON_FIELDS = [
  { key: 'minutes', min: 0, max: 59 },
  { key: 'hours', min: 0, max: 23 },
  { key: 'doms', min: 1, max: 31 },
  { key: 'months', min: 1, max: 12, names: CRON_NAMES.month },
  { key: 'dows', min: 0, max: 7, names: CRON_NAMES.dow },
];

function cronValue(raw, field) {
  const lower = raw.toLowerCase();
  if (field.names && Object.hasOwn(field.names, lower)) return field.names[lower];
  if (!/^\d+$/.test(raw)) throw new ScheduleError(`"${raw}" isn't a valid cron value.`);
  const value = Number(raw);
  if (value < field.min || value > field.max) throw new ScheduleError(`${value} is out of range in the cron expression.`);
  return value;
}

function parseCronField(text, field) {
  const values = new Set();
  for (const part of text.split(',')) {
    if (!part) throw new ScheduleError('The cron expression has an empty list entry.');
    const [rangeText, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new ScheduleError(`"${part}" has an invalid step.`);
    let start;
    let end;
    if (rangeText === '*') {
      start = field.min;
      end = field.key === 'dows' ? 6 : field.max;
    } else if (rangeText.includes('-')) {
      const [a, b] = rangeText.split('-');
      start = cronValue(a, field);
      end = cronValue(b, field);
      if (end < start) throw new ScheduleError(`"${part}" is a backwards range.`);
    } else {
      start = cronValue(rangeText, field);
      end = stepText === undefined ? start : field.max;
    }
    for (let value = start; value <= end; value += step) values.add(field.key === 'dows' && value === 7 ? 0 : value);
  }
  return values;
}

/** Parse a 5-field cron expression (or @daily and friends). Throws ScheduleError. */
export function parseCron(expression) {
  const raw = String(expression ?? '').trim().replace(/\s+/g, ' ');
  const text = CRON_MACROS[raw.toLowerCase()] || raw;
  const parts = text.split(' ');
  if (parts.length !== 5) {
    throw new ScheduleError('A cron expression has five fields: minute hour day-of-month month day-of-week.');
  }
  const parsed = { expression: raw };
  CRON_FIELDS.forEach((field, index) => {
    parsed[field.key] = parseCronField(parts[index], field);
  });
  parsed.domAny = parts[2] === '*';
  parsed.dowAny = parts[4] === '*';
  parsed.sortedHours = [...parsed.hours].sort((a, b) => a - b);
  parsed.sortedMinutes = [...parsed.minutes].sort((a, b) => a - b);
  return parsed;
}

/** Smallest gap, in minutes, between two runs of a cron schedule within a day. */
export function cronMinimumGapMinutes(parsed) {
  const times = [];
  for (const hour of parsed.sortedHours) for (const minute of parsed.sortedMinutes) times.push(hour * 60 + minute);
  if (times.length <= 1) return 24 * 60;
  let gap = times[0] + 24 * 60 - times[times.length - 1];
  for (let i = 1; i < times.length; i += 1) gap = Math.min(gap, times[i] - times[i - 1]);
  return gap;
}

function cronDayMatches(parsed, date) {
  if (!parsed.months.has(date.month)) return false;
  const domOk = parsed.doms.has(date.day);
  const dowOk = parsed.dows.has(weekdayOf(date));
  if (parsed.domAny && parsed.dowAny) return true;
  if (parsed.domAny) return dowOk;
  if (parsed.dowAny) return domOk;
  return domOk || dowOk;
}

// Walk forward day by day from the local date of `after` and return the first
// matching wall time that is strictly later than `after`.
function nextWallTime({ after, timezone, dayMatches, hours, minutes, maxDays = 8 * 366 }) {
  const start = zonedParts(after, timezone);
  let date = { year: start.year, month: start.month, day: start.day };
  for (let i = 0; i <= maxDays; i += 1, date = addDays(date, 1)) {
    if (!dayMatches(date)) continue;
    for (const hour of hours) {
      for (const minute of minutes) {
        const instant = wallClockToUtc({ ...date, hour, minute }, timezone);
        if (instant.getTime() > after.getTime()) return instant;
      }
    }
  }
  return null;
}

// ── Normalising user input ────────────────────────────────────────────────────

function normalizeDays(days) {
  const list = (Array.isArray(days) ? days : [days])
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 7)
    .map((day) => (day === 7 ? 0 : day));
  return [...new Set(list)].sort((a, b) => a - b);
}

/**
 * Check and tidy a schedule from the UI, the agent or a migration. Returns a
 * new object; throws ScheduleError with a message fit to show the user.
 *
 * Options: `now` (Date), `timezone` (for once tasks given as date + time),
 * `requireFuture` (a once task must be later than now).
 */
export function normalizeSchedule(input, { now = new Date(), timezone = null, requireFuture = false } = {}) {
  if (!input || typeof input !== 'object') throw new ScheduleError('Choose when the task should run.');
  const kind = String(input.kind || '').trim();
  const zone = resolveTimeZone(timezone);

  switch (kind) {
    case 'once': {
      let at = null;
      let date = parseDateOnly(input.date);
      let time = parseClockTime(input.time);
      if (date && time) {
        at = wallClockToUtc({ ...date, ...time }, zone);
      } else if (input.at) {
        at = new Date(input.at);
        if (Number.isNaN(at.getTime())) throw new ScheduleError('That date and time could not be read.');
        const parts = zonedParts(at, zone);
        date = { year: parts.year, month: parts.month, day: parts.day };
        time = { hour: parts.hour, minute: parts.minute };
      } else {
        throw new ScheduleError('Pick a date and time for a one-time task.');
      }
      if (requireFuture && at.getTime() <= now.getTime()) throw new ScheduleError('That time has already passed. Pick a later one.');
      return {
        kind,
        date: `${date.year}-${pad(date.month)}-${pad(date.day)}`,
        time: formatClock(time),
        at: at.toISOString(),
      };
    }
    case 'daily':
    case 'weekdays':
      return { kind, time: requireTime(input.time) };
    case 'weekly': {
      const days = normalizeDays(input.days ?? input.day);
      if (!days.length) throw new ScheduleError('Pick at least one day of the week.');
      return { kind, time: requireTime(input.time), days };
    }
    case 'every_hours': {
      const interval = Number(input.interval ?? input.hours);
      if (!Number.isInteger(interval) || interval < 1 || interval > MAX_EVERY_HOURS) {
        throw new ScheduleError(`Repeat every 1 to ${MAX_EVERY_HOURS} whole hours.`);
      }
      let anchor = input.anchor ? new Date(input.anchor) : null;
      if (!anchor || Number.isNaN(anchor.getTime())) {
        anchor = new Date(Math.ceil(now.getTime() / MINUTE_MS) * MINUTE_MS);
      }
      return { kind, interval, anchor: anchor.toISOString() };
    }
    case 'cron': {
      const parsed = parseCron(input.cron ?? input.expression);
      if (cronMinimumGapMinutes(parsed) < MIN_REPEAT_MINUTES) {
        throw new ScheduleError(`Scheduled tasks can repeat at most every ${MIN_REPEAT_MINUTES} minutes.`);
      }
      return { kind, cron: parsed.expression };
    }
    default:
      throw new ScheduleError('Choose when the task should run: once, daily, weekdays, weekly, every few hours or a cron expression.');
  }
}

// ── Next run ──────────────────────────────────────────────────────────────────

/** The first run strictly after `after`, or null when there is none (a past one-off). */
export function computeNextRun(schedule, after = new Date(), timezone = null) {
  if (!schedule || typeof schedule !== 'object') return null;
  const zone = resolveTimeZone(timezone);
  const from = after instanceof Date ? after : new Date(after);

  switch (schedule.kind) {
    case 'once': {
      const at = new Date(schedule.at);
      if (Number.isNaN(at.getTime())) return null;
      return at.getTime() > from.getTime() ? at : null;
    }
    case 'daily':
    case 'weekdays':
    case 'weekly': {
      const time = parseClockTime(schedule.time);
      if (!time) return null;
      const days = schedule.kind === 'daily' ? null : new Set(schedule.kind === 'weekdays' ? WEEKDAY_SET : normalizeDays(schedule.days));
      if (days && !days.size) return null;
      return nextWallTime({
        after: from,
        timezone: zone,
        dayMatches: (date) => !days || days.has(weekdayOf(date)),
        hours: [time.hour],
        minutes: [time.minute],
        maxDays: 8,
      });
    }
    case 'every_hours': {
      const interval = Number(schedule.interval) * HOUR_MS;
      const anchor = new Date(schedule.anchor).getTime();
      if (!(interval > 0) || Number.isNaN(anchor)) return null;
      const steps = Math.max(1, Math.floor((from.getTime() - anchor) / interval) + 1);
      return new Date(anchor + steps * interval);
    }
    case 'cron': {
      let parsed;
      try { parsed = parseCron(schedule.cron); } catch { return null; }
      return nextWallTime({
        after: from,
        timezone: zone,
        dayMatches: (date) => cronDayMatches(parsed, date),
        hours: parsed.sortedHours,
        minutes: parsed.sortedMinutes,
      });
    }
    default:
      return null;
  }
}

/**
 * What to do with a task whose next run time has come (`nextRunAt <= now`).
 *
 * A run that was missed (the computer was off or asleep) is made up once when
 * one of its run times falls within the last `windowMs` (12 hours); older
 * ones are skipped. Either way the following run is computed from now, so a
 * long sleep never produces a burst of runs.
 *
 * Returns { action: 'wait' } when nothing is due, otherwise
 * { action: 'run' | 'skip', scheduledFor, next } (next may be null).
 */
export function planDueRun({ schedule, timezone = null, nextRunAt, now = new Date(), windowMs = CATCH_UP_WINDOW_MS }) {
  const due = nextRunAt ? new Date(nextRunAt) : null;
  if (!due || Number.isNaN(due.getTime()) || due.getTime() > now.getTime()) return { action: 'wait' };
  const windowStart = now.getTime() - windowMs;
  const latestInWindow = due.getTime() >= windowStart
    ? due
    : computeNextRun(schedule, new Date(windowStart - 1), timezone);
  const next = computeNextRun(schedule, now, timezone);
  if (latestInWindow && latestInWindow.getTime() <= now.getTime()) {
    return { action: 'run', scheduledFor: latestInWindow, next, late: now.getTime() - latestInWindow.getTime() > 2 * MINUTE_MS };
  }
  return { action: 'skip', scheduledFor: due, next };
}

// ── Words ─────────────────────────────────────────────────────────────────────

function clockText(value) {
  const time = parseClockTime(value);
  if (!time) return String(value || '');
  return `${time.hour}:${pad(time.minute)}`;
}

function joinWords(words) {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function daysText(days) {
  const set = normalizeDays(days);
  if (set.length === 7) return 'Daily';
  if (set.join(',') === '1,2,3,4,5') return 'Weekdays';
  if (set.join(',') === '0,6') return 'Weekends';
  if (set.length === 1) return `Every ${DAY_NAMES[set[0]]}`;
  // Monday first reads more naturally.
  const ordered = [...set.filter((day) => day !== 0), ...set.filter((day) => day === 0)];
  return `Every ${joinWords(ordered.map((day) => DAY_SHORT[day]))}`;
}

/** "Weekdays at 8:00", "Every 3 hours", "Once, 14 Oct 2026 at 7:00". */
export function describeSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') return 'No schedule';
  switch (schedule.kind) {
    case 'once': {
      const date = parseDateOnly(schedule.date);
      const dateText = date ? `${date.day} ${MONTH_SHORT[date.month - 1]} ${date.year}` : schedule.date;
      return `Once, ${dateText} at ${clockText(schedule.time)}`;
    }
    case 'daily':
      return `Daily at ${clockText(schedule.time)}`;
    case 'weekdays':
      return `Weekdays at ${clockText(schedule.time)}`;
    case 'weekly':
      return `${daysText(schedule.days)} at ${clockText(schedule.time)}`;
    case 'every_hours':
      return Number(schedule.interval) === 1 ? 'Every hour' : `Every ${schedule.interval} hours`;
    case 'cron':
      return `Cron: ${schedule.cron}`;
    default:
      return 'No schedule';
  }
}

/**
 * Turn simple cron expressions into the friendlier kinds (daily, weekdays,
 * weekly). Anything else stays a cron schedule.
 */
export function simplifyCron(expression) {
  let parsed;
  try { parsed = parseCron(expression); } catch { return null; }
  const fields = String(CRON_MACROS[parsed.expression.toLowerCase()] || parsed.expression).split(' ');
  const single = (text) => /^\d{1,2}$/.test(text);
  if (single(fields[0]) && single(fields[1]) && fields[2] === '*' && fields[3] === '*') {
    const time = `${pad(Number(fields[1]))}:${pad(Number(fields[0]))}`;
    const days = [...parsed.dows].sort((a, b) => a - b);
    if (parsed.dowAny || days.length === 7) return { kind: 'daily', time };
    if (days.join(',') === '1,2,3,4,5') return { kind: 'weekdays', time };
    return { kind: 'weekly', time, days };
  }
  return { kind: 'cron', cron: parsed.expression };
}
