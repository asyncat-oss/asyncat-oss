// den/src/storage/diskUsage.js
// How much room folders take, for Files, Privacy's export estimate and the
// old Storage panel: one async scanner. It never follows links, stops after a
// budget of entries (the answer then says partial), and keeps each answer for
// 60 s; a delete or clean forgets the answers it changed.

import fs from 'fs';
import path from 'path';

export const CACHE_MS = 60_000;
export const BUDGET = 200_000;
const BATCH = 64;

const answers = new Map(); // key → { dir, at, value }
const running = new Map(); // key → Promise

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function keyOf(dir, { exclude = [], skip = null, key = '' } = {}) {
  return [comparable(dir), skip ? key || String(skip) : key, ...exclude.map(comparable).sort()].join('\0');
}

async function scan(dir, { exclude = [], skip = null, budget = BUDGET } = {}) {
  const excluded = new Set(exclude.map(comparable));
  let top;
  try {
    top = await fs.promises.stat(dir);
  } catch {
    return { bytes: 0, files: 0, partial: false };
  }
  if (!top.isDirectory()) return { bytes: top.size, files: 1, partial: false };

  let bytes = 0;
  let files = 0;
  let seen = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (let start = 0; start < entries.length; start += BATCH) {
      const batch = entries.slice(start, start + BATCH);
      seen += batch.length;
      if (seen > budget) return { bytes, files, partial: true };
      await Promise.all(batch.map(async (entry) => {
        const full = path.join(current, entry.name);
        if (excluded.has(comparable(full)) || skip?.(full, entry)) return;
        // Dirents describe links as links: they are neither entered nor counted.
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          try {
            const { size } = await fs.promises.lstat(full);
            bytes += size;
            files += 1;
          } catch { /* gone meanwhile */ }
        }
      }));
    }
  }
  return { bytes, files, partial: false };
}

/**
 * `{ bytes, files, partial }` for a folder (or a file), from the last minute's
 * answer when there is one. `exclude` leaves out paths inside it; `skip(full,
 * dirent)` too, with `key` naming that rule so its answers are kept apart.
 * `fresh` scans again. Two callers asking at once share one scan.
 */
export function folderUsage(dir, { exclude = [], skip = null, key = '', fresh = false, budget = BUDGET } = {}) {
  const id = keyOf(dir, { exclude, skip, key });
  const known = answers.get(id);
  if (!fresh && known && Date.now() - known.at < CACHE_MS) return Promise.resolve(known.value);
  if (running.has(id)) return running.get(id);
  const job = scan(dir, { exclude, skip, budget })
    .then((value) => {
      answers.set(id, { dir: comparable(dir), at: Date.now(), value });
      return value;
    })
    .finally(() => running.delete(id));
  running.set(id, job);
  return job;
}

/**
 * The last answer for a folder at once: `{ value, fresh }`, value null when
 * there is none yet. A missing or old answer starts a scan in the background.
 */
export function peekUsage(dir, options = {}) {
  const id = keyOf(dir, options);
  const known = answers.get(id);
  const fresh = Boolean(known && Date.now() - known.at < CACHE_MS);
  if (!fresh) folderUsage(dir, options).catch(() => {});
  return { value: known?.value || null, fresh };
}

/** The answer if it comes within `ms`, else null (the scan goes on). */
export async function usageWithin(dir, options = {}, ms = 2000) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  try {
    return await Promise.race([folderUsage(dir, options), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** Forget answers that `changed` (a removed file or folder) is part of. */
export function forgetUsage(changed) {
  const target = comparable(changed);
  for (const [id, answer] of answers) {
    if (inside(answer.dir, target) || inside(target, answer.dir)) answers.delete(id);
  }
}

/** A file's size without following a link, or 0. */
export function fileBytes(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

/** The disk a folder is on: `{ totalBytes, freeBytes }`, or null. */
export function diskSpace(dir) {
  let probe = path.resolve(dir);
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  try {
    const stat = fs.statfsSync(probe);
    const block = Number(stat.bsize || 0);
    return { totalBytes: block * Number(stat.blocks || 0), freeBytes: block * Number(stat.bavail ?? stat.bfree ?? 0) };
  } catch {
    return null;
  }
}
