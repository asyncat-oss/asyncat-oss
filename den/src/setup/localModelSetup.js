// den/src/setup/localModelSetup.js
// First-run setup, "Run a model on this computer": what this computer has,
// the models to suggest with their download sizes, the llama.cpp engine when
// it isn't installed yet (and its size), and the setup job that downloads
// both (media/setupJobs.js), then loads the model unless something else
// answers chats by then.

import fs from 'fs';
import os from 'os';
import path from 'path';
import db from '../db/client.js';
import { MODELS_DIR, clearCache as clearModelCache } from '../ai/controllers/ai/modelManager.js';
import {
  cancelEngineInstallJob,
  checkBinary,
  getEngineAdvisor,
  getEngineInstallCatalog,
  getEngineInstallJob,
  getStatus as getLlamaStatus,
  startEngineInstallJob,
  startServer,
} from '../ai/controllers/ai/llamaServerManager.js';
import { huggingFaceHeaders } from '../ai/controllers/ai/huggingFaceAuth.js';
import { saveBuiltinProviderConfig } from '../ai/routes/providerRoutes.js';
import { hfFileUrl } from '../media/hf.js';
import { startSetupJob } from '../media/setupJobs.js';
import { starterModel, suggestStarterModels } from './starterModels.js';

export const SETUP_KIND = 'chat-model';
export const CTX_SIZE = 8192;
const GB = 1024 ** 3;

function setupError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/**
 * Graphics memory llama.cpp will use: none when the engine runs on the
 * processor. Apple chips share the computer's memory with the GPU.
 */
export function usableGpuBytes(gpu, { engineGpu = false, ramBytes = 0 } = {}) {
  if (!gpu || !engineGpu) return 0;
  if (gpu.vendor === 'Apple') return ramBytes * 0.65;
  return Number(gpu.vramGb) > 0 ? Number(gpu.vramGb) * GB : 0;
}

// Vulkan builds run on NVIDIA, AMD and Intel cards alike, so they stand in
// where there's no build for the card's own kind (CUDA on Linux, say).
const VULKAN_STANDS_IN = new Set(['nvidia_gpu', 'amd_rocm', 'intel_sycl']);

/**
 * The llama.cpp build to install: for this computer's graphics card when
 * one can be downloaded (`profile`, else Vulkan), else for the processor.
 * `releases` come from getEngineInstallCatalog(). { profile, releaseTag,
 * bytes } with the size of the file it will most likely take, or null.
 */
export function pickEngineBuild(releases = [], profile = 'cpu_safe') {
  const order = [profile, ...(VULKAN_STANDS_IN.has(profile) ? ['vulkan'] : []), 'cpu_safe'];
  for (const wanted of new Set(order)) {
    for (const release of releases) {
      const best = (release.assets || [])
        .filter((asset) => asset.compatible && asset.supportedProfiles?.includes(wanted))
        .sort((a, b) => (b.profileScores?.[wanted] ?? 0) - (a.profileScores?.[wanted] ?? 0))[0];
      if (best) return { profile: wanted, releaseTag: release.tagName, bytes: Number(best.sizeBytes) || null };
    }
  }
  return null;
}

/** The engine's own install jobs, in the shape setupJobs.js polls. */
function llamaInstaller({ profile, releaseTag }) {
  return {
    start: () => startEngineInstallJob({ profile, releaseTag, modelsDir: MODELS_DIR }),
    get: (id) => {
      const job = getEngineInstallJob(id);
      if (!job) return null;
      return {
        status: job.status === 'queued' ? 'running' : job.status,
        progress: { percent: job.percent, message: job.message, downloadedBytes: job.downloadedBytes, totalBytes: job.totalBytes },
        error: job.error,
      };
    },
    cancel: (id) => cancelEngineInstallJob(id),
  };
}

/**
 * The engine in use, or the build to install and what it takes. One in use
 * runs on the graphics card only when it is a build for one and Asyncat
 * gives it layers to put there (LLAMA_GPU_LAYERS, set when an engine is
 * chosen or installed in Asyncat; 0 when it was only found on this computer).
 */
async function engineFor(advisor, catalog) {
  const gpu = advisor.hardware?.gpu || null;
  if (advisor.current) {
    const offloads = Number(advisor.configured?.LLAMA_GPU_LAYERS) > 0;
    return { installed: true, gpu: Boolean(gpu && !gpu.driverIssue && advisor.current.capabilityHint !== 'cpu_safe' && offloads) };
  }
  const profile = advisor.recommendation?.recommendedInstallProfile || 'cpu_safe';
  try {
    const build = pickEngineBuild((await catalog()).releases, profile);
    if (!build) return { installed: false, gpu: false, error: "There's no llama.cpp build Asyncat can download for this computer." };
    return { installed: false, gpu: build.profile !== 'cpu_safe', ...build };
  } catch (err) {
    return { installed: false, gpu: false, error: `Couldn't find the llama.cpp engine to download (${err.message}). Check the internet connection and try again.` };
  }
}

/**
 * What "Run a model on this computer" offers here:
 *   hardware  { ramBytes, gpu: { vendor, name, vramGb } | null }
 *   engine    { installed, gpu } or, to install, { profile, releaseTag, bytes } or { error }
 *   models    one or two: { id, label, note, bytes, fit, recommended, installed }
 */
export async function localModelPlan({ advisor = getEngineAdvisor, catalog = getEngineInstallCatalog, ramBytes = os.totalmem(), modelsDir = MODELS_DIR } = {}) {
  const info = await advisor();
  const engine = await engineFor(info, catalog);
  const gpu = info.hardware?.gpu || null;
  const gpuBytes = usableGpuBytes(gpu, { engineGpu: engine.gpu, ramBytes });
  const models = suggestStarterModels({ gpuBytes, ramBytes }).map((model) => ({
    id: model.id,
    label: model.label,
    note: model.note,
    bytes: model.bytes,
    fit: model.fit,
    recommended: model.recommended,
    installed: fs.existsSync(path.join(modelsDir, model.file)),
  }));
  return {
    hardware: { ramBytes, gpu: gpu ? { vendor: gpu.vendor, name: gpu.name, vramGb: gpu.vramGb ?? null } : null },
    engine,
    models,
  };
}

/**
 * Load the downloaded model for chats, unless something else answers them
 * by now: a provider connected while it downloaded, or another model.
 */
export async function loadWhenIdle(userId, modelPath, { database = db, status = getLlamaStatus, start = startServer, save = saveBuiltinProviderConfig } = {}) {
  clearModelCache();
  const active = database.prepare('SELECT model FROM ai_provider_config WHERE user_id = ?').get(userId);
  const engine = status();
  if (active?.model || engine.status === 'ready' || engine.status === 'loading') {
    return { loaded: false, path: modelPath, reason: 'in_use' };
  }
  try {
    await start(modelPath, MODELS_DIR, CTX_SIZE);
  } catch (err) {
    return { loaded: false, path: modelPath, error: err.message };
  }
  save(userId, modelPath, CTX_SIZE);
  return { loaded: true, path: modelPath };
}

const engineInstalled = async () => (await checkBinary()).found;

/**
 * Download a starter model (and the engine, when it's missing) as one setup
 * job the page follows with 'media.setup' events and /api/media/setup/:id.
 */
export async function startLocalModelSetup(
  { modelId, userId = null } = {},
  { plan = localModelPlan, load = loadWhenIdle, installer = llamaInstaller, engineFound = engineInstalled } = {},
) {
  const model = starterModel(modelId);
  if (!model) throw setupError('Choose one of the models offered.');
  const { engine } = await plan();
  if (!engine.installed && engine.error) throw setupError(engine.error, 502);

  const steps = [];
  if (!engine.installed) {
    steps.push({
      key: 'engine',
      type: 'engine',
      label: 'llama.cpp engine',
      bytes: engine.bytes,
      check: engineFound,
      installer: installer(engine),
    });
  }
  steps.push({
    key: 'model',
    type: 'download',
    label: model.label,
    url: hfFileUrl(model.repo, model.file),
    filename: model.file,
    subDir: '',
    bytes: model.bytes,
    headers: huggingFaceHeaders(userId, { Accept: '*/*' }),
  });

  return startSetupJob({
    kind: SETUP_KIND,
    title: 'Set up a model on this computer',
    options: { modelId: model.id },
    steps,
    onComplete: () => load(userId, path.join(MODELS_DIR, model.file)),
  });
}
