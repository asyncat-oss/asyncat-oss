// den/src/storage/safeFs.js
// Checks for reaching a file in a folder Asyncat keeps (artifacts, pictures,
// logs …) by a plain name, so that a link someone left there can't lead a
// list, a read or a delete to a file somewhere else.

import fs from 'fs';
import path from 'path';

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
