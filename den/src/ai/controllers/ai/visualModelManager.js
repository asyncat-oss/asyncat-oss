// visualModelManager.js — local vision and image-generation asset catalog

import fs from 'fs';
import path from 'path';
import db from '../../../db/client.js';
import { MODELS_DIR, onDownloadComplete } from './modelManager.js';

const VISION_DIR = path.join(MODELS_DIR, 'vision');
const IMAGE_DIR = path.join(MODELS_DIR, 'image');

const TYPE_CONFIG = {
  vision: {
    dir: VISION_DIR,
    extensions: ['.gguf', '.bin', '.mmproj', '.safetensors', '.json'],
    engineType: 'vision',
  },
  image: {
    dir: IMAGE_DIR,
    extensions: ['.safetensors', '.ckpt', '.gguf', '.onnx', '.pt', '.pth', '.bin', '.json'],
    engineType: 'image',
  },
};

fs.mkdirSync(VISION_DIR, { recursive: true });
fs.mkdirSync(IMAGE_DIR, { recursive: true });

let cachedVisualModels = null;
let lastVisualScan = 0;
const VISUAL_CACHE_TTL = 10000;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1e6;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1e3;
  return `${kb.toFixed(0)} KB`;
}

function extensionFor(filename = '') {
  const lower = String(filename).toLowerCase();
  if (lower.endsWith('.onnx.json')) return '.onnx.json';
  return path.extname(lower);
}

function isAllowedFile(filename, type) {
  const config = TYPE_CONFIG[type];
  if (!config) return false;
  const lower = String(filename || '').toLowerCase();
  return config.extensions.some(ext => lower.endsWith(ext));
}

// A whole image model is about 2 GB or more (SD 1.5 at fp16); a VAE is about
// 330 MB and a LoRA rarely passes 1 GB. A file this big is a model, whatever
// its name says ("floralMix", "realisticVision_v51VAE").
const WHOLE_MODEL_BYTES = 1.8e9;

// A whole model that says how its VAE is: "…BakedVae", "…_with_vae",
// "…-no-vae", the official "sd_xl_base_1.0_0.9vae".
const VAE_IN_MODEL = /baked[_\-. ]?vae|with(out)?[_\-. ]?vae|no[_\-. ]vae|[_\-. ]0\.9vae/;

function classifyAsset(filename, type, sizeBytes = 0) {
  const lower = String(filename || '').toLowerCase();
  if (type === 'vision') {
    if (lower.includes('mmproj') || lower.endsWith('.mmproj')) return 'Projector';
    if (lower.includes('clip') || lower.includes('siglip')) return 'Vision encoder';
    if (lower.endsWith('.json')) return 'Config';
    return 'Vision model';
  }

  // A LoRA or VAE says so anywhere in its name ("sdxlVAE", "detailTweakerLora").
  const big = sizeBytes >= WHOLE_MODEL_BYTES;
  if (lower.includes('control')) return 'ControlNet';
  if (/lora|locon|loha|lokr|lycoris/.test(lower) && !big) return 'LoRA';
  if (lower.includes('vae') && !big && !VAE_IN_MODEL.test(lower)) return 'VAE';
  if (lower.endsWith('.json')) return 'Config';
  return 'Image model';
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

const DRAWABLE_EXTENSIONS = /\.(safetensors|ckpt|gguf|bin)$/i;

/**
 * Whether stable-diffusion.cpp can draw with an image file (a path or a
 * listed model): a whole image model, not a LoRA, VAE, ControlNet or
 * settings file.
 */
export function isDrawableImageModel(fileOrModel) {
  const model = typeof fileOrModel === 'string' ? { path: fileOrModel } : fileOrModel;
  if (!model?.path || model.isMissing) return false;
  const filename = model.filename || path.basename(model.path);
  const kind = model.assetKind || classifyAsset(filename, 'image', model.sizeBytes ?? fileSize(model.path));
  return kind === 'Image model' && DRAWABLE_EXTENSIONS.test(filename);
}

function normalizeModel(type, filePath, stat, extra = {}) {
  const filename = path.basename(filePath);
  return {
    id: extra.id || filename,
    name: extra.name || filename.replace(/(\.onnx\.json|\.(safetensors|ckpt|gguf|onnx|pt|pth|bin|json|mmproj))$/i, ''),
    type,
    engineType: TYPE_CONFIG[type]?.engineType || type,
    assetKind: classifyAsset(filename, type, stat?.size),
    extension: extensionFor(filename),
    filename,
    path: filePath,
    sizeBytes: stat?.size || 0,
    sizeFormatted: stat ? formatBytes(stat.size) : '',
    createdAt: extra.createdAt || stat?.birthtime?.toISOString?.() || new Date().toISOString(),
    modifiedAt: stat?.mtime?.toISOString?.() || extra.createdAt || null,
    ...extra,
  };
}

function listType(type) {
  const config = TYPE_CONFIG[type];
  if (!config) return [];

  const diskModels = fs.existsSync(config.dir)
    ? fs.readdirSync(config.dir)
      .filter(filename => isAllowedFile(filename, type))
      .map(filename => {
        const filePath = path.join(config.dir, filename);
        const stat = fs.statSync(filePath);
        return normalizeModel(type, filePath, stat);
      })
    : [];

  const customEntries = db.prepare('SELECT * FROM custom_model_paths WHERE type = ?').all(type);
  const customModels = customEntries.map(entry => {
    const modelPath = (entry.path || '').trim();
    try {
      const stat = fs.statSync(modelPath);
      return normalizeModel(type, modelPath, stat, {
        id: entry.id,
        name: entry.name,
        isExternal: true,
        createdAt: entry.created_at,
      });
    } catch {
      return {
        id: entry.id,
        type,
        engineType: config.engineType,
        isExternal: true,
        isMissing: true,
        name: entry.name,
        filename: path.basename(modelPath),
        path: modelPath,
        assetKind: classifyAsset(modelPath, type),
        error: 'File not found',
        createdAt: entry.created_at,
      };
    }
  });

  const combined = [...diskModels, ...customModels].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const seenPaths = new Set();
  return combined.filter(model => {
    const normalized = (model.path || '').replace(/[\\/]+$/, '');
    if (seenPaths.has(normalized)) return false;
    seenPaths.add(normalized);
    return true;
  });
}

export function listVisualModels() {
  const now = Date.now();
  if (cachedVisualModels && now - lastVisualScan < VISUAL_CACHE_TTL) {
    return cachedVisualModels;
  }

  cachedVisualModels = {
    vision: listType('vision'),
    // drawable: stable-diffusion.cpp can draw with it, so it can be chosen.
    image: listType('image').map(model => ({ ...model, drawable: isDrawableImageModel(model) })),
  };
  lastVisualScan = now;
  return cachedVisualModels;
}

/** The file deleteVisualModel removes, or null for a model added from another folder (only forgotten). */
export function visualModelFile(id, type) {
  if (!TYPE_CONFIG[type]) return null;
  if (db.prepare('SELECT id FROM custom_model_paths WHERE id = ? AND type = ?').get(id, type)) return null;
  return path.join(TYPE_CONFIG[type].dir, path.basename(String(id)));
}

export function deleteVisualModel(id, type) {
  if (!TYPE_CONFIG[type]) throw new Error('Type must be "vision" or "image"');

  const filePath = visualModelFile(id, type);
  if (!filePath) {
    db.prepare('DELETE FROM custom_model_paths WHERE id = ? AND type = ?').run(id, type);
    clearCache(type);
    return { success: true };
  }

  if (!fs.existsSync(filePath)) throw new Error(`Visual model not found: ${id}`);
  fs.unlinkSync(filePath);
  clearCache(type);
  return { success: true };
}

export function clearCache() {
  cachedVisualModels = null;
  lastVisualScan = 0;
}

// A finished download shows up at once.
onDownloadComplete(() => clearCache());

export { VISION_DIR, IMAGE_DIR };
