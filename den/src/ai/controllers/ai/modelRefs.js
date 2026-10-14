// modelRefs.js — how a chat names the model it runs on.
//
// A model reference is one of:
//   { kind: 'profile', profileId }  a saved model (a provider on the Models page)
//   { kind: 'local', file }         a model file for the built-in llama.cpp
//                                   server: its name in the models folder, or
//                                   the full path of one kept elsewhere
// Either may carry `name`, what it was called when picked, so a message about
// a model that has since been removed can still say which one it was.
// The composer's own spellings ("provider:<id>", "local:<file>") work too.
// null means "the default model".

import path from 'path';
import { LLAMA_PROVIDER_ID } from './providerCatalog.js';

const MAX_ID = 200;
const MAX_FILE = 4096;
const MAX_NAME = 120;

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || text.length > max || text.includes('\0')) return '';
  return text;
}

function withName(ref, name) {
  const clean = cleanText(name, MAX_NAME);
  return clean ? { ...ref, name: clean } : ref;
}

/** A model reference from what a request sent, or null when it names none. */
export function normalizeModelRef(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    const profileId = text.match(/^(?:provider|profile):(.+)$/)?.[1];
    if (profileId) return normalizeModelRef({ kind: 'profile', profileId });
    const file = text.match(/^local:(.+)$/)?.[1];
    if (file) return normalizeModelRef({ kind: 'local', file });
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.kind === 'profile') {
    const profileId = cleanText(value.profileId, MAX_ID);
    return profileId ? withName({ kind: 'profile', profileId }, value.name) : null;
  }
  if (value.kind === 'local') {
    const file = cleanText(value.file, MAX_FILE);
    return file ? withName({ kind: 'local', file }, value.name) : null;
  }
  return null;
}

/** Whether two references name the same model (their names don't count). */
export function sameModelRef(a, b) {
  const left = normalizeModelRef(a);
  const right = normalizeModelRef(b);
  if (!left || !right) return !left && !right;
  if (left.kind !== right.kind) return false;
  return left.kind === 'profile' ? left.profileId === right.profileId : left.file === right.file;
}

/** A local model's name as people see it: its file name without the extension. */
export function localModelName(file) {
  return path.basename(String(file || '')).replace(/\.(gguf|bin)$/i, '') || 'the local model';
}

/**
 * The default model's reference, from the user's ai_provider_config row: a
 * saved model, or a file for the built-in server. Other defaults (MLX, an
 * unsaved custom endpoint, the .env fallback) have no reference: chats that
 * run on them keep following the default.
 */
export function modelRefFromConfig(row) {
  if (!row) return null;
  if (row.profile_id) return { kind: 'profile', profileId: String(row.profile_id) };
  if (row.provider_id === LLAMA_PROVIDER_ID && row.model) {
    return normalizeModelRef({ kind: 'local', file: String(row.model), name: localModelName(row.model) });
  }
  return null;
}
