// neko/src/CommandCenter/utils/chatModel.js
// ─── A chat's own model ──────────────────────────────────────────────────────
// Each chat runs on its own model (den/src/ai/controllers/ai/chatModel.js): the
// one it keeps in its metadata (`metadata.model`), else the default model, the
// one picked last. These rules turn saved models and local files into the
// composer's model menu, say which one a chat is on, and name it the same way
// everywhere. No React, so node:test can cover them.

import { friendlyModelName } from '../../utils/modelNames.js';

const LOCAL_ENGINE = 'llamacpp-builtin';
const MAX_NAME = 120;

const baseName = (file) => String(file || '').split(/[\\/]/).filter(Boolean).pop() || '';
const isPath = (file) => /[\\/]/.test(String(file || ''));
const cleanPath = (file) => String(file || '').replace(/\\/g, '/').replace(/\/+$/, '');

function cleanName(name) {
  const text = typeof name === 'string' ? name.trim() : '';
  return text && text.length <= MAX_NAME ? text : '';
}

/**
 * A model reference, { kind: 'profile', profileId } (a saved model) or
 * { kind: 'local', file } (a model file), with its `name` when it has one;
 * null for anything else, which means "the default model".
 */
export function modelRef(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let ref = null;
  if (value.kind === 'profile' && value.profileId) ref = { kind: 'profile', profileId: String(value.profileId) };
  if (value.kind === 'local' && value.file) ref = { kind: 'local', file: String(value.file) };
  if (!ref) return null;
  const name = cleanName(value.name);
  return name ? { ...ref, name } : ref;
}

/**
 * Whether two names of a local model file are the same file: by full path
 * when both are one (files kept elsewhere can share a name), else by file
 * name (a file in the models folder goes by its name or its path).
 */
export function sameLocalFile(a, b) {
  if (!a || !b) return false;
  if (isPath(a) && isPath(b)) return cleanPath(a) === cleanPath(b);
  return baseName(a) === baseName(b);
}

/** Whether two references name the same model. */
export function sameModel(a, b) {
  const left = modelRef(a);
  const right = modelRef(b);
  if (!left || !right || left.kind !== right.kind) return false;
  return left.kind === 'profile' ? left.profileId === right.profileId : sameLocalFile(left.file, right.file);
}

/**
 * A local model's name as people see it: its file name without .gguf or .bin,
 * as den names it (a file in the Hugging Face cache too, not its repo).
 */
export function localModelName(file) {
  return baseName(file).replace(/\.(gguf|bin)$/i, '') || 'Local model';
}

/** A saved model's name: its model id, read the way people say it. */
function savedModelName(profile) {
  const raw = String(profile?.settings?.model_name || profile?.model || '').trim();
  if (raw === 'openrouter/auto') return 'Auto (OpenRouter picks)';
  return friendlyModelName(raw);
}

/**
 * The default model's reference, worked out from the app-wide config
 * (GET /api/ai/providers/config) the way den does: a saved model, or a file
 * for the built-in engine. Other defaults (MLX, an unsaved endpoint) have none.
 */
export function defaultModelRef(config) {
  if (!config) return null;
  if (config.profile_id) return { kind: 'profile', profileId: String(config.profile_id) };
  if (config.provider_id === LOCAL_ENGINE && config.model) {
    return { kind: 'local', file: String(config.model), name: localModelName(config.model) };
  }
  return null;
}

/** The default model's name from the app-wide config, said the way the menu says it. */
export function configModelName(config) {
  if (!config?.model) return '';
  return config.provider_id === LOCAL_ENGINE ? localModelName(config.model) : savedModelName(config);
}

/**
 * The composer's model menu: saved models (providers and other servers),
 * then the model files on this computer. Saved entries for the built-in
 * engine are left out, as their files are listed themselves. A file in the
 * models folder goes by its name; one kept elsewhere (linked, or in the
 * Hugging Face cache) by its full path, as Models loads it. `loadedFile` is
 * the file the built-in engine has loaded now, if any.
 */
export function modelOptions({ profiles = [], localModels = [], loadedFile = null } = {}) {
  const saved = (Array.isArray(profiles) ? profiles : [])
    .filter((profile) => profile?.id && profile.provider_id !== LOCAL_ENGINE)
    .map((profile) => {
      const model = savedModelName(profile);
      const name = String(profile.name || '').trim();
      const label = model || name || 'Saved model';
      return {
        key: `profile:${profile.id}`,
        group: 'saved',
        ref: { kind: 'profile', profileId: String(profile.id) },
        label,
        detail: name && name !== label ? name : '',
        isLocal: Boolean(profile.local),
        supportsTools: Boolean(profile.supports_tools),
        capabilities: profile.capabilities || null,
      };
    });
  const seen = new Set();
  const files = (Array.isArray(localModels) ? localModels : [])
    .filter((model) => model?.filename && !model.isMissing)
    .filter((model) => {
      const where = cleanPath(model.path || model.filename);
      if (seen.has(where)) return false;
      seen.add(where);
      return true;
    })
    .map((model) => {
      const hfCache = model.source === 'huggingface-cache';
      const file = (model.isExternal || hfCache) && model.path ? String(model.path) : String(model.filename);
      const label = localModelName(model.filename);
      const loaded = sameLocalFile(loadedFile, file);
      // A linked file's own name on Models tells two files with one name apart.
      const linkedAs = model.isExternal && !hfCache && cleanName(model.name) !== label ? cleanName(model.name) : '';
      const kept = hfCache ? 'Hugging Face cache' : model.isExternal ? 'Linked file' : '';
      return {
        key: `local:${file}`,
        group: 'local',
        ref: { kind: 'local', file },
        label,
        detail: [loaded ? 'Loaded' : '', kept, linkedAs, model.sizeFormatted || ''].filter(Boolean).join(' · '),
        isLocal: true,
        supportsTools: false,
        capabilities: model.capabilities || null,
        loaded,
      };
    });
  return [...saved, ...files];
}

/** Whether the list a reference would be on has loaded: `loaded` is { profiles, local }, or true for both. */
function listLoaded(loaded, ref) {
  if (loaded && typeof loaded === 'object') return Boolean(ref.kind === 'local' ? loaded.local : loaded.profiles);
  return Boolean(loaded);
}

/**
 * The model a chat runs on, as the composer shows it: { ref, name, isLocal,
 * supportsTools, capabilities, followsDefault, missing }. The chat's own
 * model, else the default. `fallback` describes the default when it has no
 * reference (useActiveBrainStatus). `loaded` says which of the menu's lists
 * are in ({ profiles, local }), so a model of the chat's that isn't on its
 * list was removed (`missing`).
 */
export function chatModelInfo({ chatRef = null, defaultRef = null, options = [], fallback = null, loaded = false } = {}) {
  const own = modelRef(chatRef);
  const ref = own || modelRef(defaultRef);
  const followsDefault = !own;
  if (!ref) {
    return {
      ref: null,
      name: fallback?.defaultName || fallback?.model || fallback?.providerName || '',
      isLocal: Boolean(fallback?.isLocal),
      supportsTools: Boolean(fallback?.supportsTools),
      capabilities: fallback?.capabilities || null,
      followsDefault,
      missing: false,
    };
  }
  const option = options.find((item) => sameModel(item.ref, ref));
  if (option) {
    return {
      ref: { ...ref, name: option.label },
      name: option.label,
      isLocal: option.isLocal,
      supportsTools: option.supportsTools,
      capabilities: option.capabilities,
      followsDefault,
      missing: false,
    };
  }
  // Not on the menu: the lists aren't in yet, or the model was removed. The
  // default is described by the app-wide config meanwhile.
  const fromDefault = followsDefault && fallback;
  return {
    ref,
    name: ref.name || (ref.kind === 'local' ? localModelName(ref.file) : fromDefault ? (fallback.defaultName || fallback.model || fallback.providerName || '') : 'Saved model'),
    isLocal: ref.kind === 'local',
    supportsTools: fromDefault ? Boolean(fallback.supportsTools) : false,
    capabilities: fromDefault ? (fallback.capabilities || null) : null,
    followsDefault,
    missing: listLoaded(loaded, ref),
  };
}

/** The menu entry for an agent's own model, or null when the agent has none. */
export function agentModelOption(agent, options = []) {
  if (!agent?.model_profile_id) return null;
  const ref = { kind: 'profile', profileId: String(agent.model_profile_id) };
  return options.find((item) => sameModel(item.ref, ref)) || null;
}

/**
 * Why the composer can't send yet because of the model, or null. A chat on a
 * saved model or a model file never waits here: a local one loads when the
 * message is sent. Only a default without either (MLX) needs its server.
 */
export function modelBlockReason({ model, brain }) {
  if (model?.ref) return null;
  if (!brain) return null;
  if (brain.loading) return 'Checking which model is ready…';
  if (!brain.isBuiltin) return null;
  if (brain.isLoadingModel) return brain.model ? `${brain.model} is still loading.` : 'The model is still loading.';
  if (brain.isReady) return null;
  if (brain.status === 'error') return "The model couldn't load. Pick another one to keep chatting.";
  if (brain.rawModel) return `${brain.model || 'The chosen model'} isn't loaded right now.`;
  return 'No model yet. Choose one to start chatting.';
}

/** What a run's model events do to the run: { modelLoading }, or null for any other event. */
export function modelEventPatch(event) {
  const data = event?.data || {};
  if (event?.type === 'model_loading') {
    return { modelLoading: { name: cleanName(data.name) || null, waitingFor: cleanName(data.waitingFor) || null } };
  }
  if (event?.type === 'model_ready' || event?.type === 'chat_model') return { modelLoading: null };
  return null;
}

/** What the model button says while a run loads this chat's model, or the model's name. */
export function modelStatusText({ name = '', loading = null } = {}) {
  if (!loading) return name || 'Choose a model';
  const model = loading.name || name || 'the model';
  return loading.waitingFor ? `Waiting to load ${model}…` : `Loading ${model}…`;
}

/**
 * A chat's metadata once a run says which model it ran on ("chat_model"). A
 * chat without a model of its own keeps the default it first ran on, as den
 * does; an agent's own model isn't the chat's. Returns the same object when
 * nothing changes.
 */
export function metadataWithRunModel(metadata, data) {
  const ref = modelRef(data?.model);
  if (!ref || data?.source === 'agent' || modelRef(metadata?.model)) return metadata;
  const name = cleanName(data?.name);
  return { ...(metadata || {}), model: name ? { ...ref, name } : ref };
}
