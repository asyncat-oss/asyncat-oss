// Words, defaults and small helpers for the Cats pages. The backend checks
// everything again (den/src/cats/catStore.js); this only has to read well.

import { describeSchedule, firstLine, formatRunTime } from './scheduleForm.js';

export const FREEDOM = {
  ask_first: {
    label: 'Ask me first',
    short: 'Asks first',
    description: 'Asks before anything that changes something: writing files, running commands, sending, posting or clicking buttons. Reading and searching are fine.',
  },
  ask_risky: {
    label: 'Ask for risky steps',
    short: 'Asks for risky steps',
    description: 'Reads, writes in its folder and browses on its own. Asks before deleting, sending, paying or running commands that change things.',
  },
  alone: {
    label: 'Work alone',
    short: 'Works alone',
    description: 'Does what its mission needs without asking. Payments, passwords and steps a site marks as sensitive still wait for you.',
  },
};

export const FREEDOM_ORDER = ['ask_first', 'ask_risky', 'alone'];

export const TRIGGER_LABELS = {
  schedule: 'On a schedule',
  email: 'When an email arrives',
  rss: 'When a feed has a new post',
  webpage: 'When a web page changes',
  folder: 'When files in a folder change',
  chat: 'When you write to it',
};

export const TRIGGER_ORDER = ['schedule', 'email', 'rss', 'webpage', 'folder'];

// '' is no picture: the Cat shows a plain cat glyph.
export const AVATARS = ['', '😺', '🐈', '🐈‍⬛', '🦁', '🐯', '🐾', '🦊', '🦉', '🐝', '🌱', '📬', '📰', '🔎', '🛠️', '💸'];

/** A new trigger of `kind` with sensible starting values. */
export function defaultTrigger(kind) {
  switch (kind) {
    case 'schedule': return { kind, config: { schedule: { kind: 'weekdays', time: '08:00' } } };
    case 'email': return { kind, config: { from: '', subject: '', everyMinutes: 5 } };
    case 'rss': return { kind, config: { url: '', everyMinutes: 30 } };
    case 'webpage': return { kind, config: { url: '', contains: '', everyMinutes: 60 } };
    case 'folder': return { kind, config: { path: '', everyMinutes: 1 } };
    default: return { kind: 'chat', config: {} };
  }
}

/** The words for a trigger being edited (the backend's are used once saved). */
export function triggerText(trigger) {
  if (!trigger) return '';
  if (trigger.text) return trigger.text;
  const { kind, config = {} } = trigger;
  const host = (url) => {
    try { return new URL(url).hostname; } catch { return url || '…'; }
  };
  switch (kind) {
    case 'schedule': return describeSchedule(config.schedule);
    case 'email': return ['New email', config.from ? `from “${config.from}”` : '', config.subject ? `about “${config.subject}”` : ''].filter(Boolean).join(' ');
    case 'rss': return `New post on ${host(config.url)}`;
    case 'webpage': return config.contains ? `${host(config.url)} mentions “${config.contains}”` : `${host(config.url)} changes`;
    case 'folder': return `Files change in ${String(config.path || '…').split(/[\\/]/).filter(Boolean).pop() || '…'}`;
    default: return TRIGGER_LABELS[kind] || kind;
  }
}

/** "Weekdays at 8:00 · New email", or how else it wakes. */
export function wakeSummary(cat) {
  const texts = (cat?.triggers || [])
    .filter((trigger) => trigger.kind !== 'chat' && trigger.enabled !== false)
    .map(triggerText);
  return texts.length ? texts.join(' · ') : 'Only when you write to it';
}

/** { label, tone } for the Cat's state pill. */
export function catStatus(cat) {
  if (!cat) return { label: '', tone: 'gray' };
  if (cat.stopping) return { label: 'Stopping…', tone: 'gray' };
  if (cat.state === 'waiting') return { label: 'Waiting for you', tone: 'amber' };
  if (cat.running) return { label: 'Working…', tone: 'blue' };
  if (!cat.enabled) return { label: 'Paused', tone: 'gray' };
  if (cat.limitReached) return { label: 'Done for today', tone: 'gray' };
  if (cat.queued) return { label: 'Up next', tone: 'blue' };
  return { label: 'On', tone: 'green' };
}

/** "Next: Today 8:00", "Watching", or nothing. */
export function nextWakeText(cat) {
  if (!cat?.enabled) return '';
  if (cat.nextWakeAt) return `Next: ${formatRunTime(cat.nextWakeAt, { timeZone: cat.timezone || undefined })}`;
  if ((cat.triggers || []).some((trigger) => trigger.enabled && ['email', 'rss', 'webpage', 'folder'].includes(trigger.kind))) return 'Watching';
  return '';
}

/** The first line of its last report or error. */
export function lastRunLine(run) {
  if (!run) return '';
  if (run.status === 'running') return 'Working…';
  if (run.status === 'waiting') return 'Waiting for your answer';
  if (run.status === 'skipped') return run.error || 'Skipped';
  return firstLine(run.status === 'succeeded' ? run.answer : run.error) || run.status;
}

/** The timeline grouped by run, newest first; events without a run stand alone. */
export function groupTimeline(events = []) {
  const groups = [];
  const byRun = new Map();
  for (const event of events) {
    const key = event.runId || `event:${event.id}`;
    if (!byRun.has(key)) {
      const group = { key, runId: event.runId || null, events: [] };
      byRun.set(key, group);
      groups.push(group);
    }
    byRun.get(key).events.push(event);
  }
  for (const group of groups) group.events.reverse();
  return groups;
}

/** "about 3 min ago", "2 h ago", "3 Oct". */
export function ago(iso, now = Date.now()) {
  const time = Date.parse(iso || '');
  if (!time) return '';
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(time).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Starting points for a new Cat. */
export const CAT_TEMPLATES = [
  {
    title: 'Every weekday at 8:00, sum up my unread email',
    name: 'Inbox Cat',
    mission: 'Read my unread email and sum it up: who it is from, what they want, and what needs a reply today. Put the most urgent first.',
    triggers: [{ kind: 'schedule', config: { schedule: { kind: 'weekdays', time: '08:00' } } }],
    freedom: 'ask_risky',
  },
  {
    title: 'Tell me when a page changes, like a price or a status',
    name: 'Watcher Cat',
    mission: 'Watch the page and tell me what changed and whether it matters. If a price dropped, say by how much.',
    triggers: [{ kind: 'webpage', config: { url: '', contains: '', everyMinutes: 60 } }],
    freedom: 'ask_risky',
  },
  {
    title: 'Each morning, pick the best posts from a feed',
    name: 'News Cat',
    mission: 'When the feed has new posts, pick the three most worth reading for me and say in one line each why.',
    triggers: [{ kind: 'rss', config: { url: '', everyMinutes: 30 } }],
    freedom: 'ask_risky',
  },
  {
    title: 'Keep a folder tidy',
    name: 'Tidy Cat',
    mission: 'When new files arrive in the folder, sort them into subfolders by type and tell me what you moved. Never delete anything.',
    triggers: [{ kind: 'folder', config: { path: '', everyMinutes: 1 } }],
    freedom: 'ask_first',
  },
];
