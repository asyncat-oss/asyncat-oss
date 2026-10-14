// den/src/setup/setupState.js
// First-run setup: whether it was finished or skipped (ASYNCAT_SETUP_DONE in
// app_config), and whether this install already has a model or chats. It
// shows only when none is true, so people who used Asyncat before never see
// it unless they ask for it again.

import defaultDb from '../db/client.js';
import { deleteConfigValue, getConfigValue, setConfigValue } from '../config/appConfig.js';
import { listModels } from '../ai/controllers/ai/modelManager.js';

export const SETUP_DONE_KEY = 'ASYNCAT_SETUP_DONE';

const truthy = (value) => ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase());

/**
 * A model chosen for chats, a saved provider, or a model downloaded or added
 * in Asyncat: any of them means this isn't a fresh install. Models other
 * apps left in the Hugging Face cache don't count.
 */
export function hasAnyModel(userId, { db = defaultDb, localModels = listModels } = {}) {
  const active = db.prepare('SELECT model FROM ai_provider_config WHERE user_id = ?').get(userId);
  if (active?.model) return true;
  const saved = db.prepare('SELECT COUNT(*) AS count FROM ai_provider_profiles WHERE user_id = ?').get(userId);
  if (saved?.count > 0) return true;
  try {
    return localModels().some((model) => model.source !== 'huggingface-cache');
  } catch {
    return false;
  }
}

/**
 * Chats from before, also without a model: Claude Code, Codex and ACP agents
 * answer on their own.
 */
export function hasChats(userId, { db = defaultDb } = {}) {
  return Boolean(db.prepare('SELECT 1 FROM conversations WHERE user_id = ? LIMIT 1').get(userId));
}

/** { done, hasModel, hasChats, show }: `show` is whether the app opens the setup. */
export function setupStatus(userId, { read = getConfigValue, ...deps } = {}) {
  const done = truthy(read(SETUP_DONE_KEY));
  const hasModel = hasAnyModel(userId, deps);
  const chats = hasChats(userId, deps);
  return { done, hasModel, hasChats: chats, show: !done && !hasModel && !chats };
}

/** Finished or skipped (true), or to be offered again (false). */
export function markSetupDone(done, { save = setConfigValue, remove = deleteConfigValue } = {}) {
  if (typeof done !== 'boolean') throw Object.assign(new Error('done must be true or false'), { status: 400 });
  if (done) save(SETUP_DONE_KEY, '1');
  else remove(SETUP_DONE_KEY);
}
