// den/src/agent/tools/visualTools.js
// Agent tools that make and edit pictures: with stable-diffusion.cpp or
// ComfyUI on this computer, or a cloud service (OpenAI, Gemini, Stability,
// fal) chosen in Models → Images. Every picture lands in the gallery folder
// with a note of what it was made from (media/gallery.js).

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { PermissionLevel } from './toolRegistry.js';
import { getWorkspaceRoot } from '../../files/fileExplorerService.js';
import { runtimeGeneratedImagesPath } from '../../config/runtimeConfig.js';
import { checkSdCpp, generateSdCppImage } from '../../ai/controllers/ai/sdCppManager.js';
import { checkComfyUi, editComfyUiImage, generateComfyUiImage } from '../../ai/controllers/ai/comfyUiManager.js';
import { isDrawableImageModel } from '../../ai/controllers/ai/visualModelManager.js';
import { CLOUD_IMAGE, COMFYUI_DEFAULTS } from '../../media/imageCatalog.js';
import { galleryFile, galleryUrl, recordGalleryImage } from '../../media/gallery.js';

const GENERATED_DIR = runtimeGeneratedImagesPath();

function clampInt(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function dataUrlToBuffer(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function mimeForFile(file) {
  const ext = path.extname(String(file)).toLowerCase();
  return ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
}

/** The model a local picture is drawn with: the chosen one, else the first indexed one. */
function localImageModel(status, requested) {
  const asked = String(requested || '').trim();
  if (asked) return asked;
  const saved = String(process.env.ASYNCAT_IMAGE_MODEL || '').trim();
  if (saved && fs.existsSync(saved) && isDrawableImageModel(saved)) return saved;
  return String(status?.models?.[0]?.path || '').trim();
}

function imageResultPayload(result, fallbackPrompt, extra = {}) {
  const workspaceRoot = getWorkspaceRoot();
  let imagePath = result.imagePath || '';

  if (!imagePath && result.image) {
    const decoded = dataUrlToBuffer(result.image);
    if (decoded?.buffer?.length) {
      fs.mkdirSync(GENERATED_DIR, { recursive: true });
      imagePath = path.join(GENERATED_DIR, `agent_${randomUUID()}.png`);
      fs.writeFileSync(imagePath, decoded.buffer);
    }
  }

  recordGalleryImage(imagePath, {
    prompt: fallbackPrompt,
    runtime: result.runtime,
    model: result.modelPath || result.checkpoint || result.model || null,
    width: result.width,
    height: result.height,
    seed: result.seed,
    editedFrom: extra.editedFrom || null,
  });
  const inGallery = imagePath && path.dirname(path.resolve(imagePath)) === path.resolve(GENERATED_DIR);
  const url = inGallery ? galleryUrl(path.basename(imagePath)) : null;

  const relativePath = imagePath && imagePath.startsWith(workspaceRoot)
    ? path.relative(workspaceRoot, imagePath)
    : null;

  return {
    success: true,
    runtime: result.runtime,
    prompt: fallbackPrompt,
    imagePath,
    // The picture travels as a link the app can load; inline data only when
    // there is no link.
    image: relativePath || url ? null : result.image,
    media: {
      type: 'image',
      rootId: relativePath ? 'workspace' : null,
      path: relativePath,
      absolutePath: imagePath || null,
      url,
      mime: result.mimeType || 'image/png',
      width: result.width,
      height: result.height,
      seed: result.seed,
      runtime: result.runtime,
      prompt: fallbackPrompt,
    },
    seed: result.seed,
    width: result.width,
    height: result.height,
    steps: result.steps,
    cfg: result.cfg,
    modelPath: result.modelPath || null,
    checkpoint: result.checkpoint || null,
    model: result.model || null,
  };
}

function saveCloudImage(buffer, mimeType) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const ext = mimeType?.includes('png') ? 'png' : mimeType?.includes('webp') ? 'webp' : 'jpg';
  const imagePath = path.join(GENERATED_DIR, `agent_${randomUUID()}.${ext}`);
  fs.writeFileSync(imagePath, buffer);
  return imagePath;
}

function requireKey(name, title) {
  const key = String(process.env[name] || '').trim();
  if (!key) throw new Error(`${title} is chosen for pictures, but its key isn't saved. Add it in Models → Images.`);
  return key;
}

async function fetchImageBuffer(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`Couldn't fetch the picture (${r.status}).`);
  return { buffer: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get('content-type') || 'image/png' };
}

function openAiSize(width, height) {
  if (width / height > 1.25) return '1536x1024';
  if (height / width > 1.25) return '1024x1536';
  return '1024x1024';
}

async function openAiImage({ prompt, negativePrompt, width, height, input = null }) {
  const key = requireKey('OPENAI_API_KEY', 'OpenAI');
  const model = String(process.env.OPENAI_IMAGE_MODEL || CLOUD_IMAGE.openai.defaultModel);
  const text = negativePrompt ? `${prompt}. Avoid: ${negativePrompt}` : prompt;
  const legacy = /^dall-e/i.test(model);
  let r;
  if (input) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', text);
    form.append('image', new Blob([fs.readFileSync(input)], { type: mimeForFile(input) }), path.basename(input));
    r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(180_000),
    });
  } else {
    r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: text,
        n: 1,
        size: legacy ? '1024x1024' : openAiSize(width, height),
        ...(legacy ? { response_format: 'b64_json' } : {}),
      }),
      signal: AbortSignal.timeout(180_000),
    });
  }
  if (!r.ok) throw new Error(`OpenAI ${input ? 'image edit' : 'image generation'} failed: ${await r.text().catch(() => r.statusText)}`);
  const json = await r.json();
  const item = json.data?.[0];
  if (item?.b64_json) return { buffer: Buffer.from(item.b64_json, 'base64'), mimeType: 'image/png', model };
  if (item?.url) {
    const fetched = await fetchImageBuffer(item.url);
    return { buffer: fetched.buffer, mimeType: fetched.contentType, model };
  }
  throw new Error('OpenAI returned no picture.');
}

async function geminiImage({ prompt, negativePrompt, input = null }) {
  const key = requireKey('GEMINI_API_KEY', 'Gemini');
  const model = String(process.env.GEMINI_IMAGE_MODEL || CLOUD_IMAGE.gemini.defaultModel);
  const parts = [];
  if (input) parts.push({ inlineData: { mimeType: mimeForFile(input), data: fs.readFileSync(input).toString('base64') } });
  parts.push({ text: negativePrompt ? `${prompt}. Avoid: ${negativePrompt}` : prompt });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) throw new Error(`Gemini ${input ? 'image edit' : 'image generation'} failed: ${await r.text().catch(() => r.statusText)}`);
  const json = await r.json();
  const image = (json.candidates?.[0]?.content?.parts || []).find((part) => part.inlineData?.data || part.inline_data?.data);
  const data = image?.inlineData || image?.inline_data;
  if (!data?.data) {
    const said = (json.candidates?.[0]?.content?.parts || []).map((part) => part.text).filter(Boolean).join(' ');
    throw new Error(`Gemini returned no picture${said ? `: ${said.slice(0, 300)}` : '.'}`);
  }
  return { buffer: Buffer.from(data.data, 'base64'), mimeType: data.mimeType || data.mime_type || 'image/png', model };
}

async function generateWithCloudImageProvider(providerId, params) {
  const { prompt, negativePrompt = '', width = 1024, height = 1024, steps, seed } = params;
  let buffer;
  let mimeType;
  let resultWidth = width;
  let resultHeight = height;
  let resultSeed;
  let model = null;

  if (providerId === 'openai') {
    ({ buffer, mimeType, model } = await openAiImage({ prompt, negativePrompt, width, height }));
    [resultWidth, resultHeight] = openAiSize(width, height).split('x').map(Number);
  } else if (providerId === 'gemini') {
    ({ buffer, mimeType, model } = await geminiImage({ prompt, negativePrompt }));
    resultWidth = null;
    resultHeight = null;
  } else if (providerId === 'fal') {
    const imageSize = (width / height > 1.4) ? 'landscape_16_9' : (height / width > 1.4) ? 'portrait_16_9' : 'square_hd';
    const r = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: { Authorization: `Key ${requireKey('FAL_KEY', 'fal')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size: imageSize, num_inference_steps: steps || 4, num_images: 1, enable_safety_checker: true, ...(seed != null ? { seed } : {}) }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) throw new Error(`fal.ai image generation failed: ${await r.text().catch(() => r.statusText)}`);
    const json = await r.json();
    const img = json.images?.[0];
    if (!img?.url) throw new Error('fal.ai returned no image.');
    const fetched = await fetchImageBuffer(img.url);
    buffer = fetched.buffer; mimeType = img.content_type || 'image/jpeg';
    resultWidth = img.width || width; resultHeight = img.height || height; resultSeed = json.seed; model = 'flux-schnell';
  } else if (providerId === 'stability') {
    const form = new FormData();
    form.append('prompt', prompt);
    if (negativePrompt) form.append('negative_prompt', negativePrompt);
    form.append('output_format', 'png');
    form.append('aspect_ratio', (width / height > 1.4) ? '16:9' : (height / width > 1.4) ? '9:16' : '1:1');
    if (seed != null) form.append('seed', String(seed));
    const r = await fetch('https://api.stability.ai/v2beta/stable-image/generate/ultra', {
      method: 'POST',
      headers: { Authorization: `Bearer ${requireKey('STABILITY_API_KEY', 'Stability AI')}`, Accept: 'image/*' },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) throw new Error(`Stability AI image generation failed: ${await r.text().catch(() => r.statusText)}`);
    buffer = Buffer.from(await r.arrayBuffer()); mimeType = 'image/png'; model = 'stable-image-ultra';
    const sh = r.headers.get('seed'); if (sh) resultSeed = parseInt(sh, 10);
  } else {
    throw new Error(`Cloud image provider "${providerId}" is not supported.`);
  }

  const imagePath = saveCloudImage(buffer, mimeType);
  return { imagePath, mimeType, width: resultWidth, height: resultHeight, seed: resultSeed, runtime: providerId, model };
}

export const generateImageTool = {
  name: 'generate_image',
  description:
    'Make a picture from a description, with the image engine chosen in Models → Images (on this computer or a cloud service). ' +
    'Use this when the user asks to create, draw, render, or generate an image.',
  category: 'visual',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed image prompt.' },
      negative_prompt: { type: 'string', description: 'Things to avoid in the image.' },
      engine: { type: 'string', description: 'Image engine: "auto" (the chosen one), "simple" (stable-diffusion.cpp), or "comfyui". Default: auto.' },
      model_path: { type: 'string', description: 'For simple engine: absolute image model path. If omitted, the chosen model is used.' },
      checkpoint: { type: 'string', description: 'For ComfyUI: checkpoint name. If omitted, the first checkpoint is used.' },
      width: { type: 'number', description: 'Image width, 256-2048. Defaults suit the model.' },
      height: { type: 'number', description: 'Image height, 256-2048. Defaults suit the model.' },
      steps: { type: 'number', description: 'Sampling steps.' },
      cfg: { type: 'number', description: 'Classifier-free guidance scale.' },
      sampler: { type: 'string', description: 'Optional sampler name.' },
      scheduler: { type: 'string', description: 'Optional ComfyUI scheduler.' },
      seed: { type: 'number', description: 'Optional deterministic seed.' },
    },
    required: ['prompt'],
  },
  execute: async (args) => {
    const prompt = String(args.prompt || '').trim();
    if (!prompt) return { success: false, error: 'prompt is required' };

    // A cloud service chosen in Models → Images wins, unless the call asks
    // for a local engine.
    const chosen = String(process.env.ASYNCAT_IMAGE_PROVIDER || '').trim() || 'local';
    const cloudProvider = chosen === 'local' || chosen === 'comfyui' ? '' : chosen;
    if (cloudProvider && args.engine !== 'simple' && args.engine !== 'comfyui') {
      try {
        const width = clampInt(args.width, 1024, 256, 2048);
        const height = clampInt(args.height, 1024, 256, 2048);
        const result = await generateWithCloudImageProvider(cloudProvider, {
          prompt,
          negativePrompt: String(args.negative_prompt || '').trim(),
          width,
          height,
          steps: args.steps,
          seed: args.seed,
        });
        return imageResultPayload(result, prompt);
      } catch (err) {
        return { success: false, error: err.message || 'Cloud image generation failed.' };
      }
    }

    // auto: the chosen engine on this computer, then the other one.
    const engine = ['simple', 'comfyui'].includes(args.engine) ? args.engine : (chosen === 'comfyui' ? 'comfyui-first' : 'auto');
    const negativePrompt = String(args.negative_prompt || '').trim();
    const common = {
      prompt,
      negativePrompt,
      // Unset sizes and steps take the model's own defaults.
      width: args.width,
      height: args.height,
      steps: args.steps,
      cfg: args.cfg,
      sampler: args.sampler,
      scheduler: args.scheduler,
      seed: args.seed,
    };

    try {
      if (engine === 'simple' || engine === 'auto') {
        const simple = await checkSdCpp();
        const modelPath = localImageModel(simple, args.model_path);
        // auto: the built-in engine when it has a model, else ComfyUI.
        if (simple.found && modelPath) {
          const result = await generateSdCppImage({ ...common, modelPath });
          return imageResultPayload(result, prompt);
        }
        if (engine === 'simple') {
          if (!simple.found) return { success: false, error: simple.error || 'The built-in image engine is not installed. Set up images in Models → Images.' };
          return { success: false, error: 'No image model yet. Set up images in Models → Images.' };
        }
      }

      const comfy = await checkComfyUi();
      if (comfy.found) {
        const result = await generateComfyUiImage({
          ...common,
          width: clampInt(args.width, COMFYUI_DEFAULTS.width, 256, 2048),
          height: clampInt(args.height, COMFYUI_DEFAULTS.height, 256, 2048),
          checkpoint: args.checkpoint,
        });
        return imageResultPayload(result, prompt);
      }
      if (engine === 'comfyui-first') {
        const simple = await checkSdCpp();
        const modelPath = localImageModel(simple, args.model_path);
        if (simple.found && modelPath) return imageResultPayload(await generateSdCppImage({ ...common, modelPath }), prompt);
      }
      return {
        success: false,
        error: engine === 'comfyui'
          ? (comfy.error || 'ComfyUI is not running.')
          : "Images aren't set up yet. Set up images in Models → Images (on this computer or with a cloud service).",
      };
    } catch (err) {
      return { success: false, error: err.message || 'Image generation failed.' };
    }
  },
};

/** The picture to edit: a file in the working folder, or one from the gallery (by name or link). */
function resolveEditInput(raw, workingDir) {
  const value = String(raw || '').trim();
  const fromGallery = galleryFile(decodeURIComponent(value.replace(/^.*\/gallery\/file\//, '')));
  if (fromGallery) return { file: fromGallery };
  const inputPath = path.resolve(workingDir, value);
  if (!inputPath.startsWith(path.resolve(workingDir))) return { error: `Path "${value}" is outside the working directory.` };
  if (!fs.existsSync(inputPath)) return { error: `Input image not found: ${value}` };
  return { file: inputPath };
}

export const editImageTool = {
  name: 'edit_image',
  description:
    'Change an existing picture following a description: a file in the working folder or a picture from the gallery (its name or link). ' +
    'Works with the image engine chosen in Models → Images (OpenAI, Gemini, stable-diffusion.cpp or ComfyUI).',
  category: 'visual',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The picture: a path relative to the working directory, or a gallery picture name.' },
      prompt: { type: 'string', description: 'Description of the desired edit/transformation.' },
      negative_prompt: { type: 'string', description: 'Things to avoid in the edited image.' },
      checkpoint: { type: 'string', description: 'Optional ComfyUI checkpoint name.' },
      strength: { type: 'number', description: 'For engines on this computer: how much to change, 0.05-1.0. Lower keeps more of the picture. Default 0.55.' },
      steps: { type: 'number', description: 'Sampling steps.' },
      cfg: { type: 'number', description: 'Guidance scale.' },
      sampler: { type: 'string', description: 'Optional sampler.' },
      scheduler: { type: 'string', description: 'Optional scheduler.' },
      seed: { type: 'number', description: 'Optional deterministic seed.' },
    },
    required: ['path', 'prompt'],
  },
  execute: async (args, context) => {
    const prompt = String(args.prompt || '').trim();
    if (!prompt) return { success: false, error: 'prompt is required' };
    const input = resolveEditInput(args.path, context.workingDir || process.cwd());
    if (input.error) return { success: false, error: input.error };
    const editedFrom = input.file;
    const negativePrompt = String(args.negative_prompt || '').trim();

    try {
      const chosen = String(process.env.ASYNCAT_IMAGE_PROVIDER || '').trim() || 'local';
      const cloudProvider = chosen === 'local' || chosen === 'comfyui' ? '' : chosen;
      if (cloudProvider === 'openai' || cloudProvider === 'gemini') {
        const made = cloudProvider === 'openai'
          ? await openAiImage({ prompt, negativePrompt, width: 1024, height: 1024, input: editedFrom })
          : await geminiImage({ prompt, negativePrompt, input: editedFrom });
        const imagePath = saveCloudImage(made.buffer, made.mimeType);
        return {
          ...imageResultPayload({ imagePath, mimeType: made.mimeType, runtime: cloudProvider, model: made.model }, prompt, { editedFrom }),
          sourcePath: args.path,
          mode: 'image-to-image',
        };
      }
      if (cloudProvider) {
        return { success: false, error: `${CLOUD_IMAGE[cloudProvider]?.title || cloudProvider} can't edit pictures. Choose OpenAI, Gemini or an engine on this computer in Models → Images.` };
      }

      // The built-in engine edits when it is the choice and has a model;
      // ComfyUI when it is chosen or the only one running.
      const simpleFirst = chosen !== 'comfyui' ? await checkSdCpp() : null;
      const simpleModel = simpleFirst ? localImageModel(simpleFirst, null) : null;
      const comfy = simpleFirst?.found && simpleModel ? { found: false } : await checkComfyUi();
      if (comfy.found) {
        const result = await editComfyUiImage({
          imagePath: editedFrom,
          prompt,
          negativePrompt,
          checkpoint: args.checkpoint,
          strength: args.strength,
          steps: args.steps,
          cfg: args.cfg,
          sampler: args.sampler,
          scheduler: args.scheduler,
          seed: args.seed,
        });
        return { ...imageResultPayload(result, prompt, { editedFrom }), sourcePath: args.path, mode: 'image-to-image', strength: result.strength };
      }

      const simple = await checkSdCpp();
      const modelPath = localImageModel(simple, null);
      if (!simple.found || !modelPath) {
        return { success: false, error: 'Editing pictures needs images set up (Models → Images): on this computer, or OpenAI or Gemini.' };
      }
      const result = await generateSdCppImage({
        prompt,
        negativePrompt,
        modelPath,
        initImage: editedFrom,
        strength: args.strength,
        steps: args.steps,
        cfg: args.cfg,
        sampler: args.sampler,
        seed: args.seed,
      });
      return { ...imageResultPayload(result, prompt, { editedFrom }), sourcePath: args.path, mode: 'image-to-image', strength: result.strength };
    } catch (err) {
      return { success: false, error: err.message || 'Image edit failed.' };
    }
  },
};

export const visualTools = [generateImageTool, editImageTool];
export default visualTools;
