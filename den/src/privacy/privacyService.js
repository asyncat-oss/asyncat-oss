// den/src/privacy/privacyService.js
// Settings → Privacy & safety: where Asyncat keeps things, how saved keys are
// protected, and "Export everything" (one zip of the database and files,
// without downloaded models and without the key that opens saved secrets).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import JSZip from 'jszip';
import db from '../db/client.js';
import { secretStatus } from '../lib/secretBox.js';
import {
  runtimeDataPath, runtimeDataRoot, runtimeDbPath, runtimeHome, runtimeModelsPath, runtimeUploadsPath,
} from '../config/runtimeConfig.js';
import { folderUsage } from '../storage/diskUsage.js';
import { userSoulsDir } from '../agent/prompts/agentSystemPrompt.js';
import { RESET_MARKER } from './resetData.js';

const dbPath = () => runtimeDbPath();
const uploadsPath = () => runtimeUploadsPath();
const modelsPath = () => runtimeModelsPath();

function inside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** The folders and files that hold the user's things. */
export function dataLocations() {
  const secrets = secretStatus();
  const keyFile = runtimeDataPath('secret.key');
  return [
    { id: 'data', label: 'Your data', note: 'Chats, projects, notes, agents, Cats and settings', path: runtimeDataRoot() },
    { id: 'database', label: 'Database', note: 'One file with most of it', path: dbPath() },
    { id: 'uploads', label: 'Uploads', note: 'Files added to chats and notes', path: uploadsPath() },
    { id: 'models', label: 'Models', note: 'Downloaded language, voice and image models', path: modelsPath() },
    { id: 'home', label: 'Engines and skills', note: 'Engines Asyncat installed, and your own skills', path: runtimeHome() },
    ...(secrets.keySource === 'file' || fs.existsSync(keyFile)
      ? [{ id: 'key', label: 'Key file', note: 'Opens your saved keys; readable only by you', path: keyFile }]
      : []),
  ].map((item) => ({ ...item, exists: fs.existsSync(item.path) }));
}

export function privacyOverview() {
  return { secrets: secretStatus(), locations: dataLocations() };
}

// What an export leaves out of the data folder.
function exportSkip() {
  const models = modelsPath();
  const database = dbPath();
  return (full, entry) => {
    const name = entry?.name || path.basename(full);
    if (path.resolve(full) === path.resolve(models)) return true;
    if (path.resolve(full).startsWith(`${path.resolve(database)}`)) return true;
    if (name === 'secret.key' || name === RESET_MARKER || name === 'cache') return true;
    return /\.(part|tmp)$/.test(name);
  };
}

/** About how big an export is, and how big what it leaves out is. */
export async function exportEstimate() {
  const dataRoot = runtimeDataRoot();
  const data = await folderUsage(dataRoot, { skip: exportSkip(), key: 'export' });
  // With write-ahead logging most of a busy database sits in its -wal file,
  // which the export takes in too; the main file alone can be 4 KB.
  let databaseBytes = 0;
  for (const suffix of ['', '-wal']) {
    try { databaseBytes += fs.statSync(`${dbPath()}${suffix}`).size; } catch { /* none yet */ }
  }
  const uploads = inside(uploadsPath(), dataRoot) ? { bytes: 0, files: 0 } : await folderUsage(uploadsPath());
  const models = await folderUsage(modelsPath());
  return {
    bytes: data.bytes + databaseBytes + uploads.bytes,
    files: data.files + uploads.files + 1,
    leftOut: { modelsBytes: models.bytes },
  };
}

/** A stream that opens its file only when the zip gets to it. */
function lazyFileStream(file) {
  let fd = null;
  let position = 0;
  return new Readable({
    read(size) {
      try {
        if (fd === null) fd = fs.openSync(file, 'r');
        const buffer = Buffer.alloc(Math.min(Math.max(size || 65536, 65536), 1 << 20));
        const bytes = fs.readSync(fd, buffer, 0, buffer.length, position);
        position += bytes;
        if (bytes === 0) {
          fs.closeSync(fd);
          fd = null;
          this.push(null);
        } else {
          this.push(bytes === buffer.length ? buffer : buffer.subarray(0, bytes));
        }
      } catch (err) {
        if (fd !== null) {
          try { fs.closeSync(fd); } catch { /* closed */ }
          fd = null;
        }
        this.destroy(err);
      }
    },
  });
}

function addFolder(zip, dir, prefix, skip, counter) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (skip(full, entry)) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        zip.file(`${prefix}/${path.relative(dir, full).split(path.sep).join('/')}`, lazyFileStream(full), { binary: true });
        counter.files += 1;
      }
    }
  }
}

const README = `Asyncat export
==============

database/asyncat.db  Chats, projects, notes, agents, Cats, memory and settings
                     (an SQLite database).
data/                Everything else in Asyncat's data folder: connectors,
                     generated pictures, knowledge files, Cat folders.
uploads/             Files added to chats and notes (when kept apart).
skills/              Your own skills.
souls/               Your edited instructions file.

Not included: downloaded models (download them again), and the key that
opens saved API keys and sign-ins. Those stay encrypted in this export and
only open on the computer that made it.
`;

/** Where "Export everything" writes its zips: Downloads, or ASYNCAT_EXPORT_DIR. */
export function exportFolder() {
  if (process.env.ASYNCAT_EXPORT_DIR) return path.resolve(process.env.ASYNCAT_EXPORT_DIR);
  const downloads = path.join(os.homedir(), 'Downloads');
  return fs.existsSync(downloads) ? downloads : os.homedir();
}

/** Write one zip of everything to `destDir` (Downloads by default). */
export async function exportEverything({ destDir = exportFolder(), now = new Date() } = {}) {
  const dataRoot = runtimeDataRoot();
  const zip = new JSZip();
  const counter = { files: 0 };
  const snapshot = path.join(os.tmpdir(), `asyncat-export-${process.pid}-${now.getTime()}.db`);
  await db.backup(snapshot);
  try {
    zip.file('README.txt', README);
    zip.file('database/asyncat.db', lazyFileStream(snapshot), { binary: true });
    addFolder(zip, dataRoot, 'data', exportSkip(), counter);
    if (!inside(uploadsPath(), dataRoot) && fs.existsSync(uploadsPath())) addFolder(zip, uploadsPath(), 'uploads', () => false, counter);
    const skills = path.join(runtimeHome(), 'skills');
    if (fs.existsSync(skills)) addFolder(zip, skills, 'skills', () => false, counter);
    const souls = userSoulsDir();
    if (fs.existsSync(souls)) addFolder(zip, souls, 'souls', () => false, counter);

    fs.mkdirSync(destDir, { recursive: true });
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}`;
    const out = path.join(destDir, `Asyncat export ${stamp}.zip`);
    await new Promise((resolve, reject) => {
      zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } })
        .on('error', reject)
        .pipe(fs.createWriteStream(out))
        .on('finish', resolve)
        .on('error', reject);
    });
    return { path: out, bytes: fs.statSync(out).size, files: counter.files + 2 };
  } finally {
    fs.rmSync(snapshot, { force: true });
  }
}
