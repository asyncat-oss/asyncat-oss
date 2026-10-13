// den/src/agent/scheduleParser.js
// ─── Plain-English schedules ──────────────────────────────────────────────────
// Turns what people (and the agent) write — "every weekday at 8am",
// "every Monday at 9", "daily 18:00", "every 3 hours", "tomorrow at 7am",
// "0 9 * * 1-5" — into a schedule object for scheduleMath.normalizeSchedule.
// Returns null when the text isn't understood.

import { parseCron, resolveTimeZone, wallClockToUtc, zonedParts } from './scheduleMath.js';

const DAY_PATTERNS = [
  [0, 'sun(?:day)?s?'],
  [1, 'mon(?:day)?s?'],
  [2, 'tue(?:s(?:day)?)?s?'],
  [3, 'wed(?:nesday)?s?'],
  [4, 'thu(?:r(?:s(?:day)?)?)?s?'],
  [5, 'fri(?:day)?s?'],
  [6, 'sat(?:urday)?s?'],
];
const DAY_WORD = DAY_PATTERNS.map(([, pattern]) => pattern).join('|');
const DAY_RE = new RegExp(`\\b(${DAY_WORD})\\b`, 'g');
const pad = (value) => String(value).padStart(2, '0');

function dayNumber(word) {
  for (const [day, pattern] of DAY_PATTERNS) {
    if (new RegExp(`^(?:${pattern})$`).test(word)) return day;
  }
  return null;
}

/** Days named in the text, with ranges like "mon-fri" or "monday to friday". */
function findDays(text) {
  const days = new Set();
  const range = text.match(new RegExp(`\\b(${DAY_WORD})\\s*(?:-|–|to|through|thru|until)\\s*(${DAY_WORD})\\b`));
  if (range) {
    const start = dayNumber(range[1]);
    const end = dayNumber(range[2]);
    if (start !== null && end !== null) {
      for (let day = start; ; day = (day + 1) % 7) {
        days.add(day);
        if (day === end) break;
      }
    }
  }
  for (const match of text.matchAll(DAY_RE)) {
    const day = dayNumber(match[1]);
    if (day !== null) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

/**
 * The clock time in the text: "8am", "8:30 pm", "18:00", "at 9", "noon",
 * "midnight". Numbers that belong to "every 3 hours" or "in 20 minutes" are
 * ignored. Returns "HH:MM" or null.
 */
export function findClockTime(text) {
  if (/\b(noon|midday)\b/.test(text)) return '12:00';
  if (/\bmidnight\b/.test(text)) return '00:00';
  const cleaned = text
    .replace(/\b(?:every|in|after|for)\s+\d+\s*(?:minutes?|mins?|hours?|hrs?|h|days?|weeks?)\b/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
  const patterns = [
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\W|$)/,
    /\b(\d{1,2})[:.](\d{2})\b/,
    /\b(?:at|@)\s*(\d{1,2})\b(?!\s*(?:minutes?|mins?|hours?|hrs?|days?|th|st|nd|rd))/,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = (match[3] || '').replace(/\./g, '');
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    return `${pad(hour)}:${pad(minute)}`;
  }
  if (/\bmorning\b/.test(text)) return '08:00';
  if (/\bafternoon\b/.test(text)) return '14:00';
  if (/\bevening\b/.test(text)) return '18:00';
  if (/\bnight\b/.test(text)) return '21:00';
  return null;
}

const DEFAULT_TIME = '09:00';

function onceAt(dateParts, time, timezone) {
  const [hour, minute] = time.split(':').map(Number);
  const date = `${dateParts.year}-${pad(dateParts.month)}-${pad(dateParts.day)}`;
  return { kind: 'once', date, time, at: wallClockToUtc({ ...dateParts, hour, minute }, timezone).toISOString() };
}

function addDays(parts, count) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + count));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

// Five fields whose minute and hour are numbers or * (never words, so
// "every day at 9 am" isn't mistaken for one).
function looksLikeCron(text) {
  if (/^@(hourly|daily|midnight|weekly|monthly|yearly|annually)$/i.test(text)) return true;
  const fields = text.split(/\s+/);
  return fields.length === 5 && fields.slice(0, 2).every((field) => /^[\d*/,-]+$/.test(field));
}

/**
 * Parse a schedule written in plain English (or a cron expression).
 * `now` and `timezone` anchor relative phrases such as "tomorrow at 7am".
 */
export function parseScheduleText(input, { now = new Date(), timezone = null } = {}) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const zone = resolveTimeZone(timezone);

  const cronText = raw.replace(/^cron\s*[:=]?\s*/i, '');
  if (looksLikeCron(cronText)) {
    try {
      return { kind: 'cron', cron: parseCron(cronText).expression };
    } catch {
      return null;
    }
  }

  const text = raw.toLowerCase()
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const time = findClockTime(text);

  // Every N minutes / hours.
  const every = text.match(/\bevery\s+(\d+|an?|one|other)?\s*(minutes?|mins?|hours?|hrs?|h)\b/);
  if (every || /\bhourly\b/.test(text)) {
    const unit = every?.[2] || 'hour';
    const count = !every?.[1] || /^(an?|one)$/.test(every[1]) ? 1 : every[1] === 'other' ? 2 : Number(every[1]);
    if (/^(minutes?|mins?)$/.test(unit)) {
      if (count % 60 === 0) return { kind: 'every_hours', interval: count / 60 };
      if (60 % count === 0) return { kind: 'cron', cron: `*/${count} * * * *` };
      return null;
    }
    return { kind: 'every_hours', interval: count };
  }

  // One-off: "in 2 hours", "in 30 minutes".
  const relative = text.match(/\b(?:in|after)\s+(\d+|an?|one)\s*(minutes?|mins?|hours?|hrs?|days?)\b/);
  if (relative) {
    const count = /^(an?|one)$/.test(relative[1]) ? 1 : Number(relative[1]);
    if (/^days?$/.test(relative[2]) && time) {
      const today = zonedParts(now, zone);
      return onceAt(addDays({ year: today.year, month: today.month, day: today.day }, count), time, zone);
    }
    const unitMs = /^(minutes?|mins?)$/.test(relative[2]) ? 60_000 : /^(hours?|hrs?)$/.test(relative[2]) ? 3_600_000 : 86_400_000;
    const at = new Date(Math.ceil((now.getTime() + count * unitMs) / 60_000) * 60_000);
    const parts = zonedParts(at, zone);
    return onceAt(parts, `${pad(parts.hour)}:${pad(parts.minute)}`, zone);
  }

  // An exact instant with its offset, e.g. 2026-10-20T09:00:00Z.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) return null;
    const parts = zonedParts(at, zone);
    return { kind: 'once', date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`, time: `${pad(parts.hour)}:${pad(parts.minute)}`, at: at.toISOString() };
  }

  const today = zonedParts(now, zone);
  const todayDate = { year: today.year, month: today.month, day: today.day };

  // One-off on a calendar date: "2026-10-20 at 9", "on 2026-10-20 09:00".
  const isoDate = text.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[t ](\d{1,2}):(\d{2}))?/);
  if (isoDate) {
    const date = { year: Number(isoDate[1]), month: Number(isoDate[2]), day: Number(isoDate[3]) };
    const clock = isoDate[4] ? `${pad(Number(isoDate[4]))}:${isoDate[5]}` : (time || DEFAULT_TIME);
    return onceAt(date, clock, zone);
  }

  // One-off today / tomorrow.
  if (/\btomorrow\b/.test(text)) return onceAt(addDays(todayDate, 1), time || DEFAULT_TIME, zone);
  if (/\b(today|tonight|this (?:morning|afternoon|evening))\b/.test(text)) {
    return onceAt(todayDate, time || (/\btonight\b/.test(text) ? '21:00' : DEFAULT_TIME), zone);
  }

  const repeating = /\b(every|each|daily|weekly|weekdays?|weekends?|on|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b/.test(text);
  const days = findDays(text);

  // Weekdays / weekends.
  if (/\b(week ?days?|working days?|business days?|work ?days?)\b/.test(text) && !/\bweekends?\b/.test(text)) {
    return { kind: 'weekdays', time: time || DEFAULT_TIME };
  }
  if (/\bweekends?\b/.test(text)) return { kind: 'weekly', time: time || DEFAULT_TIME, days: [0, 6] };

  // Daily.
  if (/\b(daily|every ?day|each day|every (?:morning|afternoon|evening|night)|nightly)\b/.test(text)) {
    return { kind: 'daily', time: time || DEFAULT_TIME };
  }

  // Named days: "every monday at 9", "mondays and thursdays 9:30", "next friday at 3pm".
  if (days.length) {
    const nextOnly = /\b(next|this|on|coming)\b/.test(text) && !/\b(every|each|weekly)\b/.test(text) && !/(day)s\b/.test(text);
    if (nextOnly && days.length === 1) {
      const clock = time || DEFAULT_TIME;
      const [hour, minute] = clock.split(':').map(Number);
      let offset = (days[0] - today.weekday + 7) % 7;
      if (/\bnext\b/.test(text) && offset === 0) offset = 7;
      let date = addDays(todayDate, offset);
      if (wallClockToUtc({ ...date, hour, minute }, zone).getTime() <= now.getTime()) date = addDays(date, 7);
      return onceAt(date, clock, zone);
    }
    if (days.length === 7) return { kind: 'daily', time: time || DEFAULT_TIME };
    if (days.join(',') === '1,2,3,4,5') return { kind: 'weekdays', time: time || DEFAULT_TIME };
    return { kind: 'weekly', time: time || DEFAULT_TIME, days };
  }

  // "weekly" with no day: the same weekday as today.
  if (/\b(weekly|every week|each week)\b/.test(text)) {
    return { kind: 'weekly', time: time || DEFAULT_TIME, days: [today.weekday] };
  }

  // A bare time, "at 5pm": once, today if still ahead, otherwise tomorrow.
  if (time && !repeating) {
    const [hour, minute] = time.split(':').map(Number);
    const sameDay = wallClockToUtc({ ...todayDate, hour, minute }, zone);
    return onceAt(sameDay.getTime() > now.getTime() ? todayDate : addDays(todayDate, 1), time, zone);
  }

  // Anything else Date can read, e.g. "Oct 20 2026 9:00".
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const parts = zonedParts(new Date(parsed), zone);
    return onceAt(parts, `${pad(parts.hour)}:${pad(parts.minute)}`, zone);
  }
  return null;
}
