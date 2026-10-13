// clientFactory.js — per-user AI client resolution
// Extracted from chat/chatRouter.js so all subsystems (agent, routes) share one source of truth.

import OpenAI from 'openai';
import { config } from 'dotenv';
import db from '../../../db/client.js';
import { sealSecret } from '../../../lib/secretBox.js';
import { getStatus as getLlamaStatus } from './llamaServerManager.js';
import { getStatus as getMlxStatus } from './mlxServerManager.js';
import {
  LLAMA_BASE_URL,
  MLX_PROVIDER_ID,
  normalizeBaseUrl,
  parseSettings,
  providerRequiresBuiltinServer,
  providerSupportsTools,
} from './providerCatalog.js';

config();

const GLOBAL_AI_MODEL    = process.env.AI_MODEL    || 'local';
const GLOBAL_AI_BASE_URL = process.env.AI_BASE_URL || LLAMA_BASE_URL;
const GLOBAL_AI_API_KEY  = process.env.AI_API_KEY  || 'local';

function isLocalBaseUrl(baseUrl) {
  return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(baseUrl || '');
}

function isBuiltinLlamaBaseUrl(baseUrl) {
  const port = process.env.LLAMA_SERVER_PORT ?? '8765';
  return new RegExp(`^(https?:\\/\\/)?(127\\.0\\.0\\.1|localhost):${port}(\\/|$)`, 'i').test(baseUrl || '');
}

// Errors starting with this reach the user as-is instead of falling back to
// the default client, which would only fail later with "Connection error".
const LOCAL_NOT_READY = 'Local model is not ready';

function assertLocalModelReady() {
  const status = getLlamaStatus();
  if (status.status === 'ready') return status;
  if (status.status === 'loading') {
    throw new Error(`${LOCAL_NOT_READY}: ${status.model || 'the model'} is still loading. Try again in a moment.`);
  }
  throw new Error(`${LOCAL_NOT_READY}: no downloaded model is loaded. Open Models → Local models and load one, or switch to another provider.`);
}

/**
 * The built-in llama.cpp server knows its real context size and whether a
 * vision projector is loaded; those beat any guess from the model's name.
 */
function withLocalServerFacts(settings, localStatus) {
  if (!localStatus) return settings;
  const next = { ...settings };
  if (localStatus.ctxSize) next.context_window = localStatus.ctxSize;
  if (localStatus.ctxTrain) next.max_context_window = localStatus.ctxTrain;
  next.model_capabilities = {
    ...(settings.model_capabilities || {}),
    supportsImageInput: Boolean(localStatus.vision),
  };
  return next;
}

function assertMlxModelReady() {
  const status = getMlxStatus();
  if (status.status === 'ready') return status;
  if (status.status === 'loading') {
    throw new Error(`${LOCAL_NOT_READY}: the MLX model is still loading. Try again in a moment.`);
  }
  throw new Error(`${LOCAL_NOT_READY}: the MLX model isn't running. Load it again from Models → Local models, or switch to another model.`);
}

// Global fallback client (built-in llama server)
import OpenAIClient from './openAIClient.js';
import LocalRuntimeClient from './localRuntimeClient.js';
import CodexDirectClient from './codexDirectClient.js';

const globalClient = new OpenAIClient({
  endpoint:     GLOBAL_AI_BASE_URL,
  apiKey:       GLOBAL_AI_API_KEY,
  defaultModel: GLOBAL_AI_MODEL,
});

function persistCodexTokens(userId, profileId, tokenBundle) {
  if (!userId) return;
  const now = new Date().toISOString();
  db.prepare('UPDATE ai_provider_config SET api_key = ?, updated_at = ? WHERE user_id = ?')
    .run(sealSecret(tokenBundle), now, userId);
  if (profileId) {
    db.prepare('UPDATE ai_provider_profiles SET api_key = ?, updated_at = ? WHERE user_id = ? AND id = ?')
      .run(sealSecret(tokenBundle), now, userId, profileId);
  }
}

/**
 * Resolve the AI client and model for a specific user.
 * Falls back to global .env config if the user has no provider configured.
 *
 * @param {string} userId
 * @returns {{ client: OpenAIClient, model: string, isLocal: boolean,
 *             requiresLocalServer: boolean, supportsNativeTools: boolean,
 *             providerInfo: object|null }}
 */
export function getAiClientForUser(userId) {
  try {
    const row = db
      .prepare('SELECT user_id, profile_id, provider_type, provider_id, base_url, model, api_key, settings, supports_tools FROM ai_provider_config WHERE user_id = ?')
      .get(userId);

    if (!row) {
      const isLocal = isLocalBaseUrl(GLOBAL_AI_BASE_URL);
      const requiresLocalServer = isBuiltinLlamaBaseUrl(GLOBAL_AI_BASE_URL);
      const localStatus = requiresLocalServer ? assertLocalModelReady() : null;
      return {
        client: globalClient,
        model: localStatus?.model || GLOBAL_AI_MODEL,
        isLocal,
        requiresLocalServer,
        supportsNativeTools: !isLocal,
        providerInfo: null,
      };
    }

    const isLocal = row.provider_type === 'local';
    const requiresLocalServer = providerRequiresBuiltinServer(row);
    const baseUrl = normalizeBaseUrl(row.base_url, row.provider_id);
    const supportsNativeTools = providerSupportsTools(row);
    const localStatus = requiresLocalServer ? assertLocalModelReady() : null;
    const settings = withLocalServerFacts(parseSettings(row.settings), localStatus);
    if (row.provider_id === MLX_PROVIDER_ID) assertMlxModelReady();
    const apiKey = isLocal ? (row.api_key || 'local') : (row.api_key || GLOBAL_AI_API_KEY);

    if (row.provider_id === 'openai-codex') {
      const userClient = new CodexDirectClient({
        apiKey: row.api_key,
        defaultModel: row.model,
        baseURL: baseUrl,
        onTokens: tokenBundle => persistCodexTokens(userId, row.profile_id, tokenBundle),
      });
      return {
        client: userClient,
        model: row.model,
        isLocal: false,
        requiresLocalServer: false,
        supportsNativeTools: false,
        provider_type: row.provider_type,
        providerInfo: {
          type: row.provider_type,
          providerId: row.provider_id,
          baseUrl: row.base_url,
          model: row.model,
          profileId: row.profile_id,
          supportsNativeTools: false,
          settings,
        },
      };
    }

    if (row.provider_id === 'codex-cli') {
      const userClient = new LocalRuntimeClient({
        runtime: row.provider_id,
        defaultModel: row.model,
        settings,
      });
      return {
        client: userClient,
        model: row.model,
        isLocal: true,
        requiresLocalServer: false,
        supportsNativeTools: false,
        provider_type: row.provider_type,
        providerInfo: {
          type: row.provider_type,
          providerId: row.provider_id,
          baseUrl: row.base_url,
          model: row.model,
          profileId: row.profile_id,
          supportsNativeTools: false,
          settings,
        },
      };
    }

    const userClient = new OpenAIClient({
      endpoint:     baseUrl,
      apiKey,
      defaultModel: localStatus?.model || row.model,
      providerId:   row.provider_id,
      settings,
      defaultHeaders: row.provider_id === 'openrouter'
        ? { 'HTTP-Referer': 'https://asyncat.local', 'X-OpenRouter-Title': 'Asyncat' }
        : undefined,
    });

    return {
      client: userClient,
      model: localStatus?.model || row.model,
      isLocal,
      requiresLocalServer,
      supportsNativeTools,
      provider_type: row.provider_type,
      providerInfo: {
        type:              row.provider_type,
        providerId:        row.provider_id,
        baseUrl:           row.base_url,
        model:             row.model,
        profileId:         row.profile_id,
        supportsNativeTools,
        settings,
      },
    };
  } catch (err) {
    if (err.message?.startsWith(LOCAL_NOT_READY)) throw err;
    console.warn('[clientFactory] Failed to load user AI config, using global defaults:', err.message);
    return { client: globalClient, model: GLOBAL_AI_MODEL, isLocal: false, requiresLocalServer: false, supportsNativeTools: true, providerInfo: null };
  }
}

function clientFromProviderRow(row, { allowGlobalApiKeyFallback = true } = {}) {
  const isLocal = row.provider_type === 'local';
  const requiresLocalServer = providerRequiresBuiltinServer(row);
  const baseUrl = normalizeBaseUrl(row.base_url, row.provider_id);
  const supportsNativeTools = providerSupportsTools(row);
  const localStatus = requiresLocalServer ? assertLocalModelReady() : null;
  const settings = withLocalServerFacts(parseSettings(row.settings), localStatus);
  if (requiresLocalServer && row.model && localStatus?.model && localStatus.model !== row.model) {
    throw new Error(`Local model mismatch: scheduled job expects ${row.model}, but ${localStatus.model} is loaded.`);
  }
  const apiKey = isLocal ? (row.api_key || 'local') : (row.api_key || (allowGlobalApiKeyFallback ? GLOBAL_AI_API_KEY : ''));

  if (row.provider_id === 'openai-codex') {
    const client = new CodexDirectClient({
      apiKey: row.api_key,
      defaultModel: localStatus?.model || row.model,
      baseURL: baseUrl,
      onTokens: tokenBundle => persistCodexTokens(row.user_id, row.profile_id || row.id || null, tokenBundle),
    });
    return {
      client,
      model: localStatus?.model || row.model,
      isLocal: false,
      requiresLocalServer,
      supportsNativeTools: false,
      provider_type: row.provider_type,
      providerInfo: {
        type: row.provider_type,
        providerId: row.provider_id,
        baseUrl: row.base_url,
        model: row.model,
        profileId: row.profile_id || row.id || null,
        supportsNativeTools: false,
        name: row.name || null,
        settings,
      },
    };
  }

  if (row.provider_id === 'codex-cli') {
    const client = new LocalRuntimeClient({
      runtime: row.provider_id,
      defaultModel: localStatus?.model || row.model,
      settings,
    });
    return {
      client,
      model: localStatus?.model || row.model,
      isLocal: true,
      requiresLocalServer,
      supportsNativeTools: false,
      provider_type: row.provider_type,
      providerInfo: {
        type: row.provider_type,
        providerId: row.provider_id,
        baseUrl: row.base_url,
        model: row.model,
        profileId: row.profile_id || row.id || null,
        supportsNativeTools: false,
        name: row.name || null,
        settings,
      },
    };
  }

  if (!isLocal && !apiKey) {
    throw new Error(`Provider ${row.name || row.provider_id || 'profile'} is missing an API key.`);
  }

  const client = new OpenAIClient({
    endpoint:     baseUrl,
    apiKey,
    defaultModel: localStatus?.model || row.model,
    providerId:   row.provider_id,
    settings,
    defaultHeaders: row.provider_id === 'openrouter'
      ? { 'HTTP-Referer': 'https://asyncat.local', 'X-OpenRouter-Title': 'Asyncat' }
      : undefined,
  });

  return {
    client,
    model: localStatus?.model || row.model,
    isLocal,
    requiresLocalServer,
    supportsNativeTools,
    provider_type: row.provider_type,
    providerInfo: {
      type:              row.provider_type,
      providerId:        row.provider_id,
      baseUrl:           row.base_url,
      model:             row.model,
      profileId:         row.profile_id || row.id || null,
      supportsNativeTools,
      name:              row.name || null,
      settings,
    },
  };
}

/**
 * Resolve a provider for a scheduled job. Prefer the saved provider profile so
 * API keys stay in the provider table; fall back to the job snapshot for
 * profile-less local providers and legacy schedules.
 */
export function getAiClientForScheduledProvider(userId, providerProfileId = null, providerSnapshot = null) {
  if (providerProfileId) {
    const row = db.prepare('SELECT * FROM ai_provider_profiles WHERE user_id = ? AND id = ?').get(userId, providerProfileId);
    if (!row) throw new Error('Scheduled provider profile was deleted or is no longer available.');
    return clientFromProviderRow(row, { allowGlobalApiKeyFallback: false });
  }

  if (providerSnapshot && providerSnapshot.provider_id && providerSnapshot.base_url && providerSnapshot.model) {
    return clientFromProviderRow({
      profile_id: null,
      name: providerSnapshot.name || providerSnapshot.provider_name || null,
      provider_type: providerSnapshot.provider_type || providerSnapshot.type || 'custom',
      provider_id: providerSnapshot.provider_id,
      base_url: providerSnapshot.base_url,
      model: providerSnapshot.model,
      api_key: providerSnapshot.api_key || null,
      settings: JSON.stringify(providerSnapshot.settings || {}),
      supports_tools: providerSnapshot.supports_tools ? 1 : 0,
    }, { allowGlobalApiKeyFallback: true });
  }

  return getAiClientForUser(userId);
}

export default getAiClientForUser;
