// Helpers for the Scheduled page: the editor's form ↔ a schedule object, and
// the words and times shown in the list. The backend checks everything again
// (den/src/agent/scheduleMath.js); this only has to read well.

export const SCHEDULE_KINDS = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'every_hours', label: 'Every N hours' },
];

// Monday first, as people read a week.
export const WEEK_DAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value) => String(value).padStart(2, '0');

export const EXAMPLE_TASKS = [
  {
    title: 'Every weekday at 8:00, summarise my unread email',
    name: 'Morning email',
    prompt: 'Summarise my unread email: who it is from, what they want, and anything that needs a reply today. Put the most urgent item first.',
    schedule: { kind: 'weekdays', time: '08:00' },
  },
  {
    title: 'Every Monday at 9:00, list what changed in my project last week',
    name: 'Weekly project changes',
    prompt: 'List what changed in this project over the last week: the main commits, the files that changed most, and anything that looks unfinished.',
    schedule: { kind: 'weekly', time: '09:00', days: [1] },
  },
  {
    title: 'Daily at 18:00, check the price of …',
    name: 'Price check',
    prompt: 'Check the price of … and tell me if it changed since yesterday.',
    schedule: { kind: 'daily', time: '18:00' },
  },
];

export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function timeZoneList() {
  const local = localTimeZone();
  let zones = [];
  try {
    zones = Intl.supportedValuesOf?.('timeZone') || [];
  } catch {
    zones = [];
  }
  return [...new Set([local, 'UTC', ...zones])];
}

/** "08:05" → "8:05". */
export function clockText(time) {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  return match ? `${Number(match[1])}:${match[2]}` : String(time || '');
}

function daysText(days = []) {
  const set = [...new Set(days.map(Number))].sort((a, b) => a - b);
  if (set.length === 7) return 'Daily';
  if (set.join(',') === '1,2,3,4,5') return 'Weekdays';
  if (set.join(',') === '0,6') return 'Weekends';
  const ordered = WEEK_DAYS.filter((day) => set.includes(day.value));
  if (ordered.length === 1) return `Every ${ordered[0].long}`;
  const names = ordered.map((day) => day.short);
  return `Every ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] || '…'}`;
}

/** Same words as the backend: "Weekdays at 8:00", "Every 3 hours"… */
export function describeSchedule(schedule) {
  if (!schedule?.kind) return 'No schedule';
  switch (schedule.kind) {
    case 'once': {
      const match = String(schedule.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const date = match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : 'a date';
      return `Once, ${date} at ${clockText(schedule.time)}`;
    }
    case 'daily': return `Daily at ${clockText(schedule.time)}`;
    case 'weekdays': return `Weekdays at ${clockText(schedule.time)}`;
    case 'weekly': return `${daysText(schedule.days)} at ${clockText(schedule.time)}`;
    case 'every_hours': return Number(schedule.interval) === 1 ? 'Every hour' : `Every ${schedule.interval} hours`;
    case 'cron': return `Cron: ${schedule.cron}`;
    default: return 'No schedule';
  }
}

function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The editor's starting values for a new task, an example or a task being edited. */
export function formFromTask(task = null, { now = new Date() } = {}) {
  const schedule = task?.schedule || { kind: 'weekdays', time: '08:00' };
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const isCron = schedule.kind === 'cron';
  return {
    name: task?.name || '',
    prompt: task?.prompt || '',
    kind: isCron ? 'daily' : schedule.kind,
    time: schedule.time || '09:00',
    date: schedule.kind === 'once' && schedule.date ? schedule.date : todayIso(tomorrow),
    days: schedule.kind === 'weekly' && Array.isArray(schedule.days) && schedule.days.length ? schedule.days : [1],
    interval: schedule.kind === 'every_hours' ? Number(schedule.interval) || 3 : 3,
    cron: isCron ? schedule.cron : '',
    timezone: task?.timezone || localTimeZone(),
    projectId: task?.projectId || '',
    profileId: task?.profileId || '',
    providerProfileId: task?.providerProfileId || '',
    allowedTools: Array.isArray(task?.allowedTools) ? task.allowedTools : [],
  };
}

/** The schedule object to send for the editor's values. Throws a message to show. */
export function scheduleFromForm(form) {
  const cron = String(form.cron || '').trim();
  if (cron) return { kind: 'cron', cron };
  const time = String(form.time || '').trim();
  switch (form.kind) {
    case 'once':
      if (!form.date || !time) throw new Error('Pick a date and a time.');
      return { kind: 'once', date: form.date, time };
    case 'daily':
    case 'weekdays':
      if (!time) throw new Error('Pick a time.');
      return { kind: form.kind, time };
    case 'weekly':
      if (!form.days?.length) throw new Error('Pick at least one day.');
      if (!time) throw new Error('Pick a time.');
      return { kind: 'weekly', time, days: [...form.days].sort((a, b) => a - b) };
    case 'every_hours': {
      const interval = Number(form.interval);
      if (!Number.isInteger(interval) || interval < 1 || interval > 168) throw new Error('Repeat every 1 to 168 hours.');
      return { kind: 'every_hours', interval };
    }
    default:
      throw new Error('Choose when the task should run.');
  }
}

/** "Today 8:00", "Tomorrow 18:30", "Wed 14 Oct, 8:00", "14 Oct 2027, 8:00". */
export function formatRunTime(iso, { now = new Date(), timeZone } = {}) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = (value) => {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(value);
    return Object.fromEntries(formatted.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  };
  const target = parts(date);
  const today = parts(now);
  const tomorrow = parts(new Date(now.getTime() + 86_400_000));
  const yesterday = parts(new Date(now.getTime() - 86_400_000));
  const clock = `${Number(target.hour)}:${target.minute}`;
  const sameDay = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day;
  if (sameDay(target, today)) return `Today ${clock}`;
  if (sameDay(target, tomorrow)) return `Tomorrow ${clock}`;
  if (sameDay(target, yesterday)) return `Yesterday ${clock}`;
  if (target.year !== today.year) return `${Number(target.day)} ${target.month} ${target.year}, ${clock}`;
  return `${target.weekday} ${Number(target.day)} ${target.month}, ${clock}`;
}

/** "2 min", "1 h 5 min": how long a run took. */
export function formatDuration(startIso, endIso) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The first readable line of an answer, without markdown or hidden thinking. */
export function firstLine(text, max = 160) {
  const line = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .split('\n')
    .map((item) => item.replace(/^[#>*\-\s]+/, '').replace(/[*_`]/g, '').trim())
    .find(Boolean) || '';
  return line.length > max ? `${line.slice(0, max - 1).trim()}…` : line;
}
