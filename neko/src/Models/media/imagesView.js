// What Models → Images shows for the image status, the setup job and a
// change not saved yet: whether this is the first run, the status lines
// above the group, which setup step each row shows, the model picked or in
// use, what a switch of "Runs on" does, and what ComfyUI's rows say.

import { initialImageChoice } from './choosers/choices.js';
import { baseName, imageCatalogEntry, jobPercent } from './mediaFormat.js';
import { providerLabel, serviceTitle } from './providers.js';

export const IMAGES_TITLE = 'How images are made';
export const COMFYUI_ADDRESS = 'http://127.0.0.1:8188';

const isService = (provider) => Boolean(provider) && !['local', 'comfyui'].includes(provider);
const catalogId = (value) => (String(value || '').startsWith('catalog:') ? String(value).slice('catalog:'.length) : null);
const fileName = (file) => file.filename || baseName(file.path);

/** The group's one-line hint: where images are made, or who bills for them. */
export function imagesHint(provider, cloud = {}) {
  if (isService(provider)) {
    const service = cloud?.[provider];
    const billed = `Each image is billed to your ${service?.title || serviceTitle(provider)} account.`;
    return service?.edits === false ? `${billed} It makes new images but can't change them.` : billed;
  }
  if (provider === 'comfyui') return 'By a ComfyUI you run yourself.';
  return 'On your graphics card, or by a service you have a key for.';
}

/**
 * The first run: images are to be made on this computer, nothing makes
 * them yet, no model is chosen or found, and no setup is running. A model
 * already here (with its engine missing) is past it: the engine installs
 * from its row.
 */
export function isImagesFirstRun(status, job = null) {
  if (!status || job?.status === 'running') return false;
  return status.provider === 'local' && !status.ready && !status.model;
}

/** What images still need before they work: "Images need their engine.", or null. */
export function imagesProblem(status) {
  if (!status || status.ready) return null;
  if (status.reason === 'needs_key') return `Images need your ${status.title || serviceTitle(status.provider)} key.`;
  if (status.provider === 'comfyui') return "ComfyUI isn't running.";
  if (status.provider === 'local') {
    const noEngine = status.engine === false || status.reason === 'needs_engine';
    const noModel = !status.model;
    if (noEngine && noModel) return 'Images need their engine and a model.';
    if (noEngine) return 'Images need their engine.';
    if (noModel) return 'Images need a model.';
  }
  return "Images aren't ready.";
}

/**
 * Which finished setup the page still reports: the one followed here
 * (started here, or seen running), unless it was put away; or, on opening
 * the page, the last one if it failed and images still don't work.
 */
export function imagesSetupOutcome(job, { followedId = null, quietId = null, status = null } = {}) {
  if (!job || job.status === 'running' || job.id === quietId) return null;
  if (job.id === followedId) return job.status;
  if (job.status === 'error' && status && !status.ready) return 'error';
  return null;
}

/**
 * The lines over the group, most important first: { key, tone, text,
 * percent?, action? }, as voiceStatusLines. A change not saved yet (`draft`)
 * says what it needs in its own rows.
 */
export function imagesStatusLines({ status = null, loadError = null, job = null, outcome = null, firstRun = false, planError = null, draft = null } = {}) {
  const loadLine = { key: 'load', tone: 'error', text: "Couldn't load image settings.", action: 'reload' };
  if (!status) return loadError ? [loadLine] : [];
  const lines = [];
  const running = job?.status === 'running';
  if (running) {
    const percent = jobPercent(job);
    lines.push({ key: 'setup', tone: 'progress', text: `Setting up images · ${percent}%`, percent, action: 'cancel' });
  } else if (outcome === 'complete') {
    lines.push({ key: 'setup', tone: 'ok', text: 'Images are set up' });
  } else if (outcome === 'error') {
    lines.push({ key: 'setup', tone: 'error', text: "Setup didn't finish.", action: firstRun ? undefined : 'retry' });
  } else if (outcome === 'cancelled') {
    lines.push({ key: 'setup', tone: 'off', text: 'Setup cancelled.', action: firstRun ? undefined : 'setup' });
  }
  if (loadError) lines.push(loadLine);
  if (firstRun && planError) lines.push({ key: 'plan', tone: 'error', text: "Couldn't check download sizes.", action: 'plan' });
  if (!firstRun && !running && !draft && outcome !== 'error' && outcome !== 'cancelled') {
    const text = imagesProblem(status);
    if (text) lines.push({ key: 'problem', tone: 'warning', text });
  }
  return lines;
}

// ── Setup steps on the rows ─────────────────────────────────────────────────

/**
 * The steps of a plan or job by the row that shows them: { engine, model }.
 * A step that found its engine or file already here leaves its row as it is.
 */
export function imageRowSteps(steps = []) {
  const byKey = new Map((steps || []).map((step) => [step.key, step]));
  const shown = (step) => (step && step.status !== 'skipped' ? step : null);
  return { engine: shown(byKey.get('sd-engine')), model: shown(byKey.get('image-model')) };
}

/** The row a failed setup failed on ('engine' or 'model') and that step, or null. */
export function failedImageRow(job) {
  if (job?.status !== 'error') return null;
  const step = (job.steps || []).find((item) => item.status === 'error');
  if (!step) return null;
  return { row: step.key === 'sd-engine' ? 'engine' : 'model', step };
}

/** The model a running setup downloads, by its catalog name. */
export function setupModelName(catalog, options = {}) {
  return (catalog?.models || []).find((model) => model.id === options?.modelId)?.title || null;
}

// ── First run ────────────────────────────────────────────────────────────────

/** The first run's pick: what the user picked, else what is in use or suits the graphics card ('catalog:…' or 'file:…'). */
export function firstRunImagePick({ status, catalog, pick = null }) {
  return pick || initialImageChoice(catalog, status);
}

/**
 * The catalog model "Download … and set up" sets up, or null: none while a
 * service is picked, or when the pick is a file already here.
 */
export function firstRunSetupModel({ status, catalog, pick = null, draft = null }) {
  if (status?.provider !== 'local' || draft) return null;
  return catalogId(firstRunImagePick({ status, catalog, pick }));
}

/**
 * Why the first-run download can't set images up, or null when it can: its
 * engine has no download for this computer (it needs installing some other
 * way first), or it couldn't be checked.
 *   { unavailable: true, text: 'Images need stable-diffusion.cpp installed on this computer first.' }
 */
export function setupEngineBlocked(plan) {
  const step = (plan?.steps || []).find((item) => item.key === 'sd-engine');
  if (!step?.error || step.done) return null;
  return step.unavailable
    ? { unavailable: true, text: 'Images need stable-diffusion.cpp installed on this computer first.' }
    : { unavailable: false, text: 'Images can be set up once the engine can be checked.' };
}

/** A pick as its row shows it: { id, name, recommended, bytes, path, fit }. */
export function pickedImage(catalog, library, value) {
  const id = catalogId(value);
  const files = library?.image || [];
  if (id) {
    const model = (catalog?.models || []).find((item) => item.id === id);
    const found = model ? files.find((file) => fileName(file) === model.file && !file.isMissing) : null;
    return {
      id,
      name: model?.title || id,
      recommended: Boolean(model?.recommended),
      bytes: model?.bytes || null,
      path: found?.path || null,
      fit: model?.fit || 'unknown',
    };
  }
  const path = String(value || '').replace(/^file:/, '');
  const file = files.find((item) => item.path === path);
  return { id: null, name: file ? fileName(file) : baseName(path), recommended: false, bytes: Number(file?.sizeBytes) || null, path: path || null, fit: null };
}

/**
 * The graphics card is small for every catalog model (or there is none):
 * the first run then says so and offers a service.
 */
export function cardIsSmall(catalog) {
  const models = catalog?.models || [];
  return models.length > 0 && models.every((model) => model.fit === 'too_big' || model.fit === 'cpu');
}

// ── What is in use ───────────────────────────────────────────────────────────

/** The image model in use on this computer: { name, bytes, path }, or null. */
export function imageInUse(status, catalog, library) {
  const model = status?.provider === 'local' ? status.model : null;
  if (!model?.path) return null;
  const entry = imageCatalogEntry(catalog, model.path);
  const file = (library?.image || []).find((item) => item.path === model.path);
  return { name: entry?.title || model.name || baseName(model.path), bytes: Number(file?.sizeBytes) || null, path: model.path };
}

/** A service model's name: "gpt-image-2.5-flare" → "GPT Image 2.5 Flare". */
export function serviceModelName(service, id) {
  return (service?.models || []).find((model) => model.id === id)?.name || id || '';
}

/** The model a service draws with: the draft's, the saved one, else its default. */
export function serviceModel(service, { draft = null, saved = null } = {}) {
  return (draft ? draft.model : saved) || service?.defaultModel || service?.models?.[0]?.id || null;
}

// ── Changing where images are made ───────────────────────────────────────────

/**
 * What choosing `value` in Runs on does:
 *   { type: 'clear' }                          the saved choice again: drop the draft
 *   { type: 'draft', draft: { provider, model } } a service with no key, or a ComfyUI
 *                                               that doesn't answer: wait for it
 *   { type: 'choose', choice }                 anything else happens at once
 */
export function imageRunsOnChange(value, { saved = null, cloud = {}, comfyFound = false } = {}) {
  if (value === saved) return { type: 'clear' };
  if (isService(value)) {
    const service = cloud?.[value];
    if (service && !service.hasKey) return { type: 'draft', draft: { provider: value, model: service.defaultModel || null } };
  } else if (value === 'comfyui' && !comfyFound) {
    return { type: 'draft', draft: { provider: 'comfyui', model: null } };
  }
  return { type: 'choose', choice: { provider: value } };
}

/** The choice a draft becomes once its key is saved or ComfyUI answers. */
export function imageDraftChoice(draft) {
  if (!draft) return null;
  return { provider: draft.provider, ...(draft.model ? { model: draft.model } : {}) };
}

/** The toast after a switch: "Images now use OpenAI". */
export function imagesSwitchedText(provider, cloud = {}) {
  if (provider === 'local') return 'Images are now made on this computer';
  return `Images now use ${providerLabel(provider, cloud)}`;
}

// ── ComfyUI ──────────────────────────────────────────────────────────────────

/** "dreamshaper_8.safetensors" → "dreamshaper_8"; a folder in the name stays. */
export function checkpointLabel(name) {
  return String(name || '').replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '');
}

/**
 * What the Status row says about ComfyUI: { text, tone } where tone is
 * null or 'warning'. `fallback` is the model on this computer images use
 * while a chosen ComfyUI doesn't answer.
 */
export function comfyStatusText(comfy, { fallback = null } = {}) {
  if (!comfy) return { text: 'Checking…', tone: null };
  if (comfy.found) {
    const count = (comfy.checkpoints || []).length;
    return { text: `Connected · ${count ? `${count} ${count === 1 ? 'checkpoint' : 'checkpoints'}` : 'no checkpoints yet'}`, tone: null };
  }
  if (fallback) return { text: `ComfyUI isn't running. Images use ${fallback} until it is.`, tone: 'warning' };
  return { text: 'Not reachable. Start ComfyUI, then check again.', tone: 'warning' };
}

/** A ComfyUI address as typed, checked: { value } (no trailing slash) or { error }. */
export function cleanComfyAddress(text) {
  const value = String(text || '').trim().replace(/\/+$/, '');
  const hint = `Use an address like ${COMFYUI_ADDRESS}.`;
  if (!value) return { error: hint };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: hint };
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return { error: hint };
  return { value };
}
