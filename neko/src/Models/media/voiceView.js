// What Models → Voice shows for the voice status, the setup job and the
// changes not saved yet: whether this is the first run, the status lines
// above the groups, which setup step each row shows, what the first-run
// download sets up, and the names and sizes the rows read.

import { initialVoiceChoice, initialWhisperChoice } from './choosers/choices.js';
import { ENGINE_NAMES, baseName, jobPercent, voiceCatalogEntry, whisperCatalogEntry, whisperTitle } from './mediaFormat.js';
import { providerLabel, serviceTitle } from './providers.js';

export const GROUP_TITLES = { stt: 'Listening', tts: 'Speaking' };

const HINTS = {
  stt: 'Turns what you say into text.',
  tts: 'Reads answers aloud.',
};

const OFF_HINTS = {
  stt: 'The mic button is hidden in chats.',
  tts: "Answers aren't read aloud.",
};

/** A group's one-line hint: what it does, or what being off means. */
export function groupHint(kind, provider) {
  return provider === 'off' ? OFF_HINTS[kind] : HINTS[kind];
}

const isService = (provider) => Boolean(provider) && !['local', 'off'].includes(provider);

/**
 * The first run: nothing works yet, no setup is running, and each part is
 * set to run on this computer or turned off (not both off). A change that
 * isn't saved yet (a service waiting for its key) doesn't end it.
 */
export function isFirstRun(status, job = null) {
  const parts = [status?.stt, status?.tts];
  if (parts.some((part) => !part)) return false;
  if (job?.status === 'running') return false;
  if (parts.some((part) => part.ready)) return false;
  if (!parts.every((part) => part.provider === 'local' || part.provider === 'off')) return false;
  return parts.some((part) => part.provider === 'local');
}

/** What a part needs before it works: "Listening needs a model.", or null. */
export function partProblem(kind, part) {
  if (!part || part.ready || part.provider === 'off') return null;
  const name = GROUP_TITLES[kind];
  if (part.reason === 'needs_key') return `${name} needs your ${part.title || serviceTitle(part.provider)} key.`;
  if (part.provider === 'local') {
    const noEngine = part.engine === false || part.reason === 'needs_engine';
    const noFile = kind === 'stt' ? !part.model : !part.voice;
    const file = kind === 'stt' ? 'a model' : 'a voice';
    if (noEngine && noFile) return `${name} needs its engine and ${file}.`;
    if (noEngine) return `${name} needs its engine.`;
    if (noFile) return `${name} needs ${file}.`;
  }
  return `${name} isn't ready.`;
}

/** "Setting up voice · 41%" */
export function setupLineText(job) {
  return `Setting up voice · ${jobPercent(job)}%`;
}

/** "Voice is set up", or the one part a setup was for: "Speaking is set up". */
export function setUpText(job) {
  if (job?.options?.listen === false) return 'Speaking is set up';
  if (job?.options?.speak === false) return 'Listening is set up';
  return 'Voice is set up';
}

/**
 * Which finished setup the page still reports: the one followed on this
 * page (started here, or seen running), unless it was put away; or, on
 * opening the page, the last one if it failed and voice still isn't set up.
 */
export function setupOutcome(job, { followedId = null, quietId = null, status = null } = {}) {
  if (!job || job.status === 'running' || job.id === quietId) return null;
  if (job.id === followedId) return job.status;
  if (job.status === 'error' && status && !status.setUp) return 'error';
  return null;
}

/**
 * The lines over the groups, most important first: { key, tone, text,
 * percent?, action? }. `action` names what its button does: 'reload',
 * 'cancel', 'retry' (the same setup again), 'setup' or 'plan' (check the
 * sizes again). On the first run a failed or cancelled setup has no button
 * of its own: the download button under the groups starts it again.
 */
export function voiceStatusLines({ status = null, loadError = null, job = null, outcome = null, firstRun = false, planError = null, drafts = {} } = {}) {
  if (!status) return loadError ? [{ key: 'load', tone: 'error', text: "Couldn't load voice settings.", action: 'reload' }] : [];
  const lines = [];
  if (job?.status === 'running') {
    const percent = jobPercent(job);
    lines.push({ key: 'setup', tone: 'progress', text: setupLineText(job), percent, action: 'cancel' });
  } else if (outcome === 'complete') {
    lines.push({ key: 'setup', tone: 'ok', text: setUpText(job) });
  } else if (outcome === 'error') {
    lines.push({ key: 'setup', tone: 'error', text: "Setup didn't finish.", action: firstRun ? undefined : 'retry' });
  } else if (outcome === 'cancelled') {
    lines.push({ key: 'setup', tone: 'off', text: 'Setup cancelled.', action: firstRun ? undefined : 'setup' });
  }
  if (loadError) lines.push({ key: 'load', tone: 'error', text: "Couldn't load voice settings.", action: 'reload' });
  if (firstRun && planError) lines.push({ key: 'plan', tone: 'error', text: "Couldn't check download sizes.", action: 'plan' });
  if (status.stt?.provider === 'off' && status.tts?.provider === 'off') {
    lines.push({ key: 'off', tone: 'off', text: 'Voice is off.' });
  } else if (!firstRun && job?.status !== 'running' && outcome !== 'error' && outcome !== 'cancelled') {
    // What each part still needs. A setup that stopped has said so already.
    for (const kind of ['stt', 'tts']) {
      // A group being changed says what it needs in its own rows.
      if (drafts[kind]) continue;
      const text = partProblem(kind, status[kind]);
      if (text) lines.push({ key: kind, tone: 'warning', text });
    }
  }
  return lines;
}

// ── Setup steps on the rows ─────────────────────────────────────────────────

const ROW_STEPS = {
  sttEngine: ['whisper-engine'],
  sttModel: ['whisper-model'],
  ttsEngine: ['piper-engine'],
  // A voice and its small settings file read as one row.
  ttsVoice: ['voice', 'voice-config'],
};

const FINISHED = new Set(['done', 'skipped']);

/**
 * Several steps as one row's step. Plan steps (no status yet) add up what
 * is left to download; job steps add up their progress.
 */
export function mergeSteps(steps = []) {
  const list = steps.filter(Boolean);
  if (list.length <= 1) return list[0] || null;
  if (!list.some((step) => step.status)) {
    const left = list.filter((step) => !step.done);
    return {
      key: list[0].key,
      done: left.length === 0,
      bytes: left.reduce((sum, step) => sum + (Number(step.bytes) || 0), 0) || null,
      estimated: left.some((step) => step.estimated || (!step.bytes && !step.small)),
      small: left.length > 0 && left.every((step) => step.small),
      error: list.find((step) => step.error)?.error || null,
    };
  }
  const statuses = list.map((step) => step.status);
  let status;
  if (statuses.includes('error')) status = 'error';
  else if (statuses.includes('running')) status = 'running';
  else if (statuses.includes('cancelled')) status = 'cancelled';
  else if (statuses.every((value) => FINISHED.has(value))) status = statuses.includes('done') ? 'done' : 'skipped';
  // One finished and the next not started yet: still going.
  else if (statuses.some((value) => FINISHED.has(value))) status = 'running';
  else status = 'waiting';
  const counted = list.filter((step) => step.status !== 'skipped');
  const total = counted.reduce((sum, step) => sum + (Number(step.total || step.bytes) || 0), 0);
  const downloaded = counted.reduce((sum, step) => sum + (step.status === 'done' ? Number(step.total || step.bytes) || 0 : Number(step.downloaded) || 0), 0);
  return {
    key: list[0].key,
    status,
    total: total || null,
    downloaded: downloaded || null,
    progress: total ? Math.min(100, Math.round((downloaded / total) * 100)) : 0,
    detail: list.find((step) => step.status === 'running')?.detail || null,
    error: list.find((step) => step.error)?.error || null,
  };
}

/** The steps of a plan or job by the row that shows them: { sttEngine, sttModel, ttsEngine, ttsVoice }. */
export function rowSteps(steps = []) {
  const byKey = new Map((steps || []).map((step) => [step.key, step]));
  return Object.fromEntries(Object.entries(ROW_STEPS).map(([row, keys]) => [row, mergeSteps(keys.map((key) => byKey.get(key)))]));
}

/** The row a failed setup failed on and that step ({ row, step }), or null. */
export function failedRow(job) {
  if (job?.status !== 'error') return null;
  const rows = rowSteps(job.steps);
  const row = Object.keys(rows).find((name) => rows[name]?.status === 'error');
  return row ? { row, step: rows[row] } : null;
}

// ── First run ────────────────────────────────────────────────────────────────

/**
 * The listening model and voice the first run starts with: what the user
 * picked, else what is in use or suits this computer.
 *   { stt: { value: 'catalog:base', english: true }, tts: { value: 'catalog:en_US-lessac-medium' } }
 */
export function firstRunPicks({ status, catalog, picks = {}, language = 'en' }) {
  return {
    stt: picks.stt || initialWhisperChoice(catalog, status, language),
    tts: picks.tts || { value: initialVoiceChoice(catalog, status, language) },
  };
}

const catalogId = (value) => (String(value || '').startsWith('catalog:') ? String(value).slice('catalog:'.length) : null);

/**
 * What "Download … and set up" sets up: { listen, speak, whisper, english,
 * voice, language }, or null when there's nothing. A group that is off,
 * waiting for a service's key, or already using a file of its own (its
 * engine then installs from the Engine row) is left out.
 */
export function firstRunOptions({ status, catalog, picks = {}, drafts = {}, language = 'en' }) {
  if (!status?.stt || !status?.tts) return null;
  const chosen = firstRunPicks({ status, catalog, picks, language });
  const whisper = catalogId(chosen.stt?.value);
  const voice = catalogId(chosen.tts?.value);
  const listen = status.stt.provider === 'local' && !drafts.stt && Boolean(whisper);
  const speak = status.tts.provider === 'local' && !drafts.tts && Boolean(voice);
  if (!listen && !speak) return null;
  return {
    listen,
    speak,
    whisper: listen ? whisper : undefined,
    english: listen ? Boolean(chosen.stt.english) : undefined,
    voice: speak ? voice : undefined,
    language,
  };
}

const PLAN_STEPS = { stt: ['whisper-engine', 'whisper-model'], tts: ['piper-engine', 'voice', 'voice-config'] };
const PART_FLAGS = { stt: 'listen', tts: 'speak' };
const PART_ENGINES = { stt: 'whisper', tts: 'piper' };

/**
 * What the first run's download button does once the plan is in. A part
 * with a step that can't be downloaded (an engine with no build for this
 * computer, or one that couldn't be checked) is left out, so it can't stop
 * the other part:
 *   { options, totalBytes, estimated, part: 'speaking' | null, leftOut: [{ kind, unavailable }] }
 * `part` names the one part set up when the other was left out; `options`
 * is null when nothing is left to set up.
 */
export function firstRunAction(options, plan) {
  if (!options) return null;
  if (!plan?.steps) return { options, totalBytes: null, estimated: false, part: null, leftOut: [] };
  const byKey = new Map(plan.steps.map((step) => [step.key, step]));
  const stepsOf = (kind) => PLAN_STEPS[kind].map((key) => byKey.get(key)).filter(Boolean);
  const leftOut = [];
  for (const kind of ['stt', 'tts']) {
    if (!options[PART_FLAGS[kind]]) continue;
    const failing = stepsOf(kind).find((step) => step.error && !step.done);
    if (failing) leftOut.push({ kind, unavailable: Boolean(failing.unavailable) });
  }
  if (!leftOut.length) return { options, totalBytes: plan.totalBytes, estimated: Boolean(plan.estimated), part: null, leftOut };
  const kept = ['stt', 'tts'].filter((kind) => options[PART_FLAGS[kind]] && !leftOut.some((item) => item.kind === kind));
  if (!kept.length) return { options: null, totalBytes: null, estimated: false, part: null, leftOut };
  const listen = kept.includes('stt');
  const speak = kept.includes('tts');
  const left = kept.flatMap(stepsOf).filter((step) => !step.done);
  return {
    options: {
      ...options,
      listen,
      speak,
      whisper: listen ? options.whisper : undefined,
      english: listen ? options.english : undefined,
      voice: speak ? options.voice : undefined,
    },
    totalBytes: left.reduce((sum, step) => sum + (Number(step.bytes) || 0), 0),
    estimated: left.some((step) => step.estimated || !step.bytes),
    part: GROUP_TITLES[kept[0]].toLowerCase(),
    leftOut,
  };
}

/**
 * Why a part isn't in the first-run download. `alone` when nothing else
 * downloads either.
 *   "Listening isn't included: it needs whisper.cpp installed on this computer first."
 */
export function leftOutText({ kind, unavailable }, { alone = false } = {}) {
  const name = GROUP_TITLES[kind];
  const engine = ENGINE_NAMES[PART_ENGINES[kind]];
  if (unavailable) {
    return alone
      ? `${name} needs ${engine} installed on this computer first.`
      : `${name} isn't included: it needs ${engine} installed on this computer first.`;
  }
  return alone ? `${name} can be set up once its engine can be checked.` : `${name} isn't included until its engine can be checked.`;
}

/** A listening pick as its row shows it: { name, recommended, bytes, path }. */
export function pickedWhisper(catalog, library, pick) {
  const id = catalogId(pick?.value);
  if (id) {
    const model = (catalog?.whisper || []).find((item) => item.id === id);
    if (!model) return { name: id, recommended: false, bytes: null, path: null };
    const english = Boolean(pick.english && model.englishFile);
    const file = english ? model.englishFile : model.file;
    const found = (library?.whisper || []).find((item) => (item.filename || baseName(item.path)) === file && !item.isMissing);
    return { name: whisperTitle({ model, english }), recommended: Boolean(model.recommended), bytes: model.bytes || null, path: found?.path || null };
  }
  const path = String(pick?.value || '').replace(/^file:/, '');
  const file = (library?.whisper || []).find((item) => item.path === path);
  return { name: file?.filename || baseName(path), recommended: false, bytes: Number(file?.sizeBytes) || null, path: path || null };
}

/** A voice pick as its row shows it: { id, name, language, recommended, bytes, path }. */
export function pickedVoice(catalog, library, pick) {
  const id = catalogId(pick?.value);
  if (id) {
    const voice = (catalog?.voices || []).find((item) => item.id === id);
    const found = (library?.tts || []).find((item) => (item.filename || baseName(item.path)) === `${id}.onnx` && !item.isMissing && !item.missingConfig);
    return {
      id,
      name: voice?.name || id,
      language: voice?.language || null,
      recommended: Boolean(voice?.recommended),
      bytes: voice?.bytes || null,
      path: found?.path || null,
    };
  }
  const path = String(pick?.value || '').replace(/^file:/, '');
  const file = (library?.tts || []).find((item) => item.path === path);
  return { id: null, name: baseName(path).replace(/\.onnx$/i, ''), language: null, recommended: false, bytes: Number(file?.sizeBytes) || null, path: path || null };
}

// ── What is in use ───────────────────────────────────────────────────────────

const sizeOf = (files, filePath) => Number((files || []).find((item) => item.path === filePath)?.sizeBytes) || null;

/** The listening model in use on this computer: { name, bytes, path }, or null. */
export function listeningInUse(status, catalog, library) {
  const model = status?.stt?.provider === 'local' ? status.stt.model : null;
  if (!model?.path) return null;
  const entry = whisperCatalogEntry(catalog, model.path);
  return { name: entry ? whisperTitle(entry) : model.name || baseName(model.path), bytes: sizeOf(library?.whisper, model.path), path: model.path };
}

/** The voice in use on this computer: { id, name, language, bytes, path }, or null. */
export function voiceInUse(status, catalog, library) {
  const voice = status?.tts?.provider === 'local' ? status.tts.voice : null;
  if (!voice?.path) return null;
  const entry = voiceCatalogEntry(catalog, voice.path);
  return {
    id: entry?.id || null,
    name: entry ? entry.name : baseName(voice.path).replace(/\.onnx$/i, ''),
    language: entry?.language || null,
    bytes: sizeOf(library?.tts, voice.path),
    path: voice.path,
  };
}

/** The names a running setup's rows show, from what it was started with: { model, voice }. */
export function setupNames(catalog, options = {}) {
  const model = (catalog?.whisper || []).find((item) => item.id === options?.whisper);
  const voice = (catalog?.voices || []).find((item) => item.id === options?.voice);
  return {
    model: model ? whisperTitle({ model, english: Boolean(options.english && model.englishFile) }) : null,
    voice: voice ? voice.name : null,
    language: voice?.language || null,
  };
}

// ── Changing where a part runs ───────────────────────────────────────────────

/**
 * What choosing `value` in a group's Runs on does:
 *   { type: 'clear' }                          the saved choice again: drop the draft
 *   { type: 'draft', draft: { provider, … } }  a service with no key yet: wait for it
 *   { type: 'choose', choice }                 anything else happens at once
 */
export function runsOnChange(kind, value, { saved = null, cloud = {} } = {}) {
  if (value === saved) return { type: 'clear' };
  const service = isService(value) ? cloud?.[value] : null;
  if (service && !service.hasKey) {
    const draft = kind === 'stt'
      ? { provider: value, model: service.stt?.defaultModel || null }
      : { provider: value, voice: service.tts?.defaultVoice || null };
    return { type: 'draft', draft };
  }
  return { type: 'choose', choice: { [kind]: { provider: value } } };
}

/** The toast after a switch: "Listening now uses OpenAI", "Speaking is off". */
export function switchedText(kind, provider, cloud = {}) {
  const name = GROUP_TITLES[kind];
  if (provider === 'off') return `${name} is off`;
  if (provider === 'local') return `${name} now runs on this computer`;
  return `${name} now uses ${providerLabel(provider, cloud)}`;
}

/** The choice a draft becomes once its key is saved. */
export function draftChoice(kind, draft) {
  if (!draft) return null;
  return kind === 'stt'
    ? { stt: { provider: draft.provider, ...(draft.model ? { model: draft.model } : {}) } }
    : { tts: { provider: draft.provider, ...(draft.voice ? { voice: draft.voice } : {}) } };
}

/** Why a download button can't be pressed now, or null. */
export function downloadBlockedReason({ offline = false, running = false } = {}) {
  if (offline) return "You're offline";
  if (running) return 'One download at a time.';
  return null;
}
