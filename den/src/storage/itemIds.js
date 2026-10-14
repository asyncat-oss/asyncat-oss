// den/src/storage/itemIds.js
// Files names every item by an id den made in a listing, never by a path:
// "<type>:<part>:<part>…", each part URI-encoded so it can hold ":" or "/".
// A request only echoes an id back; parseId checks every part's shape (a
// file name must be a plain name) before anything is looked up.

import { isPlainName } from './safeFs.js';

const ROW = /^[\w-]{1,128}$/;
const ROOT = /^(chats|engines|(project|agent|cat|cat-gone):[\w-]{1,128})$/;

const PARTS = {
  name: isPlainName,
  row: (value) => ROW.test(value),
  root: (value) => ROOT.test(value),
  modelType: (value) => ['llm', 'image', 'vision', 'whisper', 'tts'].includes(value),
  modelDir: (value) => ['', 'image', 'vision', 'audio/whisper', 'audio/tts'].includes(value),
  owner: (value) => ['project', 'agent'].includes(value),
  logs: (value) => ['backend-app', 'backend-error', 'backend-http'].includes(value),
  cache: (value) => ['voice-samples', 'engine-tmp', 'agent-tmp'].includes(value),
  system: (value) => /^[a-z][a-z-]{0,39}$/.test(value),
};

// The parts each type of id has.
const SHAPES = {
  made: ['root', 'name'], // an agent's saved file, by folder id and name
  picture: ['name'],
  note: ['row'],
  model: ['modelType', 'name'],
  'model-ext': ['modelType', 'row'], // added from another folder: never removed
  partial: ['modelDir', 'name'], // an unfinished download
  'note-file': ['row', 'name'],
  'chat-file': ['root', 'name'],
  knowledge: ['owner', 'row', 'row'],
  dataset: ['name'],
  adapter: ['row'],
  result: ['name'], // a training run's output folder
  export: ['name'],
  log: ['logs', 'name'],
  'process-log': [],
  cache: ['cache'],
  undo: ['root'],
  copies: [],
  system: ['system'],
};

export function makeId(type, ...parts) {
  return [type, ...parts.map((part) => encodeURIComponent(String(part ?? '')))].join(':');
}

/** `{ type, parts }` for a well-formed id, otherwise null. */
export function parseId(id) {
  const raw = String(id ?? '');
  if (!raw || raw.length > 2048 || raw.includes('\0')) return null;
  const [type, ...encoded] = raw.split(':');
  const shape = Object.hasOwn(SHAPES, type) ? SHAPES[type] : null;
  if (!shape || encoded.length !== shape.length) return null;
  let parts;
  try {
    parts = encoded.map((part) => decodeURIComponent(part));
  } catch {
    return null;
  }
  return parts.every((part, index) => PARTS[shape[index]](part)) ? { type, parts } : null;
}
