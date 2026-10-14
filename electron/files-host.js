// electron/files-host.js — What the Files page asks the desktop app to do,
// through den (den/src/storage/filesRoutes.js): show a file in the file
// manager, open it with its own app, or move it to the Trash. den has
// already found and checked the file; this checks the path again before
// Electron's shell gets it. Open takes a folder, or a document, picture,
// sound or video by its name and by its first bytes (some file managers pick
// the app by what a file holds): never a page, a drawing, a script or a
// program. The Trash never takes the home folder or a folder holding it.
//
// No Electron imports, so it can be unit-tested with plain node.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAC_PACKAGES } from './folder-open.js';

/** What may be opened with another app: the same list as den's safeFs.js. */
export const OPENABLE_EXT = new Set([
  '.pdf', '.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.txt', '.md', '.csv', '.tsv', '.json',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.wav', '.ogg', '.mp4', '.webm',
]);

const HEAD_BYTES = 512;
// Programs: Linux, Windows, macOS (and fat macOS) programs.
const PROGRAM_MAGIC = [0x7f454c46, 0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe];

function refused(message) {
  return new Error(message);
}

function absolutePath(target) {
  if (typeof target !== 'string' || target === '' || target.includes('\0') || !path.isAbsolute(target)) {
    throw refused('That is not a file Asyncat keeps.');
  }
  return path.resolve(target);
}

function comparable(value, platform) {
  return platform === 'win32' || platform === 'darwin' ? value.toLowerCase() : value;
}

function realOrResolved(value, fsApi) {
  try {
    return fsApi.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

/**
 * True when a file's first bytes are a program's, a script's (#!), a
 * desktop launcher's, or a web page's or drawing's.
 */
export function looksRunnable(head) {
  const bytes = Buffer.from(head || []);
  if (bytes.length >= 2 && bytes.toString('latin1', 0, 2) === '#!') return true;
  if (bytes.length >= 2 && bytes.toString('latin1', 0, 2) === 'MZ') return true;
  if (bytes.length >= 4 && PROGRAM_MAGIC.includes(bytes.readUInt32BE(0))) return true;
  const text = bytes.toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  if (text.startsWith('[desktop entry]')) return true;
  return text.startsWith('<') && /<(!doctype\s+html|html|svg|script)[\s>/]/.test(text);
}

function headOf(file, fsApi) {
  const fd = fsApi.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    return buffer.subarray(0, fsApi.readSync(fd, buffer, 0, HEAD_BYTES, 0));
  } finally {
    fsApi.closeSync(fd);
  }
}

function existing(file, fsApi) {
  try {
    return fsApi.lstatSync(file);
  } catch {
    throw refused('That file was not found.');
  }
}

/** The path to show in the file manager: any file or folder that is there. */
export function revealTarget(target, { fsApi = fs } = {}) {
  const file = absolutePath(target);
  existing(file, fsApi);
  return file;
}

/**
 * The path to open with another app: a folder (not a macOS app or
 * installer), or a file on OPENABLE_EXT whose first bytes aren't a
 * program's, a script's or a page's. Never a link. Throws why not.
 */
export function openTarget(target, { platform = process.platform, fsApi = fs } = {}) {
  const file = absolutePath(target);
  const stat = existing(file, fsApi);
  const cannot = () => refused("That can't be opened in another app.");
  if (stat.isSymbolicLink()) throw cannot();
  const real = realOrResolved(file, fsApi);
  if (stat.isDirectory()) {
    if (platform === 'darwin' && MAC_PACKAGES.test(real)) throw cannot();
    return real;
  }
  if (!stat.isFile() || !OPENABLE_EXT.has(path.extname(real).toLowerCase())) throw cannot();
  let head;
  try {
    head = headOf(real, fsApi);
  } catch {
    throw refused('That file was not found.');
  }
  if (looksRunnable(head)) throw cannot();
  return real;
}

/**
 * The path to move to the Trash. A link goes itself, not what it points at.
 * Never a drive's top folder, the home folder, one of `keep` (the app's own
 * data) or a folder that holds any of them. Throws why not.
 */
export function trashTarget(target, { home = os.homedir(), keep = [], platform = process.platform, fsApi = fs } = {}) {
  const file = absolutePath(target);
  existing(file, fsApi);
  if (path.parse(file).root === file) throw refused("Asyncat doesn't move that to the Trash.");
  // The link's own place: its folder's real path, plus its name.
  const real = comparable(path.join(realOrResolved(path.dirname(file), fsApi), path.basename(file)), platform);
  const held = [home, ...keep].filter(Boolean).map((folder) => comparable(realOrResolved(folder, fsApi), platform));
  const holds = (folder) => {
    const rel = path.relative(real, folder);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  if (held.some(holds)) throw refused("Asyncat doesn't move that to the Trash.");
  return file;
}

/** Show `target` selected in the file manager (Electron's shell.showItemInFolder). */
export function revealFile(target, { showItemInFolder, fsApi = fs } = {}) {
  showItemInFolder(revealTarget(target, { fsApi }));
  return { shown: true };
}

/** Open `target` with its own app (Electron's shell.openPath, which answers '' when it worked). */
export async function openFile(target, { openPath, platform = process.platform, fsApi = fs } = {}) {
  const error = await openPath(openTarget(target, { platform, fsApi }));
  if (error) throw refused(String(error));
  return { opened: true };
}

/** Move `target` to the Trash (Electron's shell.trashItem, which rejects when it can't). */
export async function trashFile(target, { trashItem, home, keep, platform = process.platform, fsApi = fs } = {}) {
  await trashItem(trashTarget(target, { home, keep, platform, fsApi }));
  return { trashed: true };
}
