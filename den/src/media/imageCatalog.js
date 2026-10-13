// den/src/media/imageCatalog.js
// The image models "Set up images" offers for stable-diffusion.cpp (single
// files that run in a few GB of graphics memory; sizes checked against the
// repos in October 2026), the settings each kind of model needs, and the
// cloud services.

import path from 'path';

export const IMAGE_MODELS = [
  {
    id: 'sd15-q8',
    title: 'Stable Diffusion 1.5',
    repo: 'second-state/stable-diffusion-v1-5-GGUF',
    file: 'stable-diffusion-v1-5-pruned-emaonly-Q8_0.gguf',
    bytes: 1_760_000_000,
    minVramGb: 2.5,
    note: 'Small and quick: 512×512 pictures in seconds on a graphics card.',
    recommended: true,
  },
  {
    id: 'sdxl-turbo-q8',
    title: 'SDXL Turbo',
    repo: 'OlegSkutte/sdxl-turbo-GGUF',
    file: 'sd_xl_turbo_1.0.q8_0.gguf',
    bytes: 4_100_000_000,
    minVramGb: 5,
    note: "Better pictures in a few steps. A community conversion of Stability AI's SDXL Turbo; check Stability AI's licence before using pictures commercially.",
  },
];

/**
 * Generation settings for a model file, by its name: turbo models need very
 * few steps and almost no guidance, SDXL works at 1024 pixels.
 */
export function imageModelDefaults(modelPath = '') {
  const name = path.basename(String(modelPath)).toLowerCase();
  if (/turbo|lightning|lcm|hyper/.test(name)) return { width: 512, height: 512, steps: 4, cfg: 1, sampler: 'euler_a' };
  if (/(?:^|[^a-z])(?:sd_?xl|sdxl)(?:[^a-z]|$)/.test(name) || /xl[-_]base|_xl_/.test(name)) return { width: 1024, height: 1024, steps: 25, cfg: 6 };
  return { width: 512, height: 512, steps: 24, cfg: 7 };
}

/**
 * How well a model suits a graphics card: 'fits', 'tight' (works, other
 * apps may need closing), 'too_big', 'unknown' (a card whose memory can't
 * be read), or 'cpu' (no card: works, slowly). Apple chips share the
 * computer's memory, so `ramGb` counts for them.
 */
export function fitForGpu(model, gpu, { ramGb = null } = {}) {
  if (!gpu) return 'cpu';
  let vram = Number(gpu.vramGb) || 0;
  if (!vram && gpu.vendor === 'Apple' && ramGb) vram = ramGb * 0.6;
  if (!vram) return 'unknown';
  if (vram >= model.minVramGb + 1) return 'fits';
  if (vram >= model.minVramGb) return 'tight';
  return 'too_big';
}

export const CLOUD_IMAGE = {
  openai: {
    title: 'OpenAI',
    keyName: 'OPENAI_API_KEY',
    modelKey: 'OPENAI_IMAGE_MODEL',
    defaultModel: 'gpt-image-2.5-flare',
    models: [
      { id: 'gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare', note: 'Fast, high quality.' },
      { id: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', note: 'The most capable, slower and dearer.' },
    ],
    edits: true,
  },
  gemini: {
    title: 'Gemini',
    keyName: 'GEMINI_API_KEY',
    modelKey: 'GEMINI_IMAGE_MODEL',
    defaultModel: 'gemini-2.5-flash-image',
    models: [{ id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image' }],
    edits: true,
  },
  stability: {
    title: 'Stability AI',
    keyName: 'STABILITY_API_KEY',
    models: [{ id: 'stable-image-ultra', name: 'Stable Image Ultra' }],
    edits: false,
  },
  fal: {
    title: 'fal',
    keyName: 'FAL_KEY',
    models: [{ id: 'flux-schnell', name: 'FLUX.1 schnell' }],
    edits: false,
  },
};
