// clientFactory.js — per-user AI client resolution
// Extracted from chat/chatRouter.js so all subsystems (agent, routes) share one source of truth.

import OpenAI from 'openai';
import { config } from 'dotenv';
import db from '../../../db/client.js';
import { getStatus as getLlamaStatus } from './llamaServerManager.js';
import {
  LLAMA_BASE_URL,
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

function assertLocalModelReady() {
  const status = getLlamaStatus();
  if (status.status !== 'ready') {
    throw new Error(
      `Local model is not ready yet (status: ${status.status}${status.model ? `, model: ${status.model}` : ''}).`
    );
  }
  return status;
}

// Global fallback client (built-in llama server)
import OpenAIClient from './openAIClient.js';

const globalClient = new OpenAIClient({
  endpoint:     GLOBAL_AI_BASE_URL,
  apiKey:       GLOBAL_AI_API_KEY,
  defaultModel: GLOBAL_AI_MODEL,
});

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
      .prepare('SELECT profile_id, provider_type, provider_id, base_url, model, api_key, settings, supports_tools FROM ai_provider_config WHERE user_id = ?')
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
    const settings = parseSettings(row.settings);
    const supportsNativeTools = providerSupportsTools(row);
    const localStatus = requiresLocalServer ? assertLocalModelReady() : null;
    const apiKey = isLocal ? (row.api_key || 'local') : (row.api_key || GLOBAL_AI_API_KEY);

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
      },
    };
  } catch (err) {
    if (err.message?.startsWith('Local model is not ready')) throw err;
    console.warn('[clientFactory] Failed to load user AI config, using global defaults:', err.message);
    return { client: globalClient, model: GLOBAL_AI_MODEL, isLocal: false, requiresLocalServer: false, supportsNativeTools: true, providerInfo: null };
  }
}

export default getAiClientForUser;
