// comfyUiManager.js — ComfyUI image generation bridge

import { randomUUID } from 'crypto';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8188';
const DEFAULT_TIMEOUT_MS = 10000;
const GENERATION_TIMEOUT_MS = 180000;

function baseUrl() {
  return String(process.env.COMFYUI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function url(pathname, params = {}) {
  const u = new URL(`${baseUrl()}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') u.searchParams.set(key, value);
  }
  return u;
}

async function fetchJson(pathname, options = {}) {
  const res = await fetch(url(pathname), {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || data?.error || data?.raw || `ComfyUI HTTP ${res.status}`);
  }
  return data;
}

function optionListFromObjectInfo(objectInfo, nodeName, inputName) {
  const input = objectInfo?.[nodeName]?.input?.required?.[inputName];
  return Array.isArray(input?.[0]) ? input[0] : [];
}

export async function checkComfyUi() {
  try {
    const [stats, objectInfo] = await Promise.all([
      fetchJson('/system_stats').catch(() => ({})),
      fetchJson('/object_info'),
    ]);
    const checkpoints = optionListFromObjectInfo(objectInfo, 'CheckpointLoaderSimple', 'ckpt_name');
    const samplers = optionListFromObjectInfo(objectInfo, 'KSampler', 'sampler_name');
    const schedulers = optionListFromObjectInfo(objectInfo, 'KSampler', 'scheduler');
    return {
      found: true,
      status: 'ready',
      baseUrl: baseUrl(),
      checkpoints,
      samplers,
      schedulers,
      system: stats?.system || null,
      devices: stats?.devices || [],
    };
  } catch (err) {
    return {
      found: false,
      status: 'offline',
      baseUrl: baseUrl(),
      checkpoints: [],
      samplers: [],
      schedulers: [],
      error: err.message,
    };
  }
}

export async function listComfyUiModels() {
  const objectInfo = await fetchJson('/object_info');
  return {
    checkpoints: optionListFromObjectInfo(objectInfo, 'CheckpointLoaderSimple', 'ckpt_name'),
    samplers: optionListFromObjectInfo(objectInfo, 'KSampler', 'sampler_name'),
    schedulers: optionListFromObjectInfo(objectInfo, 'KSampler', 'scheduler'),
  };
}

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(value, fallback, min, max) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function buildTxt2ImgWorkflow(options) {
  const width = clampInt(options.width, 768, 256, 2048);
  const height = clampInt(options.height, 768, 256, 2048);
  const steps = clampInt(options.steps, 24, 1, 80);
  const cfg = clampFloat(options.cfg, 7, 1, 20);
  const seed = options.seed === undefined || options.seed === null || options.seed === ''
    ? Math.floor(Math.random() * 1_000_000_000_000)
    : clampInt(options.seed, 1, 0, Number.MAX_SAFE_INTEGER);

  return {
    workflow: {
      3: {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps,
          cfg,
          sampler_name: options.sampler || 'euler',
          scheduler: options.scheduler || 'normal',
          denoise: 1,
          model: ['4', 0],
          positive: ['6', 0],
          negative: ['7', 0],
          latent_image: ['5', 0],
        },
      },
      4: {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: options.checkpoint },
      },
      5: {
        class_type: 'EmptyLatentImage',
        inputs: { width, height, batch_size: 1 },
      },
      6: {
        class_type: 'CLIPTextEncode',
        inputs: { text: options.prompt, clip: ['4', 1] },
      },
      7: {
        class_type: 'CLIPTextEncode',
        inputs: { text: options.negativePrompt || '', clip: ['4', 1] },
      },
      8: {
        class_type: 'VAEDecode',
        inputs: { samples: ['3', 0], vae: ['4', 2] },
      },
      9: {
        class_type: 'SaveImage',
        inputs: { filename_prefix: 'asyncat', images: ['8', 0] },
      },
    },
    seed,
    width,
    height,
    steps,
    cfg,
  };
}

async function pollHistory(promptId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < GENERATION_TIMEOUT_MS) {
    const history = await fetchJson(`/history/${encodeURIComponent(promptId)}`, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const entry = history?.[promptId];
    if (entry?.status?.status_str === 'error') {
      const messages = (entry.status?.messages || []).flat().join(' ');
      throw new Error(messages || 'ComfyUI generation failed');
    }
    if (entry?.outputs) return entry;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('ComfyUI generation timed out');
}

function firstOutputImage(historyEntry) {
  for (const output of Object.values(historyEntry?.outputs || {})) {
    if (Array.isArray(output?.images) && output.images.length > 0) {
      return output.images[0];
    }
  }
  return null;
}

async function fetchImage(imageRef) {
  const res = await fetch(url('/view', {
    filename: imageRef.filename,
    subfolder: imageRef.subfolder || '',
    type: imageRef.type || 'output',
  }), {
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Could not fetch generated image: HTTP ${res.status}`);
  const mimeType = res.headers.get('content-type') || 'image/png';
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    mimeType,
    bytes,
    dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
  };
}

export async function generateComfyUiImage(options = {}) {
  const prompt = String(options.prompt || '').trim();
  if (!prompt) throw new Error('prompt is required');

  const models = await listComfyUiModels();
  const checkpoint = String(options.checkpoint || models.checkpoints[0] || '').trim();
  if (!checkpoint) {
    throw new Error('No ComfyUI checkpoint is available. Add a checkpoint to ComfyUI/models/checkpoints and restart or refresh ComfyUI.');
  }
  if (models.checkpoints.length > 0 && !models.checkpoints.includes(checkpoint)) {
    throw new Error(`Checkpoint not found in ComfyUI: ${checkpoint}`);
  }

  const built = buildTxt2ImgWorkflow({ ...options, prompt, checkpoint });
  const clientId = randomUUID();
  const queued = await fetchJson('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: built.workflow, client_id: clientId }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  const promptId = queued.prompt_id;
  if (!promptId) {
    throw new Error(queued?.error?.message || queued?.error || 'ComfyUI did not return a prompt id');
  }

  const historyEntry = await pollHistory(promptId);
  const imageRef = firstOutputImage(historyEntry);
  if (!imageRef) throw new Error('ComfyUI completed but did not return an image');

  const image = await fetchImage(imageRef);
  return {
    success: true,
    runtime: 'comfyui',
    baseUrl: baseUrl(),
    promptId,
    checkpoint,
    image: image.dataUrl,
    imageRef,
    mimeType: image.mimeType,
    seed: built.seed,
    width: built.width,
    height: built.height,
    steps: built.steps,
    cfg: built.cfg,
  };
}
