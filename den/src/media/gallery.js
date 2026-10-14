// den/src/media/gallery.js
// Every picture Asyncat makes lands in one folder (runtimeGeneratedImagesPath,
// data/generated/images unless IMAGEGEN_OUTPUT_PATH says otherwise). Next to
// each one a small .json keeps what it was made from (prompt, engine, model,
// size, seed), so the gallery can show and reuse it.

import fs from 'fs';
import path from 'path';
import { runtimeGeneratedImagesPath } from '../config/runtimeConfig.js';
import { plainFileIn } from '../storage/safeFs.js';

const IMAGE_FILE = /\.(png|jpe?g|webp)$/i;

export function galleryDir() {
  return runtimeGeneratedImagesPath();
}

/** The address the app loads a gallery picture from. */
export function galleryUrl(name) {
  return `/api/media/gallery/file/${encodeURIComponent(name)}`;
}

/**
 * A picture's full path if `name` is one in the gallery folder, else null.
 * Only a regular file there counts: a link is never served, whatever it
 * points at.
 */
export function galleryFile(name) {
  const value = String(name ?? '');
  if (!IMAGE_FILE.test(value)) return null;
  return plainFileIn(galleryDir(), value)?.file || null;
}

// A picture's notes file, when there is one that is a regular file. A link in
// its place is neither read nor written through.
function notesFile(file) {
  return plainFileIn(path.dirname(file), `${path.basename(file)}.json`)?.file || null;
}

/** Remember what a picture was made from. Ignores pictures outside the gallery. */
export function recordGalleryImage(imagePath, meta = {}) {
  try {
    const dir = path.resolve(galleryDir());
    const file = path.resolve(String(imagePath || ''));
    if (path.dirname(file) !== dir || !plainFileIn(dir, path.basename(file))) return null;
    const notes = `${file}.json`;
    if (isThere(notes) && !notesFile(file)) return null;
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
    fs.writeFileSync(notes, JSON.stringify(record, null, 2));
    return record;
  } catch {
    return null;
  }
}

// Anything at all at this path, a broken link included.
function isThere(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

function readMeta(file) {
  const notes = notesFile(file);
  if (!notes) return {};
  try {
    return JSON.parse(fs.readFileSync(notes, 'utf8'));
  } catch {
    return {};
  }
}

/** The picture files, newest first: [{ name, file, stat }]. */
function galleryEntries() {
  const dir = galleryDir();
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => IMAGE_FILE.test(name));
  } catch {
    return [];
  }
  const items = names.map((name) => {
    const found = plainFileIn(dir, name);
    return found ? { name, file: found.file, stat: found.stat } : null;
  }).filter(Boolean);
  return items.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}

function describe({ name, file, stat }) {
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
}

/** Pictures, newest first: { name, url, bytes, createdAt, prompt, … }, at most 200 at a time. */
export function listGallery({ limit = 60, offset = 0 } = {}) {
  const items = galleryEntries();
  const start = Math.max(0, Number(offset) || 0);
  const count = Math.min(200, Math.max(1, Number(limit) || 60));
  return { total: items.length, images: items.slice(start, start + count).map(describe) };
}

/**
 * Every picture, newest first, for lists that page through them themselves:
 * [{ name, modifiedAt, describe }]. describe() reads the picture's notes, so
 * a list reads them only for the page it shows.
 */
export function galleryPictures() {
  return galleryEntries().map((entry) => ({
    name: entry.name,
    modifiedAt: entry.stat.mtime.toISOString(),
    describe: () => describe(entry),
  }));
}

export function deleteGalleryImage(name) {
  const file = galleryFile(name);
  if (!file) return false;
  fs.unlinkSync(file);
  try { fs.unlinkSync(`${file}.json`); } catch { /* no notes */ }
  return true;
}
