// den/src/agent/tools/visualTools.js
// Agent-facing tools for local image generation runtimes.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { PermissionLevel } from './toolRegistry.js';
import { getWorkspaceRoot } from '../../files/fileExplorerService.js';
import { checkSdCpp, generateSdCppImage } from '../../ai/controllers/ai/sdCppManager.js';
import { checkComfyUi, editComfyUiImage, generateComfyUiImage } from '../../ai/controllers/ai/comfyUiManager.js';

const GENERATED_DIR = path.join(getWorkspaceRoot(), 'den', 'data', 'generated', 'images');

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

function imageResultPayload(result, fallbackPrompt) {
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

  const relativePath = imagePath && imagePath.startsWith(workspaceRoot)
    ? path.relative(workspaceRoot, imagePath)
    : null;

  return {
    success: true,
    runtime: result.runtime,
    prompt: fallbackPrompt,
    imagePath,
    image: relativePath ? null : result.image,
    media: {
      type: 'image',
      rootId: relativePath ? 'workspace' : null,
      path: relativePath,
      absolutePath: imagePath || null,
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
  };
}

export const generateImageTool = {
  name: 'generate_image',
  description:
    'Generate an image using a configured local image runtime. Supports stable-diffusion.cpp ("simple") and ComfyUI ("comfyui"). ' +
    'Use this when the user asks to create, draw, render, or generate an image.',
  category: 'visual',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Detailed image prompt.' },
      negative_prompt: { type: 'string', description: 'Things to avoid in the image.' },
      engine: { type: 'string', description: 'Image engine: "auto", "simple", or "comfyui". Default: auto.' },
      model_path: { type: 'string', description: 'For simple engine: absolute image model path. If omitted, the first indexed model is used.' },
      checkpoint: { type: 'string', description: 'For ComfyUI: checkpoint name. If omitted, the first checkpoint is used.' },
      width: { type: 'number', description: 'Image width, 256-2048. Default 768 for ComfyUI, 512 for simple.' },
      height: { type: 'number', description: 'Image height, 256-2048. Default 768 for ComfyUI, 512 for simple.' },
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

    const engine = ['simple', 'comfyui'].includes(args.engine) ? args.engine : 'auto';
    const width = clampInt(args.width, engine === 'simple' ? 512 : 768, 256, 2048);
    const height = clampInt(args.height, engine === 'simple' ? 512 : 768, 256, 2048);
    const negativePrompt = String(args.negative_prompt || '').trim();
    const common = {
      prompt,
      negativePrompt,
      width,
      height,
      steps: args.steps,
      cfg: args.cfg,
      sampler: args.sampler,
      scheduler: args.scheduler,
      seed: args.seed,
    };

    try {
      if (engine === 'simple') {
        const status = await checkSdCpp();
        const modelPath = String(args.model_path || status.models?.[0]?.path || '').trim();
        if (!status.found) return { success: false, error: status.error || 'Simple image engine is not available.' };
        if (!modelPath) return { success: false, error: 'No indexed image model is available for the simple engine.' };
        const result = await generateSdCppImage({ ...common, modelPath });
        return imageResultPayload(result, prompt);
      }

      if (engine === 'comfyui') {
        const status = await checkComfyUi();
        if (!status.found) return { success: false, error: status.error || 'ComfyUI is not available.' };
        const result = await generateComfyUiImage({ ...common, checkpoint: args.checkpoint });
        return imageResultPayload(result, prompt);
      }

      const comfy = await checkComfyUi();
      if (comfy.found) {
        const result = await generateComfyUiImage({ ...common, checkpoint: args.checkpoint });
        return imageResultPayload(result, prompt);
      }

      const simple = await checkSdCpp();
      if (!simple.found) {
        return {
          success: false,
          error: 'No image generation runtime is available. Start ComfyUI or install/configure stable-diffusion.cpp and add an image model on the Models page.',
        };
      }
      const modelPath = String(args.model_path || simple.models?.[0]?.path || '').trim();
      if (!modelPath) return { success: false, error: 'No indexed image model is available for the simple engine.' };
      const result = await generateSdCppImage({ ...common, modelPath });
      return imageResultPayload(result, prompt);
    } catch (err) {
      return { success: false, error: err.message || 'Image generation failed.' };
    }
  },
};

export const editImageTool = {
  name: 'edit_image',
  description:
    'Edit or transform an existing image using image-to-image. Requires ComfyUI to be running with a checkpoint. Use this when the user asks to modify an attached or workspace image.',
  category: 'visual',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Input image path relative to working directory.' },
      prompt: { type: 'string', description: 'Description of the desired edit/transformation.' },
      negative_prompt: { type: 'string', description: 'Things to avoid in the edited image.' },
      checkpoint: { type: 'string', description: 'Optional ComfyUI checkpoint name.' },
      strength: { type: 'number', description: 'Edit strength/denoise, 0.05-1.0. Lower preserves more of the source image. Default 0.55.' },
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
    const inputPath = path.resolve(context.workingDir, args.path || '');
    if (!inputPath.startsWith(path.resolve(context.workingDir))) {
      return { success: false, error: `Path "${args.path}" is outside the working directory.` };
    }
    if (!fs.existsSync(inputPath)) return { success: false, error: `Input image not found: ${args.path}` };

    const comfy = await checkComfyUi();
    if (!comfy.found) {
      return {
        success: false,
        error: 'Image editing requires ComfyUI. Start ComfyUI, make sure a checkpoint is available, then try again.',
        details: comfy.error || null,
      };
    }

    try {
      const result = await editComfyUiImage({
        imagePath: inputPath,
        prompt,
        negativePrompt: args.negative_prompt || '',
        checkpoint: args.checkpoint,
        strength: args.strength,
        steps: args.steps,
        cfg: args.cfg,
        sampler: args.sampler,
        scheduler: args.scheduler,
        seed: args.seed,
      });
      return {
        ...imageResultPayload(result, prompt),
        sourcePath: args.path,
        mode: 'image-to-image',
        strength: result.strength,
      };
    } catch (err) {
      return { success: false, error: err.message || 'Image edit failed.' };
    }
  },
};

export const visualTools = [generateImageTool, editImageTool];
export default visualTools;
