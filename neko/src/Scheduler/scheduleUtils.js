const DEFAULT_TIME = '09:00';

function pad(value) {
  return String(value).padStart(2, '0');
}

export function getLocalTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  } catch {
    return 'local time';
  }
}

export function getAvailableTimeZones() {
  const local = getLocalTimeZone();
  try {
    const supported = Intl.supportedValuesOf?.('timeZone') || [];
    return [...new Set([local, 'UTC', ...supported])];
  } catch {
    return [...new Set([local, 'UTC'])];
  }
}

export function parseCronSchedule(value = '') {
  const cron = String(value || '').trim();
  if (cron === '0 * * * *') return { frequency: 'hourly', time: DEFAULT_TIME, weekday: '1' };

  const match = cron.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(\*|1-5|[0-6])$/);
  if (match) {
    const [, minute, hour, day] = match;
    return {
      frequency: day === '*' ? 'daily' : day === '1-5' ? 'weekdays' : 'weekly',
      time: `${pad(hour)}:${pad(minute)}`,
      weekday: day === '*' || day === '1-5' ? '1' : day,
    };
  }

  return { frequency: 'custom', time: DEFAULT_TIME, weekday: '1' };
}

export function cronFor({ frequency, time = DEFAULT_TIME, weekday = '1', current = '' }) {
  const [hour = '9', minute = '0'] = time.split(':');
  if (frequency === 'hourly') return '0 * * * *';
  if (frequency === 'daily') return `${Number(minute)} ${Number(hour)} * * *`;
  if (frequency === 'weekdays') return `${Number(minute)} ${Number(hour)} * * 1-5`;
  if (frequency === 'weekly') return `${Number(minute)} ${Number(hour)} * * ${weekday}`;
  return current || '0 9 * * *';
}

export function describeCron(value = '') {
  const parsed = parseCronSchedule(value);
  if (parsed.frequency === 'hourly') return 'Every hour';
  const formattedTime = (() => {
    try {
      const [hour, minute] = parsed.time.split(':').map(Number);
      return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
        .format(new Date(2000, 0, 1, hour, minute));
    } catch {
      return parsed.time;
    }
  })();
  if (parsed.frequency === 'daily') return `Every day at ${formattedTime}`;
  if (parsed.frequency === 'weekdays') return `Weekdays at ${formattedTime}`;
  if (parsed.frequency === 'weekly') {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${names[Number(parsed.weekday)] || 'Weekly'} at ${formattedTime}`;
  }
  return value || 'No schedule';
}
