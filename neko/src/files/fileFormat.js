// How Files shows sizes, dates and an item's one-line summary, the filter
// chips and sort orders each place offers, and reading ?open= from a link.

// The places, in the order the column lists them (den's places.js says the same).
export const PLACES = [
  { id: 'made', label: 'Made by agents', hint: 'Pictures, documents, pages, data and notes your agents made.' },
  { id: 'uploads', label: 'Uploads', hint: 'Files you added to notes, chats, agents and projects.' },
  { id: 'models', label: 'Models', hint: 'Downloaded language, image and voice models.' },
  { id: 'training', label: 'Training', hint: 'Datasets, adapters and what training runs left behind.' },
  { id: 'exports', label: 'Exports', hint: 'Zips made by Export everything.' },
  { id: 'logs', label: 'Logs & caches', hint: 'Logs, temporary files and caches. Clearing them is safe.' },
  { id: 'system', label: 'System', hint: "Asyncat's own files. You can see where they are; change them from the page named on each row." },
];

/** Whether `id` names a place. */
export function isPlace(id) {
  return PLACES.some((place) => place.id === id);
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** "32 B", "4 KB", "1.2 MB", "310 MB", "4.9 GB", "185 GB"; "" when unknown. */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes))) return '';
  let value = Math.max(0, Number(bytes));
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  let decimals = 0;
  if (unit === 2) decimals = value < 10 ? 1 : 0;
  if (unit >= 3) decimals = value < 100 ? 1 : 0;
  const text = value.toFixed(decimals).replace(/\.0$/, '');
  return `${text} ${UNITS[unit]}`;
}

function validDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Oct" this year, "12 Oct 2025" before it; "" when unknown. */
export function shortDate(iso, { now = new Date(), locale } = {}) {
  const date = validDate(iso);
  if (!date) return '';
  const options = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString(locale, options);
}

/** "12 Oct 2026". */
export function longDate(iso, { locale } = {}) {
  const date = validDate(iso);
  return date ? date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** "Document · 4 KB · 12 Oct": the line under a name on narrow screens and in tiles. */
export function metaLine(item, { where = false, ...dateOptions } = {}) {
  return [item.kindLabel, where ? item.where : null, formatBytes(item.bytes), shortDate(item.modifiedAt, dateOptions)]
    .filter(Boolean)
    .join(' · ');
}

// The chips each place filters by: kinds, and flags such as "unused" (counts
// come from den, which counts flags beside kinds).
export const PLACE_FILTERS = {
  made: {
    all: 'Everything',
    kinds: [
      { value: 'picture', label: 'Pictures' },
      { value: 'document', label: 'Documents' },
      { value: 'page', label: 'Pages' },
      { value: 'data', label: 'Data' },
      { value: 'diagram', label: 'Diagrams' },
      { value: 'audio', label: 'Audio' },
      { value: 'code', label: 'Code' },
      { value: 'note', label: 'Notes' },
    ],
  },
  uploads: {
    all: 'All',
    kinds: [
      { value: 'note-file', label: 'Note attachments' },
      { value: 'chat-file', label: 'Chat attachments' },
      { value: 'knowledge', label: 'Knowledge' },
      { value: 'unused', label: 'Not used', flag: true },
    ],
  },
  models: {
    all: 'All',
    kinds: [
      { value: 'language', label: 'Language' },
      { value: 'image', label: 'Image' },
      { value: 'vision', label: 'Vision' },
      { value: 'voice', label: 'Voice' },
      { value: 'unfinished', label: 'Unfinished' },
    ],
  },
  training: {
    all: 'All',
    kinds: [
      { value: 'dataset', label: 'Datasets' },
      { value: 'adapter', label: 'Adapters' },
      { value: 'result', label: 'Results' },
    ],
  },
};

const FLAGS = new Set(Object.values(PLACE_FILTERS).flatMap((filters) => filters.kinds.filter((kind) => kind.flag).map((kind) => kind.value)));

/**
 * The chips for a place: "Everything" (all of it) first, then each kind or
 * flag that has something in it. None for a place without kinds, or an empty one.
 */
export function filterChips(place, counts = {}) {
  const filters = PLACE_FILTERS[place];
  if (!filters) return [];
  const all = Object.entries(counts || {}).reduce((sum, [key, count]) => (FLAGS.has(key) ? sum : sum + (Number(count) || 0)), 0);
  if (!all) return [];
  return [
    { value: '', label: filters.all, count: all },
    ...filters.kinds.filter((kind) => counts[kind.value] > 0).map((kind) => ({ value: kind.value, label: kind.label, count: counts[kind.value] })),
  ];
}

/** Whether `kind` is one of the place's filters ("" is everything). */
export function isPlaceKind(place, kind) {
  return !kind || Boolean(PLACE_FILTERS[place]?.kinds.some((entry) => entry.value === kind));
}

export const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'largest', label: 'Largest first' },
  { value: 'name', label: 'Name' },
];

/** Models and training runs are big: those places list the largest first. */
export function defaultSort(place) {
  return place === 'models' || place === 'training' ? 'largest' : 'newest';
}

// Logs & caches is grouped under headings instead of chips.
export const LOG_GROUPS = [
  { kind: 'log', label: 'Logs' },
  { kind: 'cache', label: 'Temporary files and caches' },
  { kind: 'undo', label: 'Undo points and copies' },
];

/** Logs & caches' items under their headings, in LOG_GROUPS order; empty groups left out. */
export function groupLogs(items = []) {
  const known = new Set(LOG_GROUPS.map((group) => group.kind));
  const groups = LOG_GROUPS.map((group) => ({ ...group, items: items.filter((entry) => entry.kind === group.kind) }));
  const rest = items.filter((entry) => !known.has(entry.kind));
  if (rest.length) groups.push({ kind: 'other', label: 'Other', items: rest });
  return groups.filter((group) => group.items.length);
}

/**
 * The item id a link's ?open= names. Models → Images links to a picture by
 * its file name; anything with a ":" is already an id.
 */
export function openId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.includes(':') ? text : `picture:${encodeURIComponent(text)}`;
}

const EXT = (name) => (String(name || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const TEXT = new Set(['txt', 'json', 'jsonl', 'mmd', 'mermaid', 'js', 'mjs', 'ts', 'py', 'css', 'jsx', 'tsx', 'sh', 'log', 'yaml', 'yml', 'xml', 'toml', 'ini', 'rst']);

/**
 * How the viewer shows an item: picture, audio, video, page (a sandboxed
 * frame), svg, table, markdown, text or log; null when it can't be shown.
 */
export function previewKind(item) {
  if (item.kind === 'picture') return 'picture';
  if (!item.can?.preview) return null;
  if (item.tail) return 'log';
  const ext = EXT(item.name || item.title);
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'picture';
  if (['mp3', 'wav', 'ogg'].includes(ext)) return 'audio';
  if (['mp4', 'webm'].includes(ext)) return 'video';
  if (ext === 'html' || ext === 'htm') return 'page';
  if (ext === 'svg') return 'svg';
  if (ext === 'csv' || ext === 'tsv') return 'table';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  return TEXT.has(ext) ? 'text' : null;
}

const RUNTIMES = {
  'stable-diffusion.cpp': 'On this computer',
  sd: 'On this computer',
  comfyui: 'ComfyUI',
  openai: 'OpenAI',
  gemini: 'Gemini',
  stability: 'Stability AI',
  fal: 'fal',
};

/** What made a picture, in words: "On this computer", "OpenAI" … */
export function runtimeLabel(runtime) {
  return RUNTIMES[String(runtime || '').toLowerCase()] || runtime || '';
}

/** A picture's details line: made by, model, size in pixels, seed, file size and date. */
export function pictureDetails(item, dateOptions = {}) {
  return [
    runtimeLabel(item.runtime),
    item.model,
    item.width && item.height ? `${item.width} × ${item.height}` : null,
    item.seed !== null && item.seed !== undefined && item.seed !== '' ? `Seed ${item.seed}` : null,
    formatBytes(item.bytes),
    longDate(item.modifiedAt, dateOptions),
  ].filter(Boolean);
}

/**
 * Sizes from den, steadied: while a place is counted again (after a
 * delete, say) its last full count stays up instead of a partial one that
 * starts from zero. appBytes is the places added up again.
 */
export function steadySizes(previous, next) {
  if (!next?.places) return next;
  const before = new Map((previous?.places || []).map((place) => [place.id, place]));
  const places = next.places.map((place) => {
    const last = before.get(place.id);
    const counting = place.partial || place.bytes === null || place.bytes === undefined;
    return counting && last && !last.partial && last.bytes !== null && last.bytes !== undefined
      ? { ...place, bytes: last.bytes, partial: false }
      : place;
  });
  return { ...next, places, appBytes: places.reduce((sum, place) => sum + (place.bytes || 0), 0) };
}
