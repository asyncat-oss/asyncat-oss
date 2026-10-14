// den/src/setup/starterModels.js
// First-run setup, "Run a model on this computer": the small chat models it
// offers, how well each would run here, and which one or two to suggest.
// They are the GGUF copies of the guided-training models
// (training/trainingPlan.js), so a model trained later fits the one that
// answers chats.

import { GUIDED_MODELS } from '../training/trainingPlan.js';

const GB = 1024 ** 3;
// Room for an 8K context and llama.cpp itself, on top of the file.
const HEADROOM_BYTES = 1 * GB;
// On the processor alone, bigger models answer too slowly to start with.
const CPU_MAX_PARAMS_B = 3.5;

const NOTES = {
  'qwen3-1.7b': 'Small and quick, and the smallest download. Good for short questions.',
  'llama-3.2-3b': 'A good all-rounder that follows instructions well.',
  'qwen3-4b-instruct': 'The most capable of these, for writing and longer answers.',
};

/** Smallest first. */
export const STARTER_MODELS = GUIDED_MODELS
  .map((model) => ({
    id: model.id,
    label: model.label,
    note: NOTES[model.id] || model.note,
    paramsB: model.paramsB,
    repo: model.gguf.repo,
    file: model.gguf.file,
    bytes: model.gguf.bytes,
  }))
  .sort((a, b) => a.bytes - b.bytes);

export function starterModel(id) {
  return STARTER_MODELS.find((model) => model.id === id) || null;
}

/** Memory a model needs to chat: its file and room for the conversation. */
export function memoryNeed(model) {
  return model.bytes + HEADROOM_BYTES;
}

/**
 * How a model would run here:
 *   'gpu'     fits in graphics memory the engine can use: quick
 *   'cpu'     fits in memory comfortably; the processor runs it, more slowly
 *   'tight'   fits, but other apps may need closing
 *   'too_big'
 * `gpuBytes` is graphics memory the engine will use (0 when it runs on the
 * processor; Apple chips share the computer's memory). `ramBytes` unknown
 * (0) is taken as enough.
 */
export function chatFit(model, { gpuBytes = 0, ramBytes = 0 } = {}) {
  const need = memoryNeed(model);
  if (gpuBytes && need <= gpuBytes * 0.9) return 'gpu';
  if (!ramBytes || need <= ramBytes * 0.5) return 'cpu';
  if (need <= ramBytes * 0.75) return 'tight';
  return 'too_big';
}

/**
 * The models to offer, at most two: the most capable one that runs well here
 * (recommended), and the smallest as the lighter choice. When none runs
 * well, only the smallest, with its fit saying why.
 */
export function suggestStarterModels(hardware = {}) {
  const rated = STARTER_MODELS.map((model) => ({ ...model, fit: chatFit(model, hardware) }));
  const runsWell = rated.filter((model) => model.fit === 'gpu' || (model.fit === 'cpu' && model.paramsB <= CPU_MAX_PARAMS_B));
  const best = runsWell.at(-1) || rated[0];
  const smallest = rated[0];
  const list = [{ ...best, recommended: runsWell.length > 0 }];
  if (smallest.id !== best.id) list.push({ ...smallest, recommended: false });
  return list;
}
