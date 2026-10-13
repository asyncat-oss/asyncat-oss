// Plain words for voice and image setup: sizes, step states, how a model
// suits the graphics card, voices grouped by language.

import { formatBytes } from '../engineProgress.js';

/** "about 140 MB" for a plan's download total. */
export function totalText(bytes, { estimated = false } = {}) {
  if (!bytes) return 'nothing to download';
  return `${estimated ? 'about ' : ''}${formatBytes(bytes)}`;
}

/** The size column of a plan step. */
export function stepSizeText(step) {
  if (step.done) return 'Already on this computer';
  if (step.error) return "Size unknown";
  if (!step.bytes) return step.small ? 'tiny' : 'size unknown';
  return `${step.estimated ? 'about ' : ''}${formatBytes(step.bytes)}`;
}

export const STEP_STATUS = {
  waiting: 'Waiting',
  running: 'Working…',
  done: 'Done',
  skipped: 'Already here',
  error: 'Failed',
  cancelled: 'Cancelled',
};

/** "12.4 MB of 59.7 MB" while a step downloads, or its message. */
export function stepProgressText(step) {
  if (step.status !== 'running') return STEP_STATUS[step.status] || step.status;
  if (step.downloaded && step.total) return `${formatBytes(step.downloaded)} of ${formatBytes(step.total)}`;
  if (step.downloaded) return `${formatBytes(step.downloaded)} downloaded`;
  return step.detail || 'Working…';
}

/** Overall percent of a setup job, weighting downloads by size. */
export function jobPercent(job) {
  const steps = job?.steps || [];
  if (!steps.length) return 0;
  const weights = steps.map((step) => Math.max(1, Number(step.total || step.bytes) || 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const done = steps.reduce((acc, step, index) => {
    const share = ['done', 'skipped'].includes(step.status) ? 1 : step.status === 'running' ? (Number(step.progress) || 0) / 100 : 0;
    return acc + share * weights[index];
  }, 0);
  return Math.min(100, Math.round((done / sum) * 100));
}

export const FIT = {
  fits: { label: 'Fits your graphics card', tone: 'green' },
  tight: { label: 'Fits, just: close other apps', tone: 'amber' },
  too_big: { label: 'Too big for your graphics card', tone: 'red' },
  unknown: { label: "Can't tell how much your graphics card holds", tone: 'muted' },
  cpu: { label: 'No graphics card found: works, but slowly', tone: 'amber' },
};

/** "NVIDIA GeForce RTX 4050 Laptop GPU · 6 GB" */
export function gpuLine(gpu) {
  if (!gpu) return 'No graphics card found';
  return `${gpu.name || gpu.vendor}${gpu.vramGb ? ` · ${gpu.vramGb} GB` : ''}`;
}

/** Catalog voices grouped by language, the user's language first. */
export function voicesByLanguage(voices = [], language = 'en') {
  const lang = String(language || 'en').slice(0, 2).toLowerCase();
  const groups = new Map();
  for (const voice of voices) {
    if (!groups.has(voice.language)) groups.set(voice.language, []);
    groups.get(voice.language).push(voice);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({ language: name, voices: list, mine: list.some((voice) => voice.locale.slice(0, 2).toLowerCase() === lang) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.language.localeCompare(b.language));
}

/** The browser's language, e.g. "en-GB". */
export function userLanguage() {
  try {
    return (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) || 'en';
  } catch {
    return 'en';
  }
}
