// How Tools & Skills → Memory words a memory: its tags, how important it is,
// where it came from, its dates, and the counts line above the list.

import { MEMORY_KINDS, memoryKindLabel } from './memoryKinds.js';

/** A memory's tags as a list, whether den sent an array or a "[a, b]" string. */
export function memoryTags(mem) {
  if (Array.isArray(mem?.tags)) return mem.tags;
  if (typeof mem?.tags !== 'string') return [];
  return mem.tags.replaceAll('[', '').replaceAll(']', '').split(',').map((tag) => tag.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

/** Importance from 0 to 1 as 0–5 dots (0.5 when unset). */
export function importanceDots(mem) {
  const value = Number(mem?.importance ?? 0.5);
  return Math.max(0, Math.min(5, Math.round((Number.isFinite(value) ? value : 0.5) * 5)));
}

/** SQLite's datetime('now') is UTC without a zone; read it as UTC. */
export function sqliteDate(value) {
  const text = String(value || '');
  return new Date(/Z$|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
}

/** Where a memory came from, in words: null when the agent saved it in a chat. */
export function memorySource(source) {
  if (!source || source === 'agent') return null;
  if (source === 'user') return 'Written by you';
  if (source === 'correction') return 'From a correction you made';
  return 'Picked up from a chat';
}

/**
 * The line above the list: "4 memories · room for 750 · Fact 2 · Preference 1",
 * kinds by count. With a search or filter on, it starts with how many show.
 */
export function memorySummary(stats, { shown = 0, filtered = false } = {}) {
  const parts = [];
  if (filtered) parts.push(`${shown} shown`);
  if (stats) {
    parts.push(`${stats.total} ${stats.total === 1 ? 'memory' : 'memories'} · room for ${stats.cap}`);
    const kinds = Object.entries(stats.byType || {})
      .filter(([, count]) => count > 0)
      .sort(([a, x], [b, y]) => y - x || MEMORY_KINDS.indexOf(a) - MEMORY_KINDS.indexOf(b));
    for (const [kind, count] of kinds) parts.push(`${memoryKindLabel(kind)} ${count}`);
  } else if (!filtered) {
    parts.push(`${shown} ${shown === 1 ? 'memory' : 'memories'}`);
  }
  return parts.join(' · ');
}
