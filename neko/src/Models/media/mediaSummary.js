// One short line each for what listens, speaks and makes images, for the
// strip under the model in use on Models → Language. Each returns
// { value, tone }: tone is 'ready', 'loading', 'warning', 'error' or 'idle'
// (the colour of the dot beside it).

import { checkpointLabel, serviceModelName } from './imagesView.js';
import { baseName, voiceCatalogEntry, whisperCatalogEntry, whisperTitle } from './mediaFormat.js';
import { listeningModelName, serviceTitle } from './providers.js';

export const ENGINE_WORDS = { image: 'stable-diffusion.cpp', comfyui: 'ComfyUI' };

const CHECKING = { value: 'Checking…', tone: 'idle' };
const UNKNOWN = { value: "Couldn't check", tone: 'idle' };
const OFF = { value: 'Off', tone: 'idle' };

const isService = (provider) => Boolean(provider) && !['local', 'off', 'comfyui'].includes(provider);
const join = (...parts) => parts.filter(Boolean).join(' · ');

// A loaded engine that is still starting, or one that failed, shows on the dot.
function runningTone(running) {
  if (running === 'loading' || running === 'starting') return 'loading';
  if (running === 'error') return 'error';
  return 'ready';
}

// What a part on this computer still needs, or "Not set up" when it has nothing yet.
function localNeeds(part, file, needsFile) {
  const noEngine = part.engine === false || part.reason === 'needs_engine';
  const noFile = !part[file];
  if (noEngine && noFile) return { value: 'Not set up', tone: 'idle' };
  if (noEngine) return { value: 'Needs its engine', tone: 'warning' };
  return { value: needsFile, tone: 'warning' };
}

function serviceLine(part, cloud, detail) {
  const title = part.title || cloud?.[part.provider]?.title || serviceTitle(part.provider);
  if (part.reason === 'needs_key') return { value: join(title, 'needs a key'), tone: 'warning' };
  return { value: join(title, detail), tone: part.ready ? 'ready' : 'idle' };
}

/**
 * Listening, from GET /media/voice ({ status, catalog }):
 * "Base (English)", "OpenAI · GPT-4o Transcribe", "Off", "Needs a model".
 * `voice` is null while it loads and { error } when it couldn't.
 */
export function listeningSummary(voice) {
  if (!voice) return CHECKING;
  const part = voice.status?.stt;
  if (voice.error || !part) return UNKNOWN;
  if (part.provider === 'off') return OFF;
  if (part.provider === 'local') {
    if (!part.ready) return localNeeds(part, 'model', 'Needs a model');
    const entry = whisperCatalogEntry(voice.catalog, part.model?.path);
    const name = entry ? whisperTitle(entry) : part.model?.name || baseName(part.model?.path);
    return { value: name, tone: runningTone(part.running) };
  }
  return serviceLine(part, voice.catalog?.cloud, listeningModelName(part.model));
}

// ElevenLabs names a voice from the person's account only by its id: leave that out.
function cloudVoiceName(voice) {
  if (!voice) return null;
  if (voice.name && voice.name !== voice.id) return voice.name;
  return /^[A-Za-z0-9]{16,}$/.test(String(voice.id || '')) ? null : voice.name || voice.id || null;
}

/**
 * Speaking, from GET /media/voice: "Lessac", "OpenAI · Coral", "Off",
 * "Needs a voice".
 */
export function speakingSummary(voice) {
  if (!voice) return CHECKING;
  const part = voice.status?.tts;
  if (voice.error || !part) return UNKNOWN;
  if (part.provider === 'off') return OFF;
  if (part.provider === 'local') {
    if (!part.ready) return localNeeds(part, 'voice', 'Needs a voice');
    const entry = voiceCatalogEntry(voice.catalog, part.voice?.path);
    const name = entry ? entry.name : baseName(part.voice?.path).replace(/\.onnx$/i, '');
    return { value: name, tone: runningTone(part.running) };
  }
  return serviceLine(part, voice.catalog?.cloud, cloudVoiceName(part.voice));
}

// The model on this computer images are drawn with, by its catalog name.
function localModelName(status, catalog) {
  const model = status.model;
  if (!model?.path) return null;
  const file = baseName(model.path);
  const entry = (catalog?.models || []).find((item) => item.file === file);
  return entry?.title || checkpointLabel(model.name || file);
}

function comfyLine(status) {
  return { value: join(ENGINE_WORDS.comfyui, status.checkpoint ? checkpointLabel(status.checkpoint) : null), tone: 'ready' };
}

/**
 * Making images, from GET /media/images ({ status, catalog }): the engine
 * that draws and its model, "stable-diffusion.cpp · Stable Diffusion 1.5",
 * "ComfyUI · dreamshaper_8", "OpenAI · GPT Image 2.5 Flare". When the
 * chosen engine can't draw, the one generate_image falls back to is named.
 */
export function imagesSummary(images) {
  if (!images) return CHECKING;
  const status = images.status;
  if (images.error || !status) return UNKNOWN;
  if (isService(status.provider)) {
    const service = images.catalog?.cloud?.[status.provider];
    return serviceLine(status, images.catalog?.cloud, serviceModelName(service, status.model));
  }
  const model = localModelName(status, images.catalog);
  const localDraws = Boolean(status.engine && model);
  if (status.provider === 'comfyui') {
    if (status.comfyui) return comfyLine(status);
    if (localDraws) return { value: join(ENGINE_WORDS.image, model), tone: 'ready' };
    return { value: "ComfyUI isn't running", tone: 'warning' };
  }
  if (localDraws) return { value: join(ENGINE_WORDS.image, model), tone: 'ready' };
  // Nothing to draw with here, but a ComfyUI that answers makes the images.
  if (status.comfyui) return comfyLine(status);
  if (!status.engine && !model) return { value: 'Not set up', tone: 'idle' };
  if (!status.engine) return { value: 'Needs its engine', tone: 'warning' };
  return { value: 'Needs a model', tone: 'warning' };
}
