// Words for a download's progress ("24 of 60 MB · 3 MB/s · 20 s left") and
// the speed worked out from successive progress polls.

const UNITS = [
  ['GB', 1e9],
  ['MB', 1e6],
  ['KB', 1e3],
];

function unitFor(bytes) {
  return UNITS.find(([, size]) => bytes >= size) || ['B', 1];
}

function amount(bytes, size) {
  const value = bytes / size;
  if (size === 1) return String(Math.round(value));
  return value >= 10 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
}

/** 1500000 → "1.5 MB". */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const [unit, size] = unitFor(bytes);
  return `${amount(bytes, size)} ${unit}`;
}

/** 20 → "20 s", 200 → "4 min", 4000 → "1 h 7 min". */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

/**
 * "24 of 60 MB · 3 MB/s · 20 s left". Both amounts use the total's unit; the
 * speed and time left appear only once the speed is known.
 */
export function transferDetail({ done, total, rate } = {}) {
  const parts = [];
  if (Number.isFinite(total) && total > 0) {
    const [unit, size] = unitFor(total);
    parts.push(`${amount(Math.min(done || 0, total), size)} of ${amount(total, size)} ${unit}`);
  } else if (Number.isFinite(done) && done > 0) {
    parts.push(formatBytes(done));
  }
  if (Number.isFinite(rate) && rate > 0) {
    parts.push(`${formatBytes(rate)}/s`);
    if (Number.isFinite(total) && total > (done || 0)) parts.push(`${formatDuration((total - (done || 0)) / rate)} left`);
  }
  return parts.join(' · ');
}

/**
 * Adds a progress sample ({ bytes, at } in ms) to the recent ones and works
 * out the speed over the last `window` ms. A drop in bytes (a restart) starts
 * over. Returns { samples, rate } with rate in bytes per second, or null
 * while there isn't a second of history yet.
 */
export function trackRate(samples, sample, window = 8000) {
  const last = samples[samples.length - 1];
  const kept = last && sample.bytes < last.bytes ? [] : samples.filter((old) => sample.at - old.at <= window);
  const next = [...kept, sample];
  const first = next[0];
  const span = (sample.at - first.at) / 1000;
  return { samples: next, rate: span >= 1 ? Math.max(0, (sample.bytes - first.bytes) / span) : null };
}
