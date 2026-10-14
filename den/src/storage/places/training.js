// den/src/storage/places/training.js
// Training: datasets made for guided training, the adapters made from runs,
// and the folders runs left behind (matched to their run by output_dir). A
// running run's dataset and folder, and a loaded adapter, stay.

import fs from 'fs';
import path from 'path';
import db from '../../db/client.js';
import { datasetsDir } from '../../training/trainingData.js';
import { adapterFile, adaptersDir, forgetAdapter, listAdapters } from '../../training/adapters.js';
import { managedTrainingDir } from '../../lib/trainingEngine.js';
import { activeTrainingJobs } from '../../ai/controllers/ai/trainingJobManager.js';
import { modelInUse } from '../modelLocks.js';
import { makeId } from '../itemIds.js';
import { removeInside } from '../safeFs.js';
import { usageWithin } from '../diskUsage.js';
import { badge, fileIn, filesIn, fileItem, folderIn, makeItem } from '../fileItems.js';

const ROUTE = '/models?tab=training';

/** Where runs write their output (trainingOutputDir(), without making it). */
export function trainingResultsDir() {
  return path.join(managedTrainingDir(), 'outputs');
}

const same = (a, b) => Boolean(a && b) && path.resolve(a) === path.resolve(b);

function datasetItem(entry, running) {
  const busy = running.some((job) => same(job.datasetPath, entry.file));
  return fileItem({
    id: makeId('dataset', entry.name),
    place: 'training',
    kind: 'dataset',
    kindLabel: 'Dataset',
    where: 'Datasets',
    whereId: 'datasets',
    entry,
    can: { open: false },
    badges: busy ? [badge('info', 'Running')] : [],
    lock: busy ? { code: 'IN_USE', reason: 'A training run is using it.' } : null,
  });
}

function adapterItem(adapter) {
  const file = adapterFile(adapter);
  const loaded = modelInUse('adapter', adapter.id);
  let stat = null;
  try { stat = file ? fs.lstatSync(file) : null; } catch { /* gone */ }
  return makeItem({
    id: makeId('adapter', adapter.id),
    place: 'training',
    kind: 'adapter',
    kindLabel: 'Adapter',
    title: adapter.name || 'Adapter',
    name: file ? path.basename(file) : null,
    where: 'Adapters',
    whereId: 'adapters',
    bytes: stat?.size ?? null,
    modifiedAt: adapter.createdAt || stat?.mtime.toISOString() || null,
    path: file,
    badges: loaded ? [badge('success', 'Loaded')] : [],
    can: { reveal: Boolean(file), delete: true },
    lock: loaded ? { code: 'IN_USE', reason: loaded } : null,
    manageRoute: ROUTE,
  });
}

function trainingRuns(userId) {
  try {
    return db.prepare('SELECT id, name, output_dir FROM training_jobs WHERE user_id = ?').all(userId);
  } catch {
    return [];
  }
}

async function resultItem(name, dir, runs, running, { sizes = true } = {}) {
  const run = runs.find((candidate) => same(candidate.output_dir, dir));
  const busy = running.some((job) => same(job.outputDir, dir));
  const usage = sizes ? await usageWithin(dir) : null;
  let modifiedAt = null;
  try { modifiedAt = fs.lstatSync(dir).mtime.toISOString(); } catch { /* gone */ }
  return makeItem({
    id: makeId('result', name),
    place: 'training',
    kind: 'result',
    kindLabel: 'Training result',
    title: run?.name || name,
    name,
    where: 'Results',
    whereId: 'results',
    bytes: usage?.bytes ?? null,
    modifiedAt,
    path: dir,
    isFolder: true,
    badges: busy ? [badge('info', 'Running')] : run ? [] : [badge('neutral', 'Training deleted')],
    can: { reveal: true, open: true, delete: true },
    lock: busy ? { code: 'IN_USE', reason: 'This training run is still going.' } : null,
  });
}

function resultFolders() {
  const dir = trainingResultsDir();
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.map((name) => ({ name, dir: folderIn(dir, name) })).filter((entry) => entry.dir);
}

export const training = {
  id: 'training',
  label: 'Training',
  hint: 'Datasets, adapters and what training runs left behind.',

  pieces() {
    return [datasetsDir(), adaptersDir(), trainingResultsDir()];
  },

  async list(userId, options = {}) {
    const running = activeTrainingJobs();
    const runs = trainingRuns(userId);
    const entries = filesIn(datasetsDir(), { links: true }).map((entry) => datasetItem(entry, running));
    entries.push(...listAdapters().map(adapterItem));
    for (const folder of resultFolders()) entries.push(await resultItem(folder.name, folder.dir, runs, running, options));
    return entries;
  },

  resolve: {
    dataset(_userId, [name]) {
      const entry = fileIn(datasetsDir(), name, { links: true });
      return entry && !name.startsWith('.')
        ? { item: datasetItem(entry, activeTrainingJobs()), target: entry.file, root: datasetsDir(), link: entry.link }
        : null;
    },

    adapter(_userId, [id]) {
      const adapter = listAdapters().find((candidate) => candidate.id === id);
      if (!adapter) return null;
      const item = adapterItem(adapter);
      return {
        item,
        target: item.path,
        // Its file (only from the adapters folder), then its entry in the list.
        remove: async () => {
          const file = adapterFile(adapter);
          const freed = file ? await removeInside(adaptersDir(), file) : 0;
          forgetAdapter(id);
          return freed;
        },
      };
    },

    async result(userId, [name]) {
      const dir = folderIn(trainingResultsDir(), name);
      if (!dir) return null;
      return {
        item: await resultItem(name, dir, trainingRuns(userId), activeTrainingJobs()),
        target: dir,
        root: trainingResultsDir(),
        folder: true,
      };
    },
  },
};
