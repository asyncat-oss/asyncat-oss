// den/src/training/trainingPlan.js
// Guided training, step 2: which models can be trained here, whether one
// fits the GPU, roughly how long it takes, and what it downloads first.
//
// Each model comes as a pair: a 4-bit copy to train on (Hugging Face) and
// the GGUF llama.cpp runs, from the same base, so the trained adapter fits
// the model that answers chats. Sizes checked on Hugging Face in Oct 2026.

import fs from 'fs';
import os from 'os';
import path from 'path';

export const GUIDED_MODELS = [
  {
    id: 'qwen3-1.7b',
    label: 'Qwen3 1.7B',
    note: 'Small and quick to train. Fits a 6 GB GPU with room to spare.',
    paramsB: 1.7,
    train: { repo: 'unsloth/Qwen3-1.7B-unsloth-bnb-4bit', bytes: 1_410_000_000 },
    gguf: { repo: 'unsloth/Qwen3-1.7B-GGUF', file: 'Qwen3-1.7B-Q4_K_M.gguf', bytes: 1_110_000_000 },
    vramGb: 3.5,
    tokensPerSecond: 1500,
  },
  {
    id: 'llama-3.2-3b',
    label: 'Llama 3.2 3B Instruct',
    note: 'Bigger and better at following instructions. Fits a 6 GB GPU.',
    paramsB: 3.2,
    train: { repo: 'unsloth/Llama-3.2-3B-Instruct-bnb-4bit', bytes: 2_240_000_000 },
    gguf: { repo: 'unsloth/Llama-3.2-3B-Instruct-GGUF', file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf', bytes: 2_020_000_000 },
    vramGb: 5,
    tokensPerSecond: 850,
  },
  {
    id: 'qwen3-4b-instruct',
    label: 'Qwen3 4B Instruct',
    note: 'The strongest of these. Needs about 8 GB to train comfortably.',
    paramsB: 4,
    train: { repo: 'unsloth/Qwen3-4B-Instruct-2507-bnb-4bit', bytes: 2_650_000_000 },
    gguf: { repo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF', file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf', bytes: 2_500_000_000 },
    vramGb: 6.5,
    tokensPerSecond: 650,
  },
];

// The training environment (PyTorch and friends), roughly, by backend.
export const ENV_DOWNLOAD_BYTES = { cuda: 3_500_000_000, cpu: 1_000_000_000, mlx: 300_000_000 };

export function guidedModel(id) {
  return GUIDED_MODELS.find((model) => model.id === id) || null;
}

/** The best model that fits comfortably, or the smallest one. */
export function recommendModel(gpu) {
  const vram = Number(gpu?.vramGb) || 0;
  const fitting = GUIDED_MODELS.filter((model) => fitFor(model, gpu) === 'ok');
  if (vram && fitting.length) return fitting[fitting.length - 1].id;
  return GUIDED_MODELS[0].id;
}

/** ok | tight | no (doesn't fit) | cpu (no usable GPU: hours, not minutes). */
export function fitFor(model, gpu) {
  if (!gpu || gpu.backend === 'cpu' || !(Number(gpu.vramGb) > 0)) return 'cpu';
  const vram = Number(gpu.vramGb);
  if (model.vramGb <= vram * 0.9) return 'ok';
  if (model.vramGb <= vram) return 'tight';
  return 'no';
}

/** Rough speed compared with a 6 GB laptop GPU. */
function speedFactor(gpu) {
  const vram = Number(gpu?.vramGb) || 0;
  if (gpu?.backend === 'mlx') return 0.5;
  if (vram >= 20) return 3.5;
  if (vram >= 10) return 2;
  return 1;
}

/** One pass over small data teaches little; big data needs fewer passes. */
export function suggestedEpochs(examples) {
  if (examples < 200) return 3;
  if (examples < 2000) return 2;
  return 1;
}

/** Where Hugging Face keeps downloaded models. */
export function hfHubCache(env = process.env) {
  if (env.HF_HUB_CACHE) return env.HF_HUB_CACHE;
  if (env.HF_HOME) return path.join(env.HF_HOME, 'hub');
  return path.join(os.homedir(), '.cache', 'huggingface', 'hub');
}

/** Is this Hugging Face model already downloaded? */
export function hfModelCached(repo, env = process.env) {
  const snapshots = path.join(hfHubCache(env), `models--${repo.replace('/', '--')}`, 'snapshots');
  try {
    return fs.readdirSync(snapshots).some((snapshot) => fs.existsSync(path.join(snapshots, snapshot, 'config.json')));
  } catch {
    return false;
  }
}

/**
 * The plan for one model: fit, rough time, and what it downloads.
 * `data` is { examples, tokens } from the dataset step; `have` says what is
 * already here ({ envReady, ggufPath }).
 */
export function planFor(model, { gpu = null, data = { examples: 0, tokens: 0 }, have = {}, maxSeqLen = 1024 } = {}) {
  const fit = fitFor(model, gpu);
  const epochs = suggestedEpochs(data.examples || 0);
  // Long examples are cut at maxSeqLen tokens while training.
  const tokens = Math.min(data.tokens || 0, (data.examples || 0) * maxSeqLen) * epochs;
  const perSecond = fit === 'cpu' ? model.tokensPerSecond / 60 : model.tokensPerSecond * speedFactor(gpu);
  const seconds = tokens / perSecond + 90; // plus loading the model
  const downloads = [];
  if (!have.envReady) downloads.push({ what: 'Training tools (PyTorch and friends)', bytes: ENV_DOWNLOAD_BYTES[gpu?.backend] || ENV_DOWNLOAD_BYTES.cpu });
  if (!hfModelCached(model.train.repo)) downloads.push({ what: `${model.label}, to train on`, bytes: model.train.bytes });
  if (!have.ggufPath) downloads.push({ what: `${model.label} for chats (GGUF)`, bytes: model.gguf.bytes });
  return {
    model: model.id,
    fit,
    vramNeedGb: model.vramGb,
    epochs,
    tokens,
    minutes: [Math.max(1, Math.round(seconds * 0.6 / 60)), Math.max(2, Math.round(seconds * 1.6 / 60))],
    downloads,
    downloadBytes: downloads.reduce((sum, item) => sum + item.bytes, 0),
  };
}
