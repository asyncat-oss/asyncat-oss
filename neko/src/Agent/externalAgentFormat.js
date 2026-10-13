// Small formatting helpers for Claude Code / Codex sessions and usage limits.

export const ENGINE_NAMES = { 'claude-code': 'Claude Code', codex: 'Codex' };

/** "4:30 PM" today, "Tue 4:30 PM" this week, otherwise "12 Nov". */
export function formatResetTime(ms, now = Date.now()) {
  if (!ms) return '';
  const date = new Date(ms);
  const diff = ms - now;
  if (diff < 24 * 60 * 60 * 1000) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff < 6 * 24 * 60 * 60 * 1000) return date.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** "5-hour limit: 12% used, resets 4:30 PM" for each known window. */
export function usageLines(usage) {
  if (!usage?.windows?.length) return [];
  return usage.windows.map((window) => {
    const used = window.usedPercent == null ? 'in use' : `${Math.round(window.usedPercent)}% used`;
    const reset = window.resetsAt ? `, resets ${formatResetTime(window.resetsAt)}` : '';
    return { ...window, text: `${window.label} limit: ${used}${reset}` };
  });
}

/** The most used window, for a one-line hint. */
export function usageHint(usage) {
  const lines = usageLines(usage);
  if (!lines.length) return '';
  const top = [...lines].sort((a, b) => (b.usedPercent ?? 0) - (a.usedPercent ?? 0))[0];
  return top.text;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", or a date. */
export function relativeTime(iso, now = Date.now()) {
  const time = Date.parse(iso);
  if (!time) return '';
  const minutes = Math.round((now - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(time).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/**
 * The terminal command that continues a Claude Code or Codex session.
 * Claude Code only finds a session from the folder it ran in, so cd there first.
 */
export function resumeCommand(engine, sessionId, folder, platform = typeof navigator !== 'undefined' ? navigator.platform : '') {
  const windows = /^win/i.test(platform || '');
  const quote = (value) => (windows ? `"${value}"` : `'${String(value).replace(/'/g, "'\\''")}'`);
  const run = engine === 'claude-code' ? `claude --resume ${sessionId}` : `codex resume ${sessionId}`;
  return folder ? `cd ${windows ? '/d ' : ''}${quote(folder)} && ${run}` : run;
}

/** The last folder name of a path, for compact labels. */
export function folderName(dir) {
  if (!dir) return '';
  const parts = String(dir).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || dir;
}
