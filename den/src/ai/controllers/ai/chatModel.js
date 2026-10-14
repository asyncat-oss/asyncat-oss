// chatModel.js — the model each chat runs on, and the default model.
//
// A chat remembers its model in its metadata (`metadata.model`, a reference
// from modelRefs.js), as it remembers its engine. A chat without one runs on
// the default model and remembers it from its first run on, so a later change
// of default doesn't move it.
//
// The default model lives in the user's ai_provider_config row. That row was
// already the app-wide "active provider": what the Models page shows as in
// use, what Quick ask, titles and Cats without a model of their own run on.
// Keeping the default there, rather than in a second setting beside it, leaves
// one answer to "which model is the default" that the Models page, the
// composer and Cats can't disagree on. Picking a model in a chat also makes it
// the default, so new chats start with the model used last; other chats keep
// their own.
//
// Opening a provider's model never touches llama-server. A local model file
// that isn't loaded is loaded for the run (localModelSwitch.js), and the run
// holds it until it ends, except while it waits for the user.

import fs from 'fs';
import path from 'path';
import db from '../../../db/client.js';
import { sealSecret } from '../../../lib/secretBox.js';
import { chatService } from './chatService.js';
import { clientForLoadedLocalModel, clientFromProviderRow, getAiClientForUser } from './clientFactory.js';
import { createLocalModelSwitch } from './localModelSwitch.js';
import { getStatus as getLlamaStatus, startServer, subscribe as llamaSubscribe } from './llamaServerManager.js';
import { listModels, MODELS_DIR } from './modelManager.js';
import { localModelName, modelRefFromConfig, normalizeModelRef, sameModelRef } from './modelRefs.js';
import {
  getProviderPreset,
  LLAMA_BASE_URL,
  parseSettings,
  providerRequiresBuiltinServer,
  providerSupportsTools,
} from './providerCatalog.js';

const DEFAULT_LOCAL_CTX = 8192;
// How long a run may wait for the user before its local model is let go.
const WAIT_GRACE_MS = 3000;

export const localModels = createLocalModelSwitch({
  getStatus: getLlamaStatus,
  startServer: (modelPath, ctxSize) => startServer(modelPath, MODELS_DIR, ctxSize),
  subscribe: llamaSubscribe,
});

// ── Errors ───────────────────────────────────────────────────────────────────

/** A model that can't be used. It says which, so the user can pick another. */
export class ModelUnavailableError extends Error {
  constructor(message, { ref = null, name = null } = {}) {
    super(message);
    this.name = 'ModelUnavailableError';
    this.code = 'model_unavailable';
    this.model = ref;
    this.modelName = name;
  }
}

/** What a run sends the app about a model that can't be used. */
export function modelErrorDetails(err) {
  if (!(err instanceof ModelUnavailableError)) return {};
  return { code: err.code, model: err.model, modelName: err.modelName };
}

// ── The default model ────────────────────────────────────────────────────────

const defaultListeners = new Set();

/** Be told (with the user's id) when the default model changes. */
export function onDefaultModelChange(fn) {
  defaultListeners.add(fn);
  return () => defaultListeners.delete(fn);
}

function defaultChanged(userId) {
  for (const fn of defaultListeners) {
    try { fn(userId); } catch { /* a listener's failure isn't the caller's */ }
  }
}

function configRow(userId) {
  return db.prepare('SELECT * FROM ai_provider_config WHERE user_id = ?').get(userId) || null;
}

function profileRow(userId, profileId) {
  return db.prepare('SELECT * FROM ai_provider_profiles WHERE user_id = ? AND id = ?').get(userId, profileId) || null;
}

/** Make a saved model (a provider profile row) the default. Returns the time. */
export function saveDefaultFromProfile(userId, row) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO ai_provider_config (
      user_id, profile_id, provider_type, provider_id, base_url, model,
      api_key, settings, supports_tools, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      profile_id = excluded.profile_id,
      provider_type = excluded.provider_type,
      provider_id = excluded.provider_id,
      base_url = excluded.base_url,
      model = excluded.model,
      api_key = excluded.api_key,
      settings = excluded.settings,
      supports_tools = excluded.supports_tools,
      updated_at = excluded.updated_at
  `).run(
    userId,
    row.id,
    row.provider_type,
    row.provider_id,
    row.base_url,
    row.model,
    sealSecret(row.api_key) || null,
    row.settings || '{}',
    providerSupportsTools(row) ? 1 : 0,
    now,
  );
  return now;
}

/**
 * Make a local model file the default. The context size is kept so the model
 * loads the same way when Asyncat next starts (see localModelRestore.js).
 */
export function saveDefaultLocalModel(userId, file, ctxSize = null) {
  const now = new Date().toISOString();
  const settings = JSON.stringify(Number(ctxSize) > 0 ? { ctx_size: Number(ctxSize) } : {});
  db.prepare(`
    INSERT INTO ai_provider_config (user_id, profile_id, provider_type, provider_id, base_url, model, api_key, settings, supports_tools, updated_at)
    VALUES (?, NULL, 'local', 'llamacpp-builtin', ?, ?, NULL, ?, 0, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      profile_id     = NULL,
      provider_type = 'local',
      provider_id   = 'llamacpp-builtin',
      base_url      = excluded.base_url,
      model         = excluded.model,
      api_key       = NULL,
      settings      = excluded.settings,
      supports_tools = 0,
      updated_at    = excluded.updated_at
  `).run(userId, LLAMA_BASE_URL, file, settings, now);
  return now;
}

/** The default model's reference, or null for one that has none (see modelRefs.js). */
export function defaultModelRef(userId) {
  return modelRefFromConfig(configRow(userId));
}

/**
 * A picked model, checked: { ref, name }. Throws ModelUnavailableError when
 * it names nothing, or a saved model or local file that is gone.
 */
export function checkModelRef(userId, value) {
  const ref = normalizeModelRef(value);
  if (!ref) throw new ModelUnavailableError('Pick a model.');
  const name = describeModelRef(userId, ref);
  if (ref.kind === 'profile') {
    if (!profileRow(userId, ref.profileId)) {
      throw new ModelUnavailableError(`${name} was removed from your models. Pick another model.`, { ref, name });
    }
  } else {
    checkedLocalModelPath(ref.file, ref, name);
  }
  return { ref, name };
}

/** Make a model the default. Loads nothing: a local model loads when it's first used. */
export function setDefaultModel(userId, value) {
  const { ref, name } = checkModelRef(userId, value);
  if (ref.kind === 'profile') {
    const row = profileRow(userId, ref.profileId);
    const now = saveDefaultFromProfile(userId, row);
    // Recently used saved models are listed first.
    db.prepare('UPDATE ai_provider_profiles SET updated_at = ? WHERE id = ? AND user_id = ?').run(now, row.id, userId);
  } else {
    const status = getLlamaStatus();
    const loadedCtx = samePath(status.modelPath, localModelPath(ref.file)) ? status.ctxSize : null;
    saveDefaultLocalModel(userId, ref.file, loadedCtx || savedLocalCtx(userId));
  }
  defaultChanged(userId);
  return { model: ref, name };
}

function savedLocalCtx(userId) {
  const row = configRow(userId);
  return providerRequiresBuiltinServer(row || {}) ? Number(parseSettings(row.settings).ctx_size) || null : null;
}

// ── Naming models ────────────────────────────────────────────────────────────

function profileLabel(row) {
  const name = String(row?.name || '').trim();
  const model = String(row?.model || '').trim();
  if (name && model && name !== model) return `${name} · ${model}`;
  return name || model || 'A saved model';
}

/** What to call a model in the app and in messages about it. */
export function describeModelRef(userId, value) {
  const ref = normalizeModelRef(value);
  if (!ref) {
    const row = configRow(userId);
    const fromConfig = modelRefFromConfig(row);
    if (fromConfig) return describeModelRef(userId, fromConfig);
    return row?.model ? path.basename(String(row.model)) : 'The default model';
  }
  if (ref.kind === 'profile') {
    const row = profileRow(userId, ref.profileId);
    return row ? profileLabel(row) : (ref.name || 'A saved model');
  }
  return ref.name || localModelName(ref.file);
}

// ── A chat's own model ───────────────────────────────────────────────────────

/** The model a chat remembers, or null when it follows the default. */
export function chatModelRef(userId, conversationId) {
  if (!conversationId) return null;
  const row = db.prepare(`
    SELECT json_extract(CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END, '$.model') AS model
    FROM conversations WHERE id = ? AND user_id = ? AND deleted_at IS NULL
  `).get(String(conversationId), userId);
  try { return normalizeModelRef(row?.model ? JSON.parse(row.model) : null); } catch { return null; }
}

/** Remember `ref` as a chat's model (null forgets it). Returns whether the chat was found. */
export function rememberChatModel(userId, conversationId, value) {
  if (!conversationId) return false;
  const ref = normalizeModelRef(value);
  const named = ref ? { ...ref, name: describeModelRef(userId, ref) } : null;
  return chatService.setMetadataKey(userId, String(conversationId), 'model', named);
}

/**
 * Which model a run uses: the agent's own when it has one, else the model the
 * app asked for (the chat's, as the composer shows it), else the one the chat
 * remembers, else the default. `fallback` is what to use if the agent's own
 * model can't be opened. `remember` says the chat should keep this model.
 */
export function chooseRunModel({ userId, agentProfile = null, requested = null, conversationId = null }) {
  const asked = normalizeModelRef(requested);
  const stored = chatModelRef(userId, conversationId);
  const chat = asked
    ? { ref: asked, source: 'chat' }
    : stored
      ? { ref: stored, source: 'chat' }
      : { ref: defaultModelRef(userId), source: 'default' };
  const remember = Boolean(conversationId && chat.ref && !sameModelRef(chat.ref, stored));
  if (agentProfile?.model_profile_id) {
    return {
      ref: { kind: 'profile', profileId: agentProfile.model_profile_id },
      source: 'agent',
      fallback: { ...chat, remember },
      remember: false,
    };
  }
  return { ...chat, remember };
}

// ── Opening a model for a run ────────────────────────────────────────────────

function samePath(a, b) {
  return Boolean(a && b) && path.resolve(a) === path.resolve(b);
}

function knownLocalModels() {
  try { return listModels(); } catch { return []; }
}

/**
 * Where a local model file is: in the models folder, or one of the files kept
 * elsewhere that Models lists. Anything else is no model of the user's: null.
 */
export function localModelPath(file) {
  const text = String(file || '').trim();
  if (!text) return null;
  if (path.isAbsolute(text)) {
    if (samePath(path.dirname(text), MODELS_DIR)) return path.resolve(text);
    return knownLocalModels().find((model) => samePath(model.path, text))?.path || null;
  }
  const inFolder = path.join(MODELS_DIR, path.basename(text));
  if (fs.existsSync(inFolder)) return inFolder;
  return knownLocalModels().find((model) => model.filename === path.basename(text) && !model.isMissing)?.path || inFolder;
}

function checkedLocalModelPath(file, ref, name) {
  const modelPath = localModelPath(file);
  if (!modelPath) throw new ModelUnavailableError(`${name} isn't one of your local models. Pick another model.`, { ref, name });
  if (!fs.existsSync(modelPath)) throw new ModelUnavailableError(`${name} isn't on this computer any more. Pick another model.`, { ref, name });
  return modelPath;
}

/** The context size to load a local model with: asked for, else as now, else as last time. */
function localCtxSize(userId, requested) {
  const asked = Math.floor(Number(requested));
  if (asked >= 512) return asked;
  const status = getLlamaStatus();
  if ((status.status === 'ready' || status.status === 'loading') && status.ctxSize) return status.ctxSize;
  return savedLocalCtx(userId) || DEFAULT_LOCAL_CTX;
}

async function openLocal(userId, ref, name, { file = ref.file, settings = {}, profileId = null, ctxSize, signal, onProgress, waitGraceMs = WAIT_GRACE_MS }) {
  const modelPath = checkedLocalModelPath(file, ref, name);
  let last = null;
  const progress = (phase, waitingFor = null) => {
    const key = `${phase}:${waitingFor || ''}`;
    if (key === last) return;
    last = key;
    onProgress?.({ phase, waitingFor, model: ref, name });
  };
  const options = {
    ctxSize: localCtxSize(userId, ctxSize),
    signal,
    onWait: (busy) => progress('waiting', localModelName(busy)),
    onLoad: () => progress('loading'),
  };
  // Wait for the model (loading it if need be) and take a lease on it.
  const hold = async () => {
    const status = getLlamaStatus();
    const loaded = status.status === 'ready' && samePath(status.modelPath, modelPath);
    if (!loaded) progress('loading');
    let release;
    try {
      release = await localModels.acquire(modelPath, options);
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw new ModelUnavailableError(`${name} couldn't load: ${err.message}`, { ref, name });
    }
    if (!loaded) progress('ready');
    return release;
  };

  let lease = await hold();
  let closed = false;
  const release = () => {
    closed = true;
    lease?.();
    lease = null;
  };
  let resolved;
  try {
    resolved = clientForLoadedLocalModel({ settings, profileId, name });
  } catch (err) {
    release();
    throw new ModelUnavailableError(`${name} couldn't load: ${err.message}`, { ref, name });
  }
  // While the run waits for the user (an approval, a question; a Cat may wait
  // hours), other chats may use the server; the model is loaded again after.
  // A wait that ends within the grace period (a Cat's freedom allowing a step
  // at once) keeps it, so runs don't swap models back and forth.
  let waiting = 0;
  let freed = false;
  const whileWaiting = async (wait) => {
    if (closed) return wait();
    waiting += 1;
    const timer = setTimeout(() => {
      if (!lease || closed) return;
      freed = true;
      lease();
      lease = null;
    }, waitGraceMs);
    try {
      return await wait();
    } finally {
      clearTimeout(timer);
      waiting -= 1;
      if (waiting === 0 && freed && !closed) {
        freed = false;
        const again = await hold();
        if (closed) again();
        else lease = again;
      }
    }
  };
  return { ref, name, resolved, release, whileWaiting };
}

/**
 * Open a model for one run: { ref, name, resolved, release, whileWaiting }.
 * `resolved` is the client (as getAiClientForUser returns one). Call
 * `release()` when the run ends, and wrap waits for the user in
 * `whileWaiting(() => wait)` so a local model isn't held meanwhile. A null ref
 * opens the default model as it is. Options: `ctxSize` for a local model that
 * has to load, `signal` to stop waiting, and `onProgress({ phase:
 * 'loading'|'waiting'|'ready', waitingFor, model, name })` while one loads.
 */
export async function openModel(userId, value, { ctxSize = null, signal = null, onProgress = null, waitGraceMs = WAIT_GRACE_MS } = {}) {
  const ref = normalizeModelRef(value);
  const name = describeModelRef(userId, ref);
  const noRelease = () => {};
  const whileWaiting = (wait) => wait();

  if (!ref) {
    try {
      const resolved = getAiClientForUser(userId);
      return { ref: null, name: resolved?.providerInfo?.name || resolved?.model || name, resolved, release: noRelease, whileWaiting };
    } catch (err) {
      throw new ModelUnavailableError(err.message, { name });
    }
  }

  if (ref.kind === 'local') return openLocal(userId, ref, name, { ctxSize, signal, onProgress, waitGraceMs });

  const row = profileRow(userId, ref.profileId);
  if (!row) throw new ModelUnavailableError(`${name} was removed from your models. Pick another model.`, { ref, name });
  // A saved entry for the built-in server: its file, loaded for the run.
  if (providerRequiresBuiltinServer(row) && row.model) {
    return openLocal(userId, ref, name, {
      file: row.model, settings: row.settings, profileId: row.id, ctxSize, signal, onProgress, waitGraceMs,
    });
  }
  if (getProviderPreset(row.provider_id)?.requiresApiKey && !row.api_key && !process.env.AI_API_KEY) {
    throw new ModelUnavailableError(`${name} has no API key. Add one on the Models page, or pick another model.`, { ref, name });
  }
  try {
    return { ref, name, resolved: clientFromProviderRow(row), release: noRelease, whileWaiting };
  } catch (err) {
    throw new ModelUnavailableError(`${name} can't be used: ${err.message}`, { ref, name });
  }
}

/**
 * Open the model a run chose (chooseRunModel): the agent's own if it can be
 * opened, else the chat's. Remembers the chat's model on the chat when it's
 * new to it, unless `temporary`. Resolves to openModel's result plus `source`.
 */
export async function openRunModel(userId, choice, { conversationId = null, temporary = false, ...options } = {}) {
  let picked = choice;
  let opened;
  try {
    opened = await openModel(userId, picked.ref, options);
  } catch (err) {
    if (!choice.fallback || err?.name === 'AbortError') throw err;
    console.warn(`[chatModel] The agent's own model can't be used, so the chat's is: ${err.message}`);
    picked = choice.fallback;
    opened = await openModel(userId, picked.ref, options);
  }
  if (picked.remember && !temporary && conversationId) {
    try { rememberChatModel(userId, conversationId, picked.ref); } catch (err) {
      console.warn('[chatModel] Could not remember the chat\'s model:', err.message);
    }
  }
  return { ...opened, source: picked.source };
}
