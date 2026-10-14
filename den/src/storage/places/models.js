// den/src/storage/places/models.js
// Models: downloaded language, image, vision and voice models in the models
// folder, models added from another folder (shown, never removed), and
// unfinished downloads (*.part). A model that is loaded, drawing or still
// downloading can't be deleted (modelLocks.js).

import crypto from 'crypto';
import os from 'os';
import path from 'path';
import {
  clearCache as clearLanguageModels, listModels, MODELS_DIR, modelsSubdir,
} from '../../ai/controllers/ai/modelManager.js';
import {
  clearCache as clearVisualModels, IMAGE_DIR, listVisualModels, VISION_DIR,
} from '../../ai/controllers/ai/visualModelManager.js';
import {
  clearCache as clearAudioModels, listAllAudioModels, TTS_DIR, WHISPER_DIR,
} from '../../ai/controllers/ai/audioModelManager.js';
import { engines, MODEL_DOWNLOADING, modelInUse } from '../modelLocks.js';
import { makeId } from '../itemIds.js';
import { removeInside } from '../safeFs.js';
import { fileBytes } from '../diskUsage.js';
import { badge, fileIn, filesIn, fileItem, makeItem } from '../fileItems.js';

const TYPES = {
  llm: { dir: () => MODELS_DIR, kind: 'language', route: '/models?tab=chat&view=local' },
  vision: { dir: () => VISION_DIR, kind: 'vision', route: '/models?tab=chat&view=local' },
  image: { dir: () => IMAGE_DIR, kind: 'image', route: '/models?tab=image' },
  whisper: { dir: () => WHISPER_DIR, kind: 'voice', route: '/models?tab=audio' },
  tts: { dir: () => TTS_DIR, kind: 'voice', route: '/models?tab=audio' },
};
const KIND_LABELS = { language: 'Language', vision: 'Vision', image: 'Image', voice: 'Voice', unfinished: 'Unfinished' };
const PARTIAL_DIRS = ['', 'image', 'vision', 'audio/whisper', 'audio/tts'];

function listed(type) {
  if (type === 'llm') return listModels();
  if (type === 'vision' || type === 'image') return listVisualModels()[type] || [];
  return listAllAudioModels()[type] || [];
}

function forgetListings() {
  clearLanguageModels();
  clearVisualModels();
  clearAudioModels();
}

function lockFor(reason, progress = null) {
  if (!reason) return { badges: [], lock: null };
  const label = reason === MODEL_DOWNLOADING ? `Downloading${progress != null ? ` ${progress}%` : ''}`
    : /picture/i.test(reason) ? 'Drawing' : 'Loaded';
  return { badges: [badge(label === 'Loaded' ? 'success' : 'info', label)], lock: { code: 'IN_USE', reason } };
}

// The running download a file belongs to (its .part or the file it becomes).
function downloadOf(file) {
  for (const download of engines.downloads() || []) {
    if (download.status !== 'downloading') continue;
    try {
      const dest = path.join(modelsSubdir(download.subDir || ''), download.filename);
      if (path.resolve(`${dest}.part`) === path.resolve(file) || path.resolve(dest) === path.resolve(file)) return download;
    } catch { /* not in the models folder */ }
  }
  return null;
}

function ownItem(type, model, entry) {
  const config = TYPES[type];
  // A projector beside the language models is a vision part.
  const kind = type === 'llm' && /mmproj/i.test(entry.name) ? 'vision' : config.kind;
  const { badges, lock } = lockFor(modelInUse(type, entry.file), downloadOf(entry.file)?.progress ?? null);
  const item = fileItem({
    id: makeId('model', type, entry.name),
    place: 'models',
    kind,
    kindLabel: KIND_LABELS[kind],
    title: model.name || entry.name,
    where: 'Models folder',
    whereId: 'models',
    entry,
    badges,
    lock,
    can: { preview: false, open: false, download: false },
    manageRoute: config.route,
  });
  // A voice's settings file goes with it.
  if (type === 'tts' && item.bytes != null) item.bytes += fileBytes(`${entry.file}.json`);
  return item;
}

function externalId(type, model) {
  const key = model.source === 'huggingface-cache' || !model.id
    ? crypto.createHash('sha1').update(String(model.path)).digest('hex').slice(0, 20)
    : model.id;
  return makeId('model-ext', type, key);
}

function shortFolder(dir) {
  const home = os.homedir();
  return dir === home || dir.startsWith(`${home}${path.sep}`) ? `~${dir.slice(home.length)}` : dir;
}

// Added from another folder: Models can forget it, but its file isn't Asyncat's to remove.
function externalItem(type, model) {
  const kind = TYPES[type].kind;
  return makeItem({
    id: externalId(type, model),
    place: 'models',
    kind,
    kindLabel: KIND_LABELS[kind],
    title: model.name || model.filename,
    name: model.filename,
    where: model.source === 'huggingface-cache' ? 'Hugging Face cache' : shortFolder(path.dirname(model.path)),
    whereId: 'external',
    bytes: model.sizeBytes ?? null,
    modifiedAt: model.modifiedAt || null,
    path: model.path,
    badges: [badge('neutral', 'Another folder')],
    can: { reveal: true },
    lock: { code: 'READ_ONLY', reason: 'Added from another folder' },
    manageRoute: TYPES[type].route,
  });
}

function partialItem(subDir, entry) {
  const reason = modelInUse('llm', entry.file);
  const { badges, lock } = reason
    ? lockFor(reason, downloadOf(entry.file)?.progress ?? null)
    : { badges: [badge('warning', 'Unfinished')], lock: null };
  return fileItem({
    id: makeId('partial', subDir, entry.name),
    place: 'models',
    kind: 'unfinished',
    kindLabel: 'Unfinished',
    title: entry.name.replace(/\.part$/, ''),
    where: 'Models folder',
    whereId: 'models',
    entry,
    badges,
    lock,
    can: { preview: false, open: false, download: false },
  });
}

function modelEntries(type) {
  const dir = path.resolve(TYPES[type].dir());
  const items = [];
  for (const model of listed(type)) {
    if (model.isMissing || !model.path) continue;
    if (model.isExternal || path.resolve(path.dirname(model.path)) !== dir) {
      items.push(externalItem(type, model));
      continue;
    }
    const entry = fileIn(dir, model.filename, { links: true });
    if (entry) items.push(ownItem(type, model, entry));
  }
  return items;
}

function partialEntries() {
  return PARTIAL_DIRS.flatMap((subDir) => filesIn(modelsSubdir(subDir), { links: true, match: /\.part$/ })
    .map((entry) => partialItem(subDir, entry)));
}

/** Unfinished downloads that aren't running ("Delete unfinished downloads"). */
export function unfinishedDownloads() {
  return partialEntries().filter((item) => item.can.delete);
}

export const models = {
  id: 'models',
  label: 'Models',
  hint: 'Downloaded language, image and voice models.',

  pieces() {
    return [MODELS_DIR];
  },

  list() {
    return [...Object.keys(TYPES).flatMap(modelEntries), ...partialEntries()];
  },

  resolve: {
    model(_userId, [type, name]) {
      const dir = TYPES[type].dir();
      const model = listed(type).find((candidate) => !candidate.isExternal && candidate.filename === name
        && path.resolve(path.dirname(candidate.path)) === path.resolve(dir));
      const entry = model && fileIn(dir, name, { links: true });
      if (!entry) return null;
      return {
        item: ownItem(type, model, entry),
        target: entry.file,
        link: entry.link,
        remove: async () => {
          const freed = await removeInside(dir, entry.file);
          const settings = type === 'tts' ? fileIn(dir, `${name}.json`) : null;
          const more = settings ? await removeInside(dir, settings.file).catch(() => 0) : 0;
          forgetListings();
          return freed + more;
        },
      };
    },

    'model-ext'(_userId, [type, key]) {
      const model = listed(type).find((candidate) => !candidate.isMissing && candidate.path
        && externalId(type, candidate) === makeId('model-ext', type, key));
      return model ? { item: externalItem(type, model), target: model.path } : null;
    },

    partial(_userId, [subDir, name]) {
      if (!name.endsWith('.part')) return null;
      const dir = modelsSubdir(subDir);
      const entry = fileIn(dir, name, { links: true });
      if (!entry) return null;
      return {
        item: partialItem(subDir, entry),
        target: entry.file,
        link: entry.link,
        remove: async () => {
          const freed = await removeInside(dir, entry.file);
          forgetListings();
          return freed;
        },
      };
    },
  },
};
