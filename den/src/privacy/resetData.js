// den/src/privacy/resetData.js
// "Delete everything" (Settings → Privacy & safety). It can't happen while
// den runs on the database and files it deletes, so the request leaves a
// note in the data folder and the next start carries it out first, before
// anything opens them (boot/applyPendingReset.js).

import fs from 'fs';
import os from 'os';
import path from 'path';

export const RESET_MARKER = '.reset-requested.json';

/** Refuse to wipe anything that isn't plainly an app folder. */
export function safeTarget(dir) {
  if (!dir) return null;
  const resolved = path.resolve(dir);
  const parts = resolved.split(path.sep).filter(Boolean);
  if (parts.length < 2) return null;
  if (resolved === path.resolve(os.homedir())) return null;
  return resolved;
}

function removeEntry(target, removed) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(target);
  } catch {
    // Keep going; what is left shows up as data still there.
  }
}

function removeContents(dir, removed, { keep = [] } = {}) {
  const target = safeTarget(dir);
  if (!target || !fs.existsSync(target)) return;
  for (const name of fs.readdirSync(target)) {
    if (keep.includes(name)) continue;
    removeEntry(path.join(target, name), removed);
  }
}

function inside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Leave the note that the next start acts on. */
export function requestReset(dataRoot, { includeModels = false, now = new Date() } = {}) {
  fs.mkdirSync(dataRoot, { recursive: true });
  const marker = { includeModels: Boolean(includeModels), requestedAt: now.toISOString() };
  fs.writeFileSync(path.join(dataRoot, RESET_MARKER), JSON.stringify(marker, null, 2), { mode: 0o600 });
  return marker;
}

export function pendingReset(dataRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataRoot, RESET_MARKER), 'utf8'));
  } catch {
    return null;
  }
}

export function cancelReset(dataRoot) {
  fs.rmSync(path.join(dataRoot, RESET_MARKER), { force: true });
}

/**
 * Carry out a requested reset: everything in the data folder (models only
 * when asked), the database, uploads and logs kept elsewhere, and in
 * Asyncat's home folder the user's own skills (with models asked for: the
 * engines too). Returns what was removed, or null when nothing was asked.
 */
export function applyReset({ dataRoot, home, dbPath = null, storagePath = null, logDir = null }) {
  const request = pendingReset(dataRoot);
  if (!request) return null;
  const root = safeTarget(dataRoot);
  if (!root) {
    cancelReset(dataRoot);
    return { removed: [], refused: dataRoot };
  }
  const removed = [];
  const keepModels = !request.includeModels;
  removeContents(root, removed, { keep: [RESET_MARKER, ...(keepModels ? ['models'] : [])] });

  // The database and uploads may live outside the data folder.
  if (dbPath && !inside(dbPath, root)) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) removeEntry(`${dbPath}${suffix}`, removed);
    }
  }
  if (storagePath && !inside(storagePath, root)) removeContents(storagePath, removed);
  if (logDir && !inside(logDir, root)) removeContents(logDir, removed);

  if (home && safeTarget(home)) {
    if (request.includeModels) removeContents(home, removed);
    else for (const name of ['skills', 'souls']) {
      const target = path.join(home, name);
      if (fs.existsSync(target)) removeEntry(target, removed);
    }
  }
  cancelReset(dataRoot);
  return { removed, includeModels: Boolean(request.includeModels) };
}
