// den/src/storage/places/logs.js
// Logs & caches: den's logs (logRoot(), one folder per kind), the desktop
// app's process log beside them, voice samples, temporary files (data/tmp and
// each agent folder's .asyncat/tmp), and, shown only, undo points and copies.
// Today's logs stay: Asyncat is writing to them.

import fs from 'fs';
import path from 'path';
import { runtimeDataPath, runtimeDataRoot } from '../../config/runtimeConfig.js';
import { dateStamp, logRoot } from '../../logger.js';
import { madeRoot, madeRoots } from '../../made/madeIndex.js';
import { getSnapshotsDir, getTmpDir } from '../../agent/workspacePaths.js';
import { getSandboxRoot } from '../../files/fileExplorerService.js';
import { makeId } from '../itemIds.js';
import { isRealSubdir, removeInside } from '../safeFs.js';
import { usageWithin } from '../diskUsage.js';
import { badge, fileIn, filesIn, fileItem, makeItem } from '../fileItems.js';

const LOGS = {
  'backend-app': { dir: 'app', where: 'App' },
  'backend-error': { dir: 'error', where: 'Errors' },
  'backend-http': { dir: 'http', where: 'Requests' },
};
const PROCESS_LOG = 'backend-process.log';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const logDir = (category) => path.join(logRoot(), LOGS[category].dir);
const processLogDir = () => path.dirname(logRoot());
const voiceSamplesDir = () => runtimeDataPath('cache', 'voice-samples');
// Claude Code's approval settings live here while it runs.
const engineTmpDir = () => runtimeDataPath('tmp');

function agentFolders(userId, sub) {
  return madeRoots(userId)
    .map((root) => ({ root, dir: sub(root.dir) }))
    .filter(({ root, dir }) => isRealSubdir(root.dir, dir));
}

function logItem(category, entry) {
  const current = entry.name.includes(dateStamp());
  return fileItem({
    id: makeId('log', category, entry.name),
    place: 'logs',
    kind: 'log',
    kindLabel: 'Log',
    title: entry.name,
    where: LOGS[category].where,
    whereId: category,
    entry,
    tail: true,
    can: { open: false, preview: true },
    badges: current ? [badge('neutral', 'Today')] : [],
    lock: current ? { code: 'IN_USE', reason: 'Asyncat is writing to it.' } : null,
  });
}

function processLogItem(entry) {
  return fileItem({
    id: makeId('process-log'),
    place: 'logs',
    kind: 'log',
    kindLabel: 'Log',
    title: entry.name,
    where: 'Desktop app',
    whereId: 'desktop',
    entry,
    tail: true,
    can: { open: false, preview: true },
    lock: { code: 'READ_ONLY', reason: 'The desktop app writes to it.' },
  });
}

async function folderItem({ id, kind, kindLabel, title, where, whereId = where, dir, dirs = [dir], sizes = true }) {
  const existing = dirs.filter((candidate) => {
    try { return fs.lstatSync(candidate).isDirectory(); } catch { return false; }
  });
  let bytes = null;
  if (sizes) {
    const usages = await Promise.all(existing.map((candidate) => usageWithin(candidate)));
    bytes = usages.every(Boolean) ? usages.reduce((sum, usage) => sum + usage.bytes, 0) : null;
  }
  return makeItem({
    id,
    place: 'logs',
    kind,
    kindLabel,
    title,
    where,
    whereId,
    bytes,
    path: dir || null,
    isFolder: true,
    // Cleared with "Clear caches and temporary files"; undo points and copies stay.
    can: { reveal: Boolean(dir && existing.length) },
  });
}

async function cacheItems(userId, { sizes = true } = {}) {
  const agentTmp = agentFolders(userId, getTmpDir).map(({ dir }) => dir);
  return Promise.all([
    folderItem({ id: makeId('cache', 'voice-samples'), kind: 'cache', kindLabel: 'Cache', title: 'Voice samples', where: 'Voices', dir: voiceSamplesDir(), sizes }),
    folderItem({ id: makeId('cache', 'engine-tmp'), kind: 'cache', kindLabel: 'Temporary files', title: 'Temporary files', where: 'Claude Code', dir: engineTmpDir(), sizes }),
    folderItem({
      id: makeId('cache', 'agent-tmp'), kind: 'cache', kindLabel: 'Temporary files', title: "Agents' temporary files", where: 'Agent folders',
      dir: agentTmp.length === 1 ? agentTmp[0] : null, dirs: agentTmp, sizes,
    }),
  ]);
}

function undoItem(root, dir, options) {
  return folderItem({ id: makeId('undo', root.id), kind: 'undo', kindLabel: 'Undo points', title: 'Undo points', where: root.label, whereId: root.whereId, dir, ...options });
}

function copiesItem(dir, options) {
  return folderItem({ id: makeId('copies'), kind: 'undo', kindLabel: 'Copies', title: 'Copies of project folders', where: 'Agents', dir, ...options });
}

function copiesDir() {
  const dir = getSandboxRoot();
  try { return fs.lstatSync(dir).isDirectory() ? dir : null; } catch { return null; }
}

function processLog() {
  return fileIn(processLogDir(), PROCESS_LOG);
}

// Every file under `dir` (links too, never followed), for clearing.
function filesUnder(dir) {
  const found = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() || entry.isSymbolicLink()) found.push(full);
    }
  }
  return found;
}

/**
 * "Clear caches and temporary files": every voice sample (they download
 * again when played), and temporary files older than a week (newer ones may
 * belong to a run going on now).
 */
export async function clearCaches(userId, now = Date.now()) {
  const result = { freedBytes: 0, files: 0 };
  const clear = async (dir, keep = () => false) => {
    for (const file of filesUnder(dir)) {
      try {
        if (keep(fs.lstatSync(file))) continue;
        result.freedBytes += await removeInside(dir, file);
        result.files += 1;
      } catch { /* gone, or not ours */ }
    }
  };
  const recent = (stat) => now - stat.mtimeMs < WEEK_MS;
  // Only folders really inside the data folder: one swapped for a link
  // could lead the clean-up anywhere.
  const inData = (dir) => isRealSubdir(runtimeDataRoot(), dir);
  if (inData(voiceSamplesDir())) await clear(voiceSamplesDir());
  if (inData(engineTmpDir())) await clear(engineTmpDir(), recent);
  for (const { dir } of agentFolders(userId, getTmpDir)) await clear(dir, recent);
  return result;
}

export const logs = {
  id: 'logs',
  label: 'Logs & caches',
  hint: 'Logs, temporary files and caches. Clearing them is safe.',

  pieces(userId) {
    const processEntry = processLog();
    return [
      logRoot(),
      ...(processEntry ? [processEntry.file] : []),
      voiceSamplesDir(),
      engineTmpDir(),
      ...agentFolders(userId, getTmpDir).map(({ dir }) => dir),
      ...agentFolders(userId, getSnapshotsDir).map(({ dir }) => dir),
      ...(copiesDir() ? [copiesDir()] : []),
    ];
  },

  async list(userId, options = {}) {
    const entries = [];
    for (const category of Object.keys(LOGS)) {
      for (const entry of filesIn(logDir(category))) entries.push(logItem(category, entry));
    }
    const processEntry = processLog();
    if (processEntry) entries.push(processLogItem(processEntry));
    entries.push(...await cacheItems(userId, options));
    for (const { root, dir } of agentFolders(userId, getSnapshotsDir)) entries.push(await undoItem(root, dir, options));
    const copies = copiesDir();
    if (copies) entries.push(await copiesItem(copies, options));
    return entries;
  },

  resolve: {
    log(_userId, [category, name]) {
      const entry = name.startsWith('.') ? null : fileIn(logDir(category), name);
      return entry ? { item: logItem(category, entry), target: entry.file, root: logDir(category) } : null;
    },

    'process-log'() {
      const entry = processLog();
      return entry ? { item: processLogItem(entry), target: entry.file } : null;
    },

    async cache(userId, [which]) {
      const item = (await cacheItems(userId)).find((candidate) => candidate.id === makeId('cache', which));
      return item ? { item, target: item.path } : null;
    },

    async undo(userId, [rootId]) {
      const root = madeRoot(userId, rootId);
      const dir = root && getSnapshotsDir(root.dir);
      return dir && isRealSubdir(root.dir, dir) ? { item: await undoItem(root, dir), target: dir } : null;
    },

    async copies() {
      const dir = copiesDir();
      return dir ? { item: await copiesItem(dir), target: dir } : null;
    },
  },
};
