// den/src/storage/places.js
// The places in Files and what they hold. Each place (places/*.js) is
// { id, label, hint, pieces(userId), list(userId, { sizes }), resolve }:
// the folders and files it counts, its items, and how an item id is found
// again. Here: one listing with filters, counts, sorting and paging; finding
// an item by id; how much room each place takes (together, everything
// Asyncat keeps, with nothing counted twice); and the bulk clean-ups.

import path from 'path';
import {
  runtimeDataRoot, runtimeDbPath, runtimeHome, runtimeModelsPath, runtimeUploadsPath,
} from '../config/runtimeConfig.js';
import { folderUsage, peekUsage } from './diskUsage.js';
import { parseId } from './itemIds.js';
import { filesError, removeInside } from './safeFs.js';
import { publicItem } from './fileItems.js';
import { made } from './places/made.js';
import { uploads } from './places/uploads.js';
import { models } from './places/models.js';
import { training } from './places/training.js';
import { exportsPlace } from './places/exports.js';
import { clearCaches, logs } from './places/logs.js';
import { system } from './places/system.js';

export const PLACES = [made, uploads, models, training, exportsPlace, logs, system];
const RESOLVERS = Object.assign({}, ...PLACES.map((place) => place.resolve));

export const PAGE_SIZE = 100;
const SORTS = ['newest', 'oldest', 'largest', 'name'];

export function placeById(id) {
  return PLACES.find((place) => place.id === id) || null;
}

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function strictlyInside(parent, child) {
  const rel = path.relative(comparable(parent), comparable(child));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// ── Listing ──────────────────────────────────────────────────────────────────

function searchText(entry) {
  return [entry.title, entry.name, entry.where, entry._search?.()].filter(Boolean).join(' ').toLowerCase();
}

const byTime = (a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || ''));
const byName = (a, b) => String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''), undefined, { sensitivity: 'base', numeric: true });
const last = (value) => value == null || value === '';

const ORDER = {
  newest: (a, b) => (last(a.modifiedAt) - last(b.modifiedAt)) || byTime(a, b) || byName(a, b),
  oldest: (a, b) => (last(a.modifiedAt) - last(b.modifiedAt)) || -byTime(a, b) || byName(a, b),
  largest: (a, b) => (last(a.bytes) - last(b.bytes)) || (b.bytes || 0) - (a.bytes || 0) || byName(a, b),
  name: byName,
};

/**
 * One page of a place: { items, total, counts, wheres, offset, limit }.
 * counts are of everything in the place, by kind (and flags such as
 * "unused"); total is of what the filters keep.
 */
export async function listItems(userId, { place, kind = '', where = '', q = '', sort = 'newest', offset = 0, limit = PAGE_SIZE } = {}) {
  const definition = placeById(place);
  if (!definition) throw filesError(404, 'NOT_FOUND', 'There is no such place.');
  const entries = await definition.list(userId);

  const counts = {};
  const wheres = new Map();
  for (const entry of entries) {
    for (const key of [entry.kind, ...(entry._flags || [])]) counts[key] = (counts[key] || 0) + 1;
    if (entry.whereId && !wheres.has(entry.whereId)) {
      wheres.set(entry.whereId, definition.whereLabels?.[entry.whereId] || entry.where || entry.whereId);
    }
  }

  let matching = entries;
  if (where) matching = matching.filter((entry) => entry.whereId === where);
  if (kind) matching = matching.filter((entry) => entry.kind === kind || entry._flags?.includes(kind));
  const needle = String(q || '').trim().toLowerCase();
  if (needle) matching = matching.filter((entry) => searchText(entry).includes(needle));
  matching = [...matching].sort(ORDER[SORTS.includes(sort) ? sort : 'newest']);

  const start = Math.max(0, Math.floor(Number(offset)) || 0);
  const count = Math.min(500, Math.max(1, Math.floor(Number(limit)) || PAGE_SIZE));
  return {
    items: matching.slice(start, start + count).map(publicItem),
    total: matching.length,
    counts,
    wheres: [...wheres].map(([id, label]) => ({ id, label })),
    offset: start,
    limit: count,
  };
}

/**
 * An item by the id a listing gave it, looked up afresh: { item, target,
 * root, folder, link, remove } or null. `item` keeps its server-only fields.
 */
export async function resolveItem(userId, id) {
  const parsed = parseId(id);
  const resolver = parsed && Object.hasOwn(RESOLVERS, parsed.type) ? RESOLVERS[parsed.type] : null;
  if (!resolver) return null;
  return (await resolver(userId, parsed.parts)) || null;
}

/** Remove a resolved item (its own way, or removeInside its folder). Resolves with bytes freed. */
export function removeResolved(handle, { trash = null } = {}) {
  if (handle.remove) return handle.remove({ trash });
  if (!handle.target || !handle.root) throw filesError(403, 'PROTECTED', "Asyncat doesn't remove that.");
  return removeInside(handle.root, handle.target, { folder: Boolean(handle.folder), trash });
}

// ── Sizes ────────────────────────────────────────────────────────────────────

/**
 * What to scan so every byte is counted once: each place's pieces, leaving
 * out pieces inside them (an inner piece counts for its own place), and
 * Asyncat's own folders for System, leaving out every piece inside them.
 */
export function sizePlan(userId) {
  const pieces = [];
  const seen = new Set();
  for (const place of PLACES) {
    for (const piece of place.pieces(userId)) {
      const key = comparable(piece);
      if (seen.has(key)) continue;
      seen.add(key);
      pieces.push({ place: place.id, dir: path.resolve(piece) });
    }
  }
  const covered = (dir) => pieces.some((piece) => comparable(piece.dir) === comparable(dir) || strictlyInside(piece.dir, dir));
  const roots = [];
  for (const dir of [runtimeDataRoot(), runtimeUploadsPath(), runtimeModelsPath(), runtimeHome()]) {
    if (covered(dir) || roots.some((root) => comparable(root) === comparable(dir) || strictlyInside(root, dir))) continue;
    for (let index = roots.length - 1; index >= 0; index -= 1) if (strictlyInside(dir, roots[index])) roots.splice(index, 1);
    roots.push(path.resolve(dir));
  }
  // The database counts for System wherever it is.
  const database = ['', '-wal', '-shm'].map((end) => `${runtimeDbPath()}${end}`)
    .filter((file) => !covered(file) && !roots.some((root) => strictlyInside(root, file)));

  const inner = (dir) => pieces.filter((piece) => strictlyInside(dir, piece.dir)).map((piece) => piece.dir);
  return [
    ...pieces.map((piece) => ({ place: piece.place, dir: piece.dir, exclude: inner(piece.dir) })),
    ...roots.map((dir) => ({ place: 'system', dir, exclude: inner(dir) })),
    ...database.map((file) => ({ place: 'system', dir: file, exclude: [] })),
  ];
}

/**
 * Each place's size: { places: [{ id, bytes, partial }], appBytes, scanning }.
 * At once from what was counted in the last minute (bytes null while nothing
 * is known, partial while some is), counting the rest in the background;
 * with `wait`, after counting everything afresh.
 */
export async function placeSizes(userId, { wait = false } = {}) {
  const plan = sizePlan(userId);
  const answers = await Promise.all(plan.map(async (scan) => {
    const options = { exclude: scan.exclude };
    if (wait) return { ...scan, value: await folderUsage(scan.dir, { ...options, fresh: true }), fresh: true };
    return { ...scan, ...peekUsage(scan.dir, options) };
  }));
  const places = PLACES.map((place) => {
    const mine = answers.filter((answer) => answer.place === place.id);
    const known = mine.filter((answer) => answer.value);
    return {
      id: place.id,
      bytes: mine.length && !known.length ? null : known.reduce((sum, answer) => sum + answer.value.bytes, 0),
      partial: known.length < mine.length || known.some((answer) => answer.value.partial),
    };
  });
  return {
    places,
    appBytes: places.reduce((sum, place) => sum + (place.bytes || 0), 0),
    scanning: answers.some((answer) => !answer.fresh),
  };
}

// ── Cleaning ─────────────────────────────────────────────────────────────────

export const CLEAN_ACTIONS = ['old-logs', 'unfinished-downloads', 'unused-attachments', 'caches'];

const CLEANS = {
  'old-logs': { place: logs, keep: (item) => item.kind === 'log' },
  'unfinished-downloads': { place: models, keep: (item) => item.kind === 'unfinished' },
  'unused-attachments': { place: uploads, keep: (item) => item.kind === 'note-file' },
};

/**
 * A bulk clean-up: { freedBytes, files }. Each file is looked up again and
 * removed only if it may be removed now (not today's log, not a running
 * download, not an attachment a note uses).
 */
export async function cleanUp(userId, action) {
  if (action === 'caches') return clearCaches(userId);
  const clean = CLEANS[action];
  if (!clean) throw filesError(400, 'BAD_ACTION', 'There is no such clean-up.');
  const result = { freedBytes: 0, files: 0 };
  const candidates = (await clean.place.list(userId, { sizes: false })).filter((item) => clean.keep(item) && item.can.delete);
  for (const candidate of candidates) {
    try {
      const handle = await resolveItem(userId, candidate.id);
      if (!handle?.item.can.delete) continue;
      result.freedBytes += await removeResolved(handle);
      result.files += 1;
    } catch { /* gone, or not ours to remove */ }
  }
  return result;
}
