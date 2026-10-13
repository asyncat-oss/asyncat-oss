// den/src/media/gallery.js
// Every picture Asyncat makes lands in one folder (runtimeGeneratedImagesPath,
// data/generated/images unless IMAGEGEN_OUTPUT_PATH says otherwise). Next to
// each one a small .json keeps what it was made from (prompt, engine, model,
// size, seed), so the gallery can show and reuse it.

import fs from 'fs';
import path from 'path';
import { runtimeGeneratedImagesPath } from '../config/runtimeConfig.js';

const IMAGE_FILE = /\.(png|jpe?g|webp)$/i;

export function galleryDir() {
  return runtimeGeneratedImagesPath();
}

/** The address the app loads a gallery picture from. */
export function galleryUrl(name) {
  return `/api/media/gallery/file/${encodeURIComponent(name)}`;
}

/** A picture's full path if `name` is one in the gallery folder, else null. */
export function galleryFile(name) {
  const base = path.basename(String(name || ''));
  if (!base || base !== String(name) || !IMAGE_FILE.test(base)) return null;
  const file = path.join(galleryDir(), base);
  return fs.existsSync(file) ? file : null;
}

/** Remember what a picture was made from. Ignores pictures outside the gallery. */
export function recordGalleryImage(imagePath, meta = {}) {
  try {
    const dir = path.resolve(galleryDir());
    const file = path.resolve(String(imagePath || ''));
    if (path.dirname(file) !== dir || !fs.existsSync(file)) return null;
    const record = {
      prompt: meta.prompt ? String(meta.prompt).slice(0, 4000) : null,
      runtime: meta.runtime || null,
      model: meta.model ? path.basename(String(meta.model)) : null,
      width: Number(meta.width) || null,
      height: Number(meta.height) || null,
      seed: meta.seed ?? null,
      editedFrom: meta.editedFrom ? path.basename(String(meta.editedFrom)) : null,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(`${file}.json`, JSON.stringify(record, null, 2));
    return record;
  } catch {
    return null;
  }
}

function readMeta(file) {
  try {
    return JSON.parse(fs.readFileSync(`${file}.json`, 'utf8'));
  } catch {
    return {};
  }
}

/** Pictures, newest first: { name, url, bytes, createdAt, prompt, … }. */
export function listGallery({ limit = 60, offset = 0 } = {}) {
  const dir = galleryDir();
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => IMAGE_FILE.test(name));
  } catch {
    return { images: [], total: 0 };
  }
  const items = names.map((name) => {
    const file = path.join(dir, name);
    let stat = null;
    try { stat = fs.statSync(file); } catch { /* gone */ }
    return stat?.isFile() ? { name, file, stat } : null;
  }).filter(Boolean);
  items.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const start = Math.max(0, Number(offset) || 0);
  const count = Math.min(200, Math.max(1, Number(limit) || 60));
  return {
    total: items.length,
    images: items.slice(start, start + count).map(({ name, file, stat }) => {
      const meta = readMeta(file);
      return {
        name,
        url: galleryUrl(name),
        bytes: stat.size,
        createdAt: meta.createdAt || stat.mtime.toISOString(),
        prompt: meta.prompt || null,
        runtime: meta.runtime || null,
        model: meta.model || null,
        width: meta.width || null,
        height: meta.height || null,
        seed: meta.seed ?? null,
        editedFrom: meta.editedFrom || null,
      };
    }),
  };
}

export function deleteGalleryImage(name) {
  const file = galleryFile(name);
  if (!file) return false;
  fs.unlinkSync(file);
  try { fs.unlinkSync(`${file}.json`); } catch { /* no notes */ }
  return true;
}
