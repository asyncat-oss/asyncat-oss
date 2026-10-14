// Plain words for voice and image setup: sizes, step states, how a model
// suits the graphics card, voices grouped by language, the engine row, and
// the rows of "Model files" built from what is on disk.

import { formatBytes, transferDetail } from '../../components/ui/progressFormat.js';

/** "about 140 MB" for a plan's download total. */
export function totalText(bytes, { estimated = false } = {}) {
  if (!bytes) return 'nothing to download';
  return `${estimated ? 'about ' : ''}${formatBytes(bytes)}`;
}

/** "190 MB", or "Size unknown" when the size isn't known. */
export function sizeText(bytes) {
  return Number(bytes) > 0 ? formatBytes(Number(bytes)) : 'Size unknown';
}

/** The size column of a plan step. */
export function stepSizeText(step) {
  if (step.done) return 'Already on this computer';
  if (step.error) return 'Size unknown';
  if (!step.bytes) return step.small ? 'tiny' : 'Size unknown';
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

/** "24 of 60 MB" while a step downloads, or its message. */
export function stepProgressText(step) {
  if (step.status !== 'running') return STEP_STATUS[step.status] || step.status;
  if (step.downloaded && step.total) return transferDetail({ done: step.downloaded, total: step.total });
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

/** How a model suits the graphics card. Only "too big" stands out. */
export const FIT = {
  fits: { label: 'Fits your graphics card', className: 'text-fg-subtle' },
  tight: { label: 'Fits, just: close other apps', className: 'text-fg-subtle' },
  too_big: { label: 'Too big for your graphics card', className: 'text-amber-700 dark:text-amber-400' },
  unknown: { label: "Can't tell how much your graphics card holds", className: 'text-fg-subtle' },
  cpu: { label: 'No graphics card found: works, but slowly', className: 'text-fg-subtle' },
};

/** "NVIDIA GeForce RTX 4050 Laptop GPU · 6 GB" */
export function gpuLine(gpu) {
  if (!gpu) return 'No graphics card found';
  return `${gpu.name || gpu.vendor}${gpu.vramGb ? ` · ${gpu.vramGb} GB` : ''}`;
}

/**
 * Catalog voices grouped by language, the user's language first: the exact
 * one (English (US) for en-US), then the others of that language.
 */
export function voicesByLanguage(voices = [], language = 'en') {
  const locale = String(language || 'en').toLowerCase();
  const lang = locale.slice(0, 2);
  const groups = new Map();
  for (const voice of voices) {
    if (!groups.has(voice.language)) groups.set(voice.language, []);
    groups.get(voice.language).push(voice);
  }
  const rank = (list) => {
    if (list.some((voice) => voice.locale.toLowerCase() === locale)) return 2;
    return list.some((voice) => voice.locale.slice(0, 2).toLowerCase() === lang) ? 1 : 0;
  };
  return [...groups.entries()]
    .map(([name, list]) => ({ name, list, rank: rank(list) }))
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
    .map(({ name, list, rank: mine }) => ({ language: name, voices: list, mine: mine > 0 }));
}

/** The browser's language, e.g. "en-GB". */
export function userLanguage() {
  try {
    return (typeof navigator !== 'undefined' && (navigator.language || navigator.languages?.[0])) || 'en';
  } catch {
    return 'en';
  }
}

// ── Files ────────────────────────────────────────────────────────────────────

export function baseName(filePath) {
  const text = String(filePath || '');
  return text.slice(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1);
}

/** The folder a file is in, with the home folder as "~": "/home/sam/models/a.bin" → "~/models". */
export function folderOf(filePath) {
  const text = String(filePath || '');
  const cut = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  const dir = cut > 0 ? text.slice(0, cut) : cut === 0 ? '/' : '';
  return dir
    .replace(/^\/home\/[^/]+(?=\/|$)/, '~')
    .replace(/^\/Users\/[^/]+(?=\/|$)/, '~')
    .replace(/^[A-Za-z]:\\Users\\[^\\]+(?=\\|$)/i, '~');
}

/** The catalog listening model a file is ({ model, english }), by its name. */
export function whisperCatalogEntry(catalog, filename) {
  const name = baseName(filename);
  for (const model of catalog?.whisper || []) {
    if (model.file === name) return { model, english: false };
    if (model.englishFile && model.englishFile === name) return { model, english: true };
  }
  return null;
}

/** "Base (English)" for a catalog entry. */
export function whisperTitle(entry) {
  return entry ? `${entry.model.title}${entry.english ? ' (English)' : ''}` : '';
}

/** The catalog voice a .onnx file is, by its name. */
export function voiceCatalogEntry(catalog, filename) {
  const id = baseName(filename).replace(/\.onnx(\.json)?$/i, '');
  return (catalog?.voices || []).find((voice) => voice.id === id) || null;
}

/** The catalog image model a file is, by its name. */
export function imageCatalogEntry(catalog, filename) {
  const name = baseName(filename);
  return (catalog?.models || []).find((model) => model.file === name) || null;
}

function joinMeta(parts) {
  return parts.filter((part) => part !== null && part !== undefined && part !== '').join(' · ');
}

function fileState({ missing, incomplete, inUse }) {
  if (missing) return { text: 'File not found', tone: 'error' };
  if (incomplete) return { text: 'Settings file missing', tone: 'warning' };
  if (inUse) return { text: 'In use', tone: 'accent' };
  return null;
}

// Catalog files first, in the catalog's order, then the rest by name.
function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const ac = a.catalogIndex ?? Infinity;
    const bc = b.catalogIndex ?? Infinity;
    if (ac !== bc) return ac - bc;
    return String(a.name).localeCompare(String(b.name));
  });
}

function fileRow({ prefix, type, file, name, kindText, extra = [], inUse, catalogIndex = null, catalogId = null, useLabel, canUse = true }) {
  const missing = Boolean(file.isMissing);
  const incomplete = Boolean(file.missingConfig);
  const external = Boolean(file.isExternal);
  return {
    domId: `${prefix}-${file.id}`,
    id: file.id,
    type,
    name,
    filename: file.filename || baseName(file.path),
    path: file.path || '',
    bytes: Number(file.sizeBytes) || null,
    meta: joinMeta([kindText, ...extra, missing ? null : sizeText(file.sizeBytes), external ? folderOf(file.path) : null]),
    external,
    missing,
    incomplete,
    inUse,
    state: fileState({ missing, incomplete, inUse }),
    catalogIndex,
    catalogId,
    useLabel: useLabel || null,
    canUse: Boolean(useLabel) && canUse && !missing && !incomplete,
    // A file in use stays until something else is chosen.
    canDelete: !inUse,
    deleteLabel: external ? 'Remove from list' : 'Delete file',
  };
}

const AUDIO_KIND = { whisper: 'Listening', tts: 'Speaking' };

/**
 * Model files on the Voice tab: listening files, then voices.
 * `library` is GET /audio/models ({ whisper, tts }); `status` is the voice
 * status (a file is in use when its path is the chosen model or voice);
 * `downloads` are this tab's downloads (see downloadsFor).
 *
 * Returns { downloads, groups: [{ id, label, rows }], count }.
 */
export function buildVoiceFiles(status, catalog, library, downloads = []) {
  const sttPath = status?.stt?.provider === 'local' ? status.stt.model?.path : null;
  const ttsPath = status?.tts?.provider === 'local' ? status.tts.voice?.path : null;
  const listening = (library?.whisper || []).map((file) => {
    const entry = whisperCatalogEntry(catalog, file.filename || file.path);
    return fileRow({
      prefix: 'voice-file-whisper',
      type: 'whisper',
      file,
      name: entry ? whisperTitle(entry) : file.filename || file.name,
      kindText: AUDIO_KIND.whisper,
      inUse: Boolean(sttPath && file.path === sttPath),
      catalogIndex: entry ? catalog.whisper.indexOf(entry.model) : null,
      catalogId: entry?.model.id || null,
      useLabel: 'Use for listening',
    });
  });
  const speaking = (library?.tts || []).map((file) => {
    const voice = voiceCatalogEntry(catalog, file.filename || file.path);
    const language = voice?.language || (file.languageName && file.languageName !== 'unknown' ? file.languageName : null);
    return fileRow({
      prefix: 'voice-file-tts',
      type: 'tts',
      file,
      name: voice ? voice.name : file.filename || file.name,
      kindText: AUDIO_KIND.tts,
      extra: [language],
      inUse: Boolean(ttsPath && file.path === ttsPath),
      catalogIndex: voice ? catalog.voices.indexOf(voice) : null,
      catalogId: voice?.id || null,
      useLabel: 'Use for speaking',
    });
  });
  const rows = [...sortRows(listening), ...sortRows(speaking)];
  return {
    downloads: downloadRows(downloads, (filename) => {
      const entry = whisperCatalogEntry(catalog, filename);
      if (entry) return { name: whisperTitle(entry), kindText: AUDIO_KIND.whisper };
      const voice = voiceCatalogEntry(catalog, filename);
      if (voice) return { name: voice.name, kindText: AUDIO_KIND.tts };
      return { name: filename, kindText: /\.onnx/i.test(filename) ? AUDIO_KIND.tts : AUDIO_KIND.whisper };
    }),
    groups: [{ id: 'voice', label: null, rows }],
    count: rows.length,
  };
}

/**
 * Model files on the Images tab, in two groups: image models (which can be
 * chosen) and other files (LoRAs, VAEs, ControlNets, settings files).
 * `library` is GET /visual/models; `comfy` is ComfyUI's status or null (a
 * file named like the chosen checkpoint is in use while ComfyUI draws).
 *
 * Returns { downloads, groups: [{ id, label, rows }], count }.
 */
export function buildImageFiles(status, catalog, library, comfy = null, downloads = []) {
  const modelPath = status?.provider === 'local' ? status.model?.path : null;
  const checkpoint = status?.provider === 'comfyui' ? baseName(comfy?.checkpoint || status?.checkpoint || '') : '';
  const models = [];
  const other = [];
  for (const file of library?.image || []) {
    const kind = file.assetKind || 'Image model';
    const filename = file.filename || baseName(file.path);
    const entry = imageCatalogEntry(catalog, filename);
    const isModel = kind === 'Image model';
    const row = fileRow({
      prefix: 'image-file',
      type: 'image',
      file,
      name: entry ? entry.title : filename,
      kindText: kind,
      inUse: Boolean((modelPath && file.path === modelPath) || (checkpoint && filename === checkpoint)),
      catalogIndex: entry ? catalog.models.indexOf(entry) : null,
      catalogId: entry?.id || null,
      useLabel: isModel ? 'Use for images' : null,
      canUse: isModel && file.drawable !== false,
    });
    (isModel ? models : other).push({ ...row, assetKind: kind });
  }
  const groups = [
    { id: 'models', label: 'Image models', rows: sortRows(models) },
    { id: 'other', label: 'Other files', rows: sortRows(other) },
  ];
  return {
    downloads: downloadRows(downloads, (filename) => {
      const entry = imageCatalogEntry(catalog, filename);
      return { name: entry ? entry.title : filename, kindText: 'Image' };
    }),
    groups,
    count: models.length + other.length,
  };
}

/** "5 files". */
export function filesCountText(count) {
  return `${count} ${count === 1 ? 'file' : 'files'}`;
}

// ── Downloads ────────────────────────────────────────────────────────────────

function cleanSubDir(subDir) {
  return String(subDir || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

/**
 * The downloads a tab shows, from GET /local-models/downloads: those into its
 * folder (`prefix` "audio/" or "image"), still going or just failed, without
 * the ones a running setup is already showing, and with a voice's tiny
 * settings file folded into the voice.
 */
export function downloadsFor(list = [], prefix = '', job = null) {
  const wanted = cleanSubDir(prefix);
  const key = (item) => `${cleanSubDir(item.subDir)}/${item.filename}`;
  const setupFiles = new Set(job?.status === 'running'
    ? (job.steps || []).filter((step) => step.filename).map(key)
    : []);
  const shown = (list || []).filter((item) => (
    cleanSubDir(item.subDir).startsWith(wanted)
    && (item.status === 'downloading' || item.status === 'error')
    && !setupFiles.has(key(item))
  ));
  const voices = new Set(shown.filter((item) => /\.onnx$/i.test(item.filename)).map(key));
  return shown.filter((item) => !(/\.onnx\.json$/i.test(item.filename) && voices.has(key(item).replace(/\.json$/i, ''))));
}

function downloadRows(downloads, describe) {
  return (downloads || []).map((item) => {
    const { name, kindText } = describe(item.filename);
    return {
      id: item.downloadId,
      name,
      kindText,
      filename: item.filename,
      bytes: Number(item.downloaded) || 0,
      total: Number(item.total) || 0,
      percent: Number(item.progress) || 0,
      status: item.status,
      error: item.status === 'error' ? item.error || "The download didn't finish." : null,
    };
  });
}

// ── Engines ──────────────────────────────────────────────────────────────────

export const ENGINE_NAMES = { whisper: 'whisper.cpp', piper: 'Piper', sd: 'stable-diffusion.cpp' };

const BUILDS = {
  cpu_safe: 'CPU build',
  nvidia: 'CUDA build',
  vulkan: 'Vulkan build',
  apple: 'Metal build',
  amd: 'ROCm build',
  intel: 'SYCL build',
};

/** "nvidia" → "CUDA build". */
export function buildWords(capability) {
  return BUILDS[capability] || null;
}

/** "v1.7.6" → "1.7.6". */
export function versionText(version) {
  return String(version || '').trim().replace(/^v(?=\d)/i, '');
}

/**
 * Which state an engine row is in: 'loading' (not listed yet),
 * 'installing', 'unsupported', 'managed' (Asyncat's copy), 'external'
 * (found elsewhere on this computer) or 'missing'.
 */
export function engineState(runtime, { enginePath = null, job = null } = {}) {
  if (job && (job.status === 'running' || job.status === 'queued')) return 'installing';
  if (!runtime) return 'loading';
  if (runtime.supported === false) return 'unsupported';
  if (runtime.managedInstalled) return 'managed';
  if (runtime.configuredPath || enginePath) return 'external';
  return 'missing';
}

/**
 * What the Engine row says: { state, value, meta: [], path }.
 *   Asyncat's copy: "whisper.cpp" · "1.7.6 · CUDA build · 48 MB · loaded"
 *   found outside:  "whisper.cpp" · "found on this computer", and its path
 */
export function engineSummary(runtimeId, runtime, { bytes = null, loaded = false, enginePath = null, job = null } = {}) {
  const name = ENGINE_NAMES[runtimeId] || runtime?.label || runtimeId;
  const state = engineState(runtime, { enginePath, job });
  if (state === 'unsupported') return { state, value: runtime.unsupportedReason || "Can't run on this computer", meta: [], path: null };
  if (state === 'missing') return { state, value: 'Not installed', meta: [], path: null };
  if (state === 'external') {
    return { state, value: name, meta: ['found on this computer', loaded ? 'loaded' : null].filter(Boolean), path: runtime.configuredPath || enginePath };
  }
  if (state === 'managed') {
    return {
      state,
      value: name,
      meta: [versionText(runtime.version) || null, buildWords(runtime.capability), Number(bytes) > 0 ? formatBytes(Number(bytes)) : null, loaded ? 'loaded' : null].filter(Boolean),
      path: runtime.managedPath || null,
    };
  }
  return { state, value: name, meta: [], path: null };
}

const KEEPS_WORKING = {
  whisper: 'Listening keeps working while it downloads.',
  piper: 'Speaking keeps working while it downloads.',
  sd: 'Images keep working while it downloads.',
};

/**
 * The words of an engine's install plan (GET /runtimes/:id/plan):
 *   line:   "Download 24 MB · version 1.7.7 · CUDA build"
 *   detail: "whisper-bin-x64.zip · MIT. Listening keeps working while it downloads."
 *   newest: true when that version is the one already installed.
 */
export function enginePlanText(runtimeId, plan, { installedVersion = null } = {}) {
  const version = versionText(plan?.version);
  const size = plan?.downloadBytes ? totalText(plan.downloadBytes, { estimated: plan.estimated }) : 'size unknown';
  const line = joinMeta([`Download ${size}`, version ? `version ${version}` : null, buildWords(plan?.capability)]);
  const source = joinMeta([plan?.assetName, plan?.license]);
  const detail = `${source ? `${source}. ` : ''}${KEEPS_WORKING[runtimeId] || ''}`.trim();
  return { line, detail, newest: Boolean(version && installedVersion && version === versionText(installedVersion)) };
}

/** "Installing · 4 of 12 MB" while an engine installs. */
export function installText(job) {
  const progress = job?.progress || {};
  const bytes = transferDetail({ done: Number(progress.downloadedBytes) || 0, total: Number(progress.totalBytes) || 0 });
  return joinMeta(['Installing', bytes || null]);
}
