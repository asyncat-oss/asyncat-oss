// den/src/media/imageService.js
// Pictures: made on this computer with stable-diffusion.cpp, or by a cloud
// service with the user's key (ComfyUI stays an advanced option). This keeps
// the chosen engine and model (ASYNCAT_IMAGE_PROVIDER, ASYNCAT_IMAGE_MODEL),
// says which catalog models suit this computer's graphics card, and plans
// "Set up images" with sizes before anything downloads.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { MODELS_DIR } from '../ai/controllers/ai/modelManager.js';
import { checkSdCpp } from '../ai/controllers/ai/sdCppManager.js';
import { checkComfyUi } from '../ai/controllers/ai/comfyUiManager.js';
import { clearCache as clearVisualCache, listVisualModels } from '../ai/controllers/ai/visualModelManager.js';
import { huggingFaceHeaders } from '../ai/controllers/ai/huggingFaceAuth.js';
import { setConfigValue } from '../config/appConfig.js';
import { detectGpu, planManagedRuntimeInstall } from '../lib/localEngine.js';
import { hfFileSize, hfFileUrl } from './hf.js';
import { CLOUD_IMAGE, IMAGE_MODELS, fitForGpu } from './imageCatalog.js';
import { startSetupJob } from './setupJobs.js';

export const IMAGE_DIR = path.join(MODELS_DIR, 'image');
const PLAN_TTL_MS = 60 * 60_000;
let planCache = null;
let gpuCache = null;

function imageError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function hasKey(name) {
  return Boolean(String(process.env[name] || '').trim());
}

export function imageProvider() {
  return String(process.env.ASYNCAT_IMAGE_PROVIDER || '').trim() || 'local';
}

/** The graphics card, looked up once a minute at most (nvidia-smi is slow). */
export function gpuInfo() {
  if (gpuCache && Date.now() - gpuCache.at < 60_000) return gpuCache.gpu;
  let gpu = null;
  try { gpu = detectGpu(); } catch { gpu = null; }
  gpuCache = { at: Date.now(), gpu };
  return gpu;
}

function localImageModels() {
  try {
    return (listVisualModels().image || []).filter((model) => model.path && fs.existsSync(model.path));
  } catch {
    return [];
  }
}

/** The local model to draw with: the chosen one, else the first there is. */
export function chosenImageModel() {
  const saved = String(process.env.ASYNCAT_IMAGE_MODEL || '').trim();
  if (saved && fs.existsSync(saved)) return saved;
  return localImageModels()[0]?.path || null;
}

function modelLabel(modelPath) {
  const file = path.basename(String(modelPath || ''));
  return IMAGE_MODELS.find((model) => model.file === file)?.title || file;
}

/** What makes pictures now, and whether it's ready. */
export async function imageStatus() {
  const provider = imageProvider();
  const ramGb = Math.round(os.totalmem() / 1024 ** 3);
  if (provider === 'local' || provider === 'comfyui') {
    const [engine, comfy] = await Promise.all([
      checkSdCpp().catch(() => ({ found: false })),
      checkComfyUi().catch(() => ({ found: false })),
    ]);
    const model = chosenImageModel();
    return {
      provider,
      engine: Boolean(engine.found),
      model: model ? { path: model, name: modelLabel(model) } : null,
      ready: Boolean((engine.found && model) || comfy.found),
      reason: comfy.found ? null : !engine.found ? 'needs_engine' : !model ? 'needs_model' : null,
      comfyui: Boolean(comfy.found),
      gpu: gpuInfo(),
      ramGb,
    };
  }
  const service = CLOUD_IMAGE[provider];
  return {
    provider,
    title: service?.title || provider,
    model: service?.modelKey ? String(process.env[service.modelKey] || service.defaultModel) : service?.models?.[0]?.id || null,
    ready: Boolean(service && hasKey(service.keyName)),
    reason: service && !hasKey(service.keyName) ? 'needs_key' : null,
    keyName: service?.keyName || null,
    edits: Boolean(service?.edits),
    gpu: gpuInfo(),
    ramGb,
  };
}

/** Catalog models with how well each suits this computer, and the cloud services. */
export function imageCatalog() {
  const gpu = gpuInfo();
  const ramGb = Math.round(os.totalmem() / 1024 ** 3);
  const files = new Set(localImageModels().map((model) => path.basename(model.path)));
  return {
    gpu,
    ramGb,
    models: IMAGE_MODELS.map((model) => ({ ...model, fit: fitForGpu(model, gpu, { ramGb }), installed: files.has(model.file) })),
    cloud: Object.fromEntries(Object.entries(CLOUD_IMAGE).map(([id, service]) => [id, {
      title: service.title,
      keyName: service.keyName,
      hasKey: hasKey(service.keyName),
      models: service.models,
      defaultModel: service.defaultModel || service.models?.[0]?.id || null,
      edits: Boolean(service.edits),
    }])),
  };
}

/**
 * Save what makes pictures: { provider: 'local', model: path }, 'comfyui'
 * (a ComfyUI you run yourself), or a cloud service { provider, model }.
 */
export async function chooseImage({ provider = 'local', model = '' } = {}) {
  if (provider === 'comfyui') {
    setConfigValue('ASYNCAT_IMAGE_PROVIDER', 'comfyui');
    return imageStatus();
  }
  if (provider === 'local') {
    const modelPath = String(model || '').trim();
    if (modelPath) {
      if (!fs.existsSync(modelPath)) throw imageError("That image model isn't on this computer.");
      setConfigValue('ASYNCAT_IMAGE_MODEL', modelPath);
    }
    setConfigValue('ASYNCAT_IMAGE_PROVIDER', 'local');
    return imageStatus();
  }
  const service = CLOUD_IMAGE[provider];
  if (!service) throw imageError('Unknown image service.');
  setConfigValue('ASYNCAT_IMAGE_PROVIDER', provider);
  if (model && service.modelKey) setConfigValue(service.modelKey, String(model));
  return imageStatus();
}

async function enginePlan() {
  if (planCache && Date.now() - planCache.at < PLAN_TTL_MS) return planCache.plan;
  const plan = await planManagedRuntimeInstall('sd');
  planCache = { at: Date.now(), plan };
  return plan;
}

/** What "Set up images" will download for a catalog model, with sizes. */
export async function planImageSetup({ modelId = null, userId = null } = {}) {
  const model = IMAGE_MODELS.find((item) => item.id === modelId) || IMAGE_MODELS.find((item) => item.recommended);
  const engineFound = (await checkSdCpp().catch(() => ({ found: false }))).found;
  const engine = engineFound ? null : await enginePlan().catch((err) => ({ error: err.message }));
  let bytes = model.bytes;
  try {
    bytes = (await hfFileSize(model.repo, model.file, { headers: huggingFaceHeaders(userId) })) ?? model.bytes;
  } catch { /* the catalog size */ }
  const steps = [
    {
      key: 'sd-engine',
      type: 'engine',
      runtimeId: 'sd',
      label: `Image engine (stable-diffusion.cpp${engine?.capabilityLabel ? `, ${engine.capabilityLabel}` : ''})`,
      done: Boolean(engineFound),
      bytes: engine?.downloadBytes || null,
      error: engine?.error || null,
    },
    {
      key: 'image-model',
      type: 'download',
      label: `Image model: ${model.title}`,
      url: hfFileUrl(model.repo, model.file),
      filename: model.file,
      subDir: 'image',
      done: fs.existsSync(path.join(IMAGE_DIR, model.file)),
      bytes,
    },
  ];
  return {
    model: { id: model.id, title: model.title, fit: fitForGpu(model, gpuInfo(), { ramGb: Math.round(os.totalmem() / 1024 ** 3) }) },
    steps,
    totalBytes: steps.filter((step) => !step.done).reduce((sum, step) => sum + (Number(step.bytes) || 0), 0),
  };
}

export async function startImageSetup({ modelId = null, userId = null } = {}) {
  const plan = await planImageSetup({ modelId, userId });
  const headers = huggingFaceHeaders(userId, { Accept: '*/*' });
  return startSetupJob({
    kind: 'images',
    title: 'Set up images',
    steps: plan.steps.map((step) => ({
      key: step.key,
      label: step.label,
      type: step.type,
      bytes: step.bytes,
      ...(step.type === 'engine'
        ? { runtimeId: step.runtimeId, check: async () => (await checkSdCpp()).found }
        : { url: step.url, filename: step.filename, subDir: step.subDir, headers }),
    })),
    onComplete: async () => {
      clearVisualCache?.();
      const file = plan.steps.find((step) => step.key === 'image-model').filename;
      return chooseImage({ provider: 'local', model: path.join(IMAGE_DIR, file) });
    },
  });
}
