// den/src/storage/safeFs.js
// Checks for reaching a file in a folder Asyncat keeps (artifacts, pictures,
// logs …) by a plain name, so that a link someone left there can't lead a
// list, a read or a delete to a file somewhere else; and removeInside, the
// one way Files removes anything.

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  runtimeDataPath, runtimeDataRoot, runtimeDbPath, runtimeHome, runtimeModelsPath, runtimeUploadsPath,
} from '../config/runtimeConfig.js';
import { RESET_MARKER } from '../privacy/resetData.js';
import { folderUsage, forgetUsage } from './diskUsage.js';

function comparable(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function relativeInside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : null;
}

/** True for a plain file name: no folder part, no NUL, not "." or "..". */
export function isPlainName(name) {
  const value = String(name ?? '');
  return value !== '' && value !== '.' && value !== '..' && !value.includes('\0')
    && !/[\\/]/.test(value) && path.basename(value) === value;
}

/** True when `target`, links followed, is strictly inside `root`, links followed. */
export function realInside(root, target) {
  try {
    return relativeInside(fs.realpathSync(root), fs.realpathSync(target)) !== null;
  } catch {
    return false;
  }
}

/**
 * True when `sub`, a folder below `root`, is reached without going through a
 * link: its real path is the root's real path plus the same names.
 */
export function isRealSubdir(root, sub) {
  const rel = relativeInside(path.resolve(root), path.resolve(sub));
  if (rel === null) return false;
  try {
    return comparable(fs.realpathSync(sub)) === comparable(path.join(fs.realpathSync(root), rel));
  } catch {
    return false;
  }
}

/**
 * `{ file, stat }` for `dir/name` when `name` is a plain name and the entry is
 * a regular file (not a link, folder or device) inside `dir`; otherwise null.
 */
export function plainFileIn(dir, name) {
  if (!isPlainName(name)) return null;
  const file = path.join(dir, name);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return null;
  }
  if (!stat.isFile() || !realInside(dir, file)) return null;
  return { file, stat };
}

// ── Removing ──────────────────────────────────────────────────────────────────

/** An error a route turns into its status and code. */
export function filesError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

const notFound = () => filesError(404, 'NOT_FOUND', 'That file was not found.');
const refused = () => filesError(403, 'PROTECTED', "Asyncat doesn't remove that.");

// Engines and Python environments in Asyncat's home have their own uninstall.
const ENGINE_FOLDERS = ['llama.cpp', 'mlx', 'whisper.cpp', 'piper', 'stable-diffusion.cpp', path.join('training', 'python'), 'skills', 'downloads'];
const openFiles = new Set();

/** Keep a file den has open (the database) out of every remove. */
export function protectFile(file) {
  if (file) openFiles.add(path.resolve(file));
}

/**
 * What no route may remove, wherever it is: the database and its -wal and
 * -shm, the key that opens saved secrets, the desktop bridge's token,
 * connector and agent settings, a pending "Delete everything", and the
 * engines in Asyncat's home. `keep` are folders that are never removed
 * themselves, nor anything that holds them.
 */
export const PROTECTED = {
  files() {
    const databases = new Set([runtimeDbPath(), ...openFiles]);
    return [
      ...[...databases].flatMap((file) => [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]),
      ...['secret.key', 'host-token', 'mcp.json', 'acp-agents.json', 'external-agent-usage.json', RESET_MARKER]
        .map((name) => runtimeDataPath(name)),
    ];
  },
  folders() {
    return ENGINE_FOLDERS.map((name) => path.join(runtimeHome(), name));
  },
  keep() {
    return [runtimeDataRoot(), runtimeHome(), runtimeUploadsPath(), runtimeModelsPath(), os.homedir()];
  },
};

function realOrResolved(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

/**
 * True when removing `target` would remove something PROTECTED: it is one of
 * those files, inside one of those folders, or a folder that holds any of
 * them. With `link`, `target` is a link's own path and isn't followed.
 */
export function isProtected(target, { link = false } = {}) {
  const real = comparable(link ? path.join(realOrResolved(path.dirname(target)), path.basename(target)) : realOrResolved(target));
  const files = PROTECTED.files().map((file) => comparable(realOrResolved(file)));
  const folders = PROTECTED.folders().map((folder) => comparable(realOrResolved(folder)));
  const keep = PROTECTED.keep().map((folder) => comparable(realOrResolved(folder)));
  if (files.includes(real)) return true;
  if (folders.some((folder) => folder === real || relativeInside(folder, real) !== null)) return true;
  return [...files, ...folders, ...keep].some((held) => held === real || relativeInside(real, held) !== null);
}

/**
 * Remove `target`, which must be strictly inside `root`: the only way Files
 * removes anything. A link is removed itself, never what it points at. A
 * folder goes only with `folder: true`. Refuses (403 PROTECTED) the root
 * itself, anything outside it and anything PROTECTED. With `trash`, the
 * checked path is handed to it (the desktop app's Trash) instead of being
 * deleted. Resolves with the bytes freed.
 */
export async function removeInside(root, target, { folder = false, trash = null } = {}) {
  const location = path.resolve(String(target ?? ''));
  let stat;
  let realRoot;
  try {
    stat = await fs.promises.lstat(location);
    realRoot = await fs.promises.realpath(root);
  } catch {
    throw notFound();
  }
  const link = stat.isSymbolicLink();
  let real;
  try {
    real = link
      ? path.join(await fs.promises.realpath(path.dirname(location)), path.basename(location))
      : await fs.promises.realpath(location);
  } catch {
    throw notFound();
  }
  if (!link && !stat.isFile() && !(folder && stat.isDirectory())) throw refused();
  if (relativeInside(realRoot, real) === null || isProtected(real, { link })) throw refused();

  const bytes = link ? 0 : stat.isDirectory() ? (await folderUsage(real, { fresh: true })).bytes : stat.size;
  if (trash) await trash(real);
  else if (stat.isDirectory() && !link) await fs.promises.rm(real, { recursive: true, force: true });
  else await fs.promises.unlink(real);
  forgetUsage(real);
  return bytes;
}

// ── Opening and exports ───────────────────────────────────────────────────────

/**
 * What the desktop app may open with another app: documents, pictures, sound
 * and video. Pages, drawings and anything that could run are never on it.
 */
export const OPENABLE_EXT = new Set([
  '.pdf', '.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.txt', '.md', '.csv', '.tsv', '.json',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.wav', '.ogg', '.mp4', '.webm',
]);

/** The name "Export everything" gives its zips (privacyService.js). */
export const EXPORT_NAME = /^Asyncat export \d{4}-\d{2}-\d{2} \d{4}\.zip$/;
