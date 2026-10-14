// den/src/storage/modelLocks.js
// Whether a model file is in use, so deleting it is refused: the language
// model llama.cpp or MLX has loaded, its vision projector (mmproj) and
// trained adapter, the listening and speaking models, an image model a
// picture is being made with, and a file that is still downloading.

import fs from 'fs';
import path from 'path';
import { getStatus as llamaStatus } from '../ai/controllers/ai/llamaServerManager.js';
import { getStatus as mlxStatus } from '../ai/controllers/ai/mlxServerManager.js';
import { getStatus as whisperStatus } from '../ai/controllers/ai/whisperServerManager.js';
import { getStatus as ttsStatus } from '../ai/controllers/ai/ttsServerManager.js';
import { imageModelsInUse } from '../ai/controllers/ai/sdCppManager.js';
import { listActiveDownloads, modelsSubdir } from '../ai/controllers/ai/modelManager.js';
import { getAdapter } from '../training/adapters.js';

export const MODEL_LOADED = 'That model is loaded. Unload it in Models first.';
export const ADAPTER_LOADED = 'That adapter is loaded. Load the model without it first.';
export const MODEL_DRAWING = 'A picture is being made with that model. Try again when it is done.';
export const MODEL_DOWNLOADING = 'That model is still downloading.';

// Where each engine says it stands. Tests pass their own.
export const engines = {
  llama: llamaStatus,
  mlx: mlxStatus,
  whisper: whisperStatus,
  tts: ttsStatus,
  drawing: imageModelsInUse,
  downloads: listActiveDownloads,
  adapterFile: (id) => getAdapter(id)?.file || null,
};

const LOADED = new Set(['loading', 'ready']);

function realOrResolved(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function comparable(value) {
  const real = realOrResolved(value);
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

function same(a, b) {
  return Boolean(a && b) && comparable(a) === comparable(b);
}

function inside(folder, file) {
  if (!folder || !file) return false;
  const rel = path.relative(comparable(folder), comparable(file));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Why a model can't be deleted now, or null when it can. `type` is
 * 'adapter' with an adapter's id as `file`; for anything else (language,
 * image, vision, whisper or tts) `file` is the full path, and every engine is
 * asked, since one file can be loaded by more than one of them.
 */
export function modelInUse(type, file, sources = engines) {
  if (!file) return null;
  const llama = sources.llama() || {};
  const llamaLoaded = LOADED.has(llama.status) && llama.modelPath;

  if (type === 'adapter') {
    return llamaLoaded && llama.adapter?.id === file ? ADAPTER_LOADED : null;
  }

  if (llamaLoaded) {
    if (same(llama.modelPath, file)) return MODEL_LOADED;
    // The projector is named only by file, next to the model.
    if (llama.mmproj && same(path.join(path.dirname(llama.modelPath), llama.mmproj), file)) return MODEL_LOADED;
    if (llama.adapter?.id && same(sources.adapterFile(llama.adapter.id), file)) return ADAPTER_LOADED;
  }

  const mlx = sources.mlx() || {};
  if (LOADED.has(mlx.status) && mlx.modelPath && inside(mlx.modelPath, file)) return MODEL_LOADED;

  const whisper = sources.whisper() || {};
  if (LOADED.has(whisper.status) && same(whisper.modelPath, file)) return MODEL_LOADED;

  // Piper reads the voice and its .json settings each time it speaks.
  const tts = sources.tts() || {};
  if (LOADED.has(tts.status) && tts.modelPath && (same(tts.modelPath, file) || same(`${tts.modelPath}.json`, file))) {
    return MODEL_LOADED;
  }

  if ((sources.drawing() || []).some((modelPath) => same(modelPath, file))) return MODEL_DRAWING;

  for (const download of sources.downloads() || []) {
    if (download.status !== 'downloading') continue;
    let dest;
    try {
      dest = path.join(modelsSubdir(download.subDir || ''), download.filename);
    } catch {
      continue;
    }
    if (same(dest, file) || same(`${dest}.part`, file)) return MODEL_DOWNLOADING;
  }
  return null;
}
