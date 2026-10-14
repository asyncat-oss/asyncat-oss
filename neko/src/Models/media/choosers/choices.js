// What the choosers list and start on: catalog models and voices with the
// file each has on this computer (if any), the other files there, which
// option is chosen when a chooser opens, and the words of its download
// button.

import { formatBytes } from '../../../components/ui/progressFormat.js';
import {
  baseName, imageCatalogEntry, stepErrorText, totalText, voiceCatalogEntry, voicesByLanguage, whisperCatalogEntry, whisperTitle,
} from '../mediaFormat.js';

const usable = (file) => file && !file.isMissing;
const fileName = (file) => file.filename || baseName(file.path);

/**
 * Listening models: the catalog's, each with the path of its file when it is
 * on this computer (the English-only file when `english` and the model has
 * one), and `others`, the listening files that aren't in the catalog.
 */
export function whisperChoices(catalog, library, { english = false } = {}) {
  const files = library?.whisper || [];
  const byName = new Map(files.filter(usable).map((file) => [fileName(file), file]));
  const catalogNames = new Set((catalog?.whisper || []).flatMap((model) => [model.file, model.englishFile].filter(Boolean)));
  const models = (catalog?.whisper || []).map((model) => {
    const englishOnly = Boolean(english && model.englishFile);
    return {
      value: `catalog:${model.id}`,
      id: model.id,
      title: model.title,
      name: whisperTitle({ model, english: englishOnly }),
      note: model.note || null,
      recommended: Boolean(model.recommended),
      bytes: model.bytes || null,
      hasEnglish: Boolean(model.englishFile),
      english: englishOnly,
      path: byName.get(englishOnly ? model.englishFile : model.file)?.path || null,
    };
  });
  const others = files.filter((file) => !catalogNames.has(fileName(file))).map((file) => ({
    value: `file:${file.path}`,
    name: fileName(file),
    bytes: Number(file.sizeBytes) || null,
    path: usable(file) ? file.path : null,
    missing: Boolean(file.isMissing),
  }));
  return { models, others };
}

/** The listening option chosen when the chooser opens: what is in use, else the recommended one. */
export function initialWhisperChoice(catalog, status, language = 'en') {
  const path = status?.stt?.provider === 'local' ? status.stt.model?.path : null;
  const entry = path ? whisperCatalogEntry(catalog, path) : null;
  if (entry) return { value: `catalog:${entry.model.id}`, english: entry.english };
  const english = String(language || 'en').toLowerCase().startsWith('en');
  if (path) return { value: `file:${path}`, english };
  const model = (catalog?.whisper || []).find((item) => item.recommended) || catalog?.whisper?.[0];
  return { value: model ? `catalog:${model.id}` : null, english };
}

/**
 * Piper voices, grouped by language with the user's first, each with its
 * file when the voice and its settings file are both here, and `others`,
 * the voices on this computer that aren't in the catalog.
 */
export function voiceChoices(catalog, library, language = 'en') {
  const files = library?.tts || [];
  const complete = new Map(files.filter((file) => usable(file) && !file.missingConfig).map((file) => [fileName(file), file]));
  const voices = voicesByLanguage(catalog?.voices || [], language).flatMap((group) => group.voices.map((voice) => ({
    value: `catalog:${voice.id}`,
    id: voice.id,
    name: voice.name,
    group: group.language,
    note: voice.note || null,
    recommended: Boolean(voice.recommended),
    bytes: voice.bytes || null,
    path: complete.get(`${voice.id}.onnx`)?.path || null,
  })));
  const catalogFiles = new Set((catalog?.voices || []).map((voice) => `${voice.id}.onnx`));
  const others = files.filter((file) => !catalogFiles.has(fileName(file))).map((file) => ({
    value: `file:${file.path}`,
    name: fileName(file),
    bytes: Number(file.sizeBytes) || null,
    path: usable(file) && !file.missingConfig ? file.path : null,
    missing: Boolean(file.isMissing),
    incomplete: Boolean(file.missingConfig),
  }));
  return { voices, others };
}

/** The voice chosen when the chooser opens: the one in use, else one for the user's language. */
export function initialVoiceChoice(catalog, status, language = 'en') {
  const path = status?.tts?.provider === 'local' ? status.tts.voice?.path : null;
  const voice = path ? voiceCatalogEntry(catalog, path) : null;
  if (voice) return `catalog:${voice.id}`;
  if (path) return `file:${path}`;
  const lang = String(language || 'en').toLowerCase();
  const voices = catalog?.voices || [];
  const pick = voices.find((item) => item.locale.toLowerCase() === lang)
    || voices.find((item) => item.locale.slice(0, 2).toLowerCase() === lang.slice(0, 2))
    || voices.find((item) => item.recommended)
    || voices[0];
  return pick ? `catalog:${pick.id}` : null;
}

/**
 * Image models: the catalog's with their file when it is here, and
 * `others`, the image models on this computer Asyncat can draw with that
 * aren't in the catalog (never a LoRA or VAE).
 */
export function imageChoices(catalog, library) {
  const files = library?.image || [];
  const byName = new Map(files.filter(usable).map((file) => [fileName(file), file]));
  const catalogFiles = new Set((catalog?.models || []).map((model) => model.file));
  const models = (catalog?.models || []).map((model) => ({
    value: `catalog:${model.id}`,
    id: model.id,
    name: model.title,
    note: model.note || null,
    recommended: Boolean(model.recommended),
    bytes: model.bytes || null,
    fit: model.fit || 'unknown',
    path: byName.get(model.file)?.path || null,
  }));
  const others = files
    .filter((file) => (file.assetKind || 'Image model') === 'Image model' && file.drawable !== false && !catalogFiles.has(fileName(file)))
    .map((file) => ({
      value: `file:${file.path}`,
      name: fileName(file),
      bytes: Number(file.sizeBytes) || null,
      path: usable(file) ? file.path : null,
      missing: Boolean(file.isMissing),
    }));
  return { models, others };
}

/** The image model chosen when the chooser opens: the one in use, else the first recommended one that fits. */
export function initialImageChoice(catalog, status) {
  const path = status?.provider === 'local' ? status.model?.path : null;
  const entry = path ? imageCatalogEntry(catalog, path) : null;
  if (entry) return `catalog:${entry.id}`;
  if (path) return `file:${path}`;
  const models = catalog?.models || [];
  const best = models.find((model) => model.recommended && model.fit !== 'too_big') || models[0];
  return best ? `catalog:${best.id}` : null;
}

/**
 * "Download 190 MB and use it": the plan's total when it is known, else
 * about the catalog's size. Null when the plan has nothing to download.
 */
export function downloadLabel(plan, fallbackBytes = null, then = 'use it') {
  if (plan && !plan.totalBytes) return null;
  const size = plan ? totalText(plan.totalBytes, { estimated: plan.estimated }) : fallbackBytes ? `about ${formatBytes(fallbackBytes)}` : null;
  return size ? `Download ${size} and ${then}` : `Download and ${then}`;
}

/**
 * Why a chooser's download can't start: a step its plan can't get (an
 * engine with no download for this computer, or one that couldn't be
 * checked). { button, detail } or null; `button` is the disabled button's
 * tooltip and `detail` what went wrong, in a line.
 */
export function planBlocked(plan) {
  const step = (plan?.steps || []).find((item) => item.error && !item.done);
  if (!step) return null;
  return {
    button: step.unavailable ? "Its engine can't be downloaded here." : "Couldn't check its engine.",
    detail: stepErrorText(step.error),
  };
}
