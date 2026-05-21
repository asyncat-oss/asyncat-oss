// modelRuntimeStatus.js — unified local/active AI runtime status snapshot

import { execFileSync } from 'child_process';
import path from 'path';
import db from '../../../db/client.js';
import { listModels } from './modelManager.js';
import { listMlxModels, getStatus as getMlxStatus, isMlxAvailable } from './mlxServerManager.js';
import { getStatus as getLlamaStatus, getEngineAdvisor } from './llamaServerManager.js';
import { listWhisperModels, listTtsModels } from './audioModelManager.js';
import { listVisualModels } from './visualModelManager.js';
import { checkSdCpp } from './sdCppManager.js';
import { checkComfyUi } from './comfyUiManager.js';
import { getStatus as getWhisperStatus } from './whisperServerManager.js';
import { getStatus as getTtsStatus } from './ttsServerManager.js';
import { publicProvider } from './providerCatalog.js';

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(unit === 0 ? 0 : 1) : value.toFixed(2)} ${units[unit]}`;
}

function inferQuantization(...parts) {
  const text = parts.filter(Boolean).join(' ');
  const match = text.match(/(?:^|[._\-\s])((?:I?Q\d(?:_[A-Z0-9]+){0,3})|BF16|FP16|F16|FP8|F32)(?=[._\-\s]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

function parseProviderJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function safePublicProvider(row) {
  if (!row) return null;
  const pub = publicProvider({
    id: row.profile_id || row.id || null,
    name: row.name || null,
    provider_type: row.provider_type,
    provider_id: row.provider_id,
    base_url: row.base_url,
    model: row.model,
    settings: row.settings,
    supports_tools: row.supports_tools,
    api_key: row.api_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
  return {
    id: pub?.id || row.profile_id || row.id || null,
    name: pub?.name || row.name || row.provider_id || null,
    providerType: pub?.provider_type || row.provider_type || null,
    providerId: pub?.provider_id || row.provider_id || null,
    baseUrl: pub?.base_url || row.base_url || null,
    model: pub?.model || row.model || null,
    settings: pub?.settings || parseProviderJson(row.settings, {}),
    supportsTools: Boolean(pub?.supports_tools ?? row.supports_tools),
    local: Boolean(pub?.local),
    managed: Boolean(pub?.managed),
  };
}

function activeProviderForUser(userId) {
  if (!userId) return null;
  const row = db.prepare('SELECT * FROM ai_provider_config WHERE user_id = ?').get(userId);
  return safePublicProvider(row);
}

function samePath(a, b) {
  if (!a || !b) return false;
  try {
    return path.resolve(String(a)) === path.resolve(String(b));
  } catch {
    return String(a) === String(b);
  }
}

function findModel(models, status = {}) {
  const model = status.model || status.modelPath || '';
  const basename = model ? path.basename(String(model)) : '';
  const modelPath = status.modelPath || status.path || null;
  return models.find(item => (
    (modelPath && samePath(item.path, modelPath)) ||
    (item.filename && item.filename === basename) ||
    (item.filename && item.filename === model) ||
    (item.name && item.name === model) ||
    (item.path && samePath(item.path, model))
  )) || null;
}

function summarizeModel(model = null, fallback = {}) {
  if (!model && !fallback) return null;
  const filename = model?.filename || (fallback.model ? path.basename(String(fallback.model)) : null);
  return {
    name: model?.name || fallback.model || fallback.name || filename || null,
    filename,
    path: model?.path || fallback.modelPath || fallback.path || null,
    sizeBytes: model?.sizeBytes ?? null,
    sizeFormatted: model?.sizeFormatted || formatBytes(model?.sizeBytes) || null,
    quantization: model?.quantization || inferQuantization(model?.filename, model?.name, model?.path, fallback.model),
    architecture: model?.architecture || null,
    contextLength: model?.contextLength || fallback.ctxTrain || fallback.ctxSize || null,
    parameterCount: model?.parameterCount || null,
  };
}

function processMemory(pid) {
  if (!pid) return null;
  try {
    const rssKb = Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2000,
    }).trim());
    if (!Number.isFinite(rssKb) || rssKb <= 0) return null;
    const bytes = rssKb * 1024;
    return { rssBytes: bytes, rssFormatted: formatBytes(bytes) };
  } catch {
    return null;
  }
}

function normalizeComfyDevice(device = {}) {
  const total = Number(device.vram_total ?? device.torch_vram_total ?? device.total_memory ?? 0);
  const free = Number(device.vram_free ?? device.torch_vram_free ?? 0);
  const used = total > 0 && free >= 0 ? Math.max(0, total - free) : null;
  return {
    name: device.name || device.device_name || device.type || 'device',
    type: device.type || null,
    vramTotalBytes: total || null,
    vramTotalFormatted: total ? formatBytes(total) : null,
    vramFreeBytes: free || null,
    vramFreeFormatted: free ? formatBytes(free) : null,
    vramUsedBytes: used,
    vramUsedFormatted: used ? formatBytes(used) : null,
  };
}

async function getLlmStatus(activeProvider) {
  const [llama, mlx, advisorResult] = await Promise.all([
    Promise.resolve(getLlamaStatus()).catch(err => ({ status: 'error', error: err.message })),
    Promise.resolve(getMlxStatus()).catch(err => ({ status: 'error', error: err.message })),
    getEngineAdvisor().catch(err => ({ error: err.message })),
  ]);

  const ggufModels = listModels();
  const mlxModels = listMlxModels();
  const llamaModel = findModel(ggufModels, llama);
  const mlxModel = findModel(mlxModels, mlx);

  const loaded = [];
  if (llama.status === 'ready' || llama.status === 'loading') {
    loaded.push({
      kind: 'llm',
      runtime: 'llama.cpp',
      status: llama.status,
      model: summarizeModel(llamaModel, llama),
      pid: llama.pid || null,
      port: llama.port || null,
      baseUrl: llama.baseUrl || null,
      contextSize: llama.ctxSize || null,
      contextTrain: llama.ctxTrain || null,
      memory: processMemory(llama.pid),
      gpu: advisorResult?.hardware?.gpu || null,
      gpuLayers: Number.isFinite(Number(advisorResult?.configured?.LLAMA_GPU_LAYERS))
        ? Number(advisorResult.configured.LLAMA_GPU_LAYERS)
        : null,
      vram: {
        usedBytes: null,
        usedFormatted: null,
        totalGb: advisorResult?.hardware?.gpu?.vramGb ?? null,
        note: 'llama.cpp does not expose exact VRAM usage here; configured GPU layers and detected total VRAM are shown when available.',
      },
    });
  }
  if (mlx.status === 'ready' || mlx.status === 'loading') {
    loaded.push({
      kind: 'llm',
      runtime: 'mlx',
      status: mlx.status,
      model: summarizeModel(mlxModel, mlx),
      pid: mlx.pid || null,
      port: mlx.port || null,
      memory: processMemory(mlx.pid),
      vram: {
        usedBytes: null,
        usedFormatted: null,
        note: 'MLX does not expose exact VRAM usage through the current local server status.',
      },
    });
  }

  const mlxAvailable = await isMlxAvailable().catch(() => false);
  return {
    activeProvider,
    loaded,
    llama: {
      ...llama,
      modelInfo: summarizeModel(llamaModel, llama),
      engine: advisorResult?.current || null,
      hardware: advisorResult?.hardware || null,
      configured: advisorResult?.configured || {},
      memory: processMemory(llama.pid),
    },
    mlx: {
      ...mlx,
      mlxAvailable,
      modelInfo: summarizeModel(mlxModel, mlx),
      memory: processMemory(mlx.pid),
    },
    availableCounts: {
      gguf: ggufModels.length,
      mlx: mlxModels.length,
    },
  };
}

function getAudioStatus() {
  const whisper = getWhisperStatus();
  const tts = getTtsStatus();
  const whisperModel = findModel(listWhisperModels(), whisper);
  const ttsModel = findModel(listTtsModels(), tts);
  const loaded = [];

  if (whisper.status === 'ready' || whisper.status === 'loading') {
    loaded.push({
      kind: 'stt',
      runtime: 'whisper.cpp',
      status: whisper.status,
      model: {
        ...summarizeModel(whisperModel, whisper),
        modelSize: whisperModel?.modelSize || inferQuantization(whisper.model),
        language: whisperModel?.language || null,
        quality: whisperModel?.quality || null,
      },
      pid: whisper.pid || null,
      port: whisper.port || null,
      memory: processMemory(whisper.pid),
    });
  }
  if (tts.status === 'ready' || tts.status === 'loading') {
    loaded.push({
      kind: 'tts',
      runtime: 'piper',
      status: tts.status,
      model: {
        ...summarizeModel(ttsModel, tts),
        language: ttsModel?.languageName || ttsModel?.language || null,
        quality: ttsModel?.qualityLabel || ttsModel?.quality || null,
        sampleRate: ttsModel?.sampleRate || null,
      },
      pid: tts.pid || null,
      memory: processMemory(tts.pid),
    });
  }

  return {
    loaded,
    whisper: {
      ...whisper,
      modelInfo: summarizeModel(whisperModel, whisper),
    },
    tts: {
      ...tts,
      modelInfo: summarizeModel(ttsModel, tts),
    },
  };
}

async function getImageStatus() {
  const [simple, comfyui] = await Promise.all([
    checkSdCpp().catch(err => ({ found: false, status: 'missing', error: err.message, models: [] })),
    checkComfyUi().catch(err => ({ found: false, status: 'offline', error: err.message, checkpoints: [], devices: [] })),
  ]);
  const visualModels = listVisualModels();
  const loaded = [];

  if (comfyui.found) {
    loaded.push({
      kind: 'image',
      runtime: 'comfyui',
      status: comfyui.status,
      baseUrl: comfyui.baseUrl,
      checkpoints: comfyui.checkpoints || [],
      activeCheckpoint: comfyui.checkpoints?.[0] || null,
      devices: (comfyui.devices || []).map(normalizeComfyDevice),
      vram: (comfyui.devices || []).map(normalizeComfyDevice),
    });
  }
  if (simple.found) {
    const defaultModel = simple.models?.[0] || null;
    loaded.push({
      kind: 'image',
      runtime: 'stable-diffusion.cpp',
      status: simple.status,
      binaryPath: simple.binaryPath || null,
      model: defaultModel
        ? {
            name: defaultModel.name || defaultModel.filename,
            filename: defaultModel.filename,
            path: defaultModel.path,
            sizeFormatted: defaultModel.sizeFormatted || null,
            quantization: inferQuantization(defaultModel.filename, defaultModel.name),
          }
        : null,
    });
  }

  return {
    loaded,
    preferredRuntime: comfyui.found ? 'comfyui' : simple.found ? 'stable-diffusion.cpp' : null,
    simple: {
      ...simple,
      modelCount: simple.models?.length || 0,
    },
    comfyui: {
      ...comfyui,
      checkpointCount: comfyui.checkpoints?.length || 0,
      devices: (comfyui.devices || []).map(normalizeComfyDevice),
    },
    catalog: {
      imageModels: visualModels.image?.length || 0,
      visionModels: visualModels.vision?.length || 0,
    },
  };
}

export async function getModelRuntimeStatus(userId = null) {
  const activeProvider = activeProviderForUser(userId);
  const [llm, audio, image] = await Promise.all([
    getLlmStatus(activeProvider),
    Promise.resolve(getAudioStatus()),
    getImageStatus(),
  ]);
  const loadedModels = [
    ...(llm.loaded || []),
    ...(audio.loaded || []),
    ...(image.loaded || []),
  ];

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    activeProvider,
    loadedModels,
    counts: {
      loaded: loadedModels.length,
      llm: llm.loaded?.length || 0,
      stt: audio.loaded?.filter(item => item.kind === 'stt').length || 0,
      tts: audio.loaded?.filter(item => item.kind === 'tts').length || 0,
      image: image.loaded?.length || 0,
    },
    llm,
    stt: audio.whisper,
    tts: audio.tts,
    image,
  };
}

export default getModelRuntimeStatus;
