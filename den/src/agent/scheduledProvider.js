// den/src/agent/scheduledProvider.js
// The model a scheduled task runs with: a saved model (provider profile) or
// a snapshot of the model that was active when the task was saved, so a task
// keeps using the same model after the chat model changes.

import db from '../db/client.js';
import { publicProvider } from '../ai/controllers/ai/providerCatalog.js';

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function providerSnapshotFromRow(row) {
  if (!row) return null;
  const pub = publicProvider({
    id: row.profile_id || row.id || null,
    name: row.name || null,
    provider_type: row.provider_type,
    provider_id: row.provider_id,
    base_url: row.base_url,
    model: row.model,
    settings: row.settings,
    supports_tools: row.supports_tools,
    api_key: row.api_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
  return {
    id: pub?.id || row.profile_id || row.id || null,
    name: pub?.name || row.name || row.provider_id,
    provider_type: pub?.provider_type || row.provider_type,
    provider_id: pub?.provider_id || row.provider_id,
    base_url: pub?.base_url || row.base_url,
    model: pub?.model || row.model,
    settings: pub?.settings || parseJson(row.settings, {}),
    supports_tools: Boolean(pub?.supports_tools ?? row.supports_tools),
    local: Boolean(pub?.local),
    managed: Boolean(pub?.managed),
  };
}

/**
 * { providerProfileId, providerSnapshot } for a saved model, or for the model
 * that is active right now when no id is given.
 */
export function resolveScheduledProvider(userId, providerProfileId = null) {
  if (providerProfileId) {
    const row = db.prepare('SELECT * FROM ai_provider_profiles WHERE user_id = ? AND id = ?').get(userId, providerProfileId);
    if (!row) {
      const err = new Error('That saved model was not found. Pick another one on the Models page.');
      err.status = 400;
      throw err;
    }
    return { providerProfileId: row.id, providerSnapshot: providerSnapshotFromRow(row) };
  }

  const active = db.prepare('SELECT * FROM ai_provider_config WHERE user_id = ?').get(userId);
  if (!active) {
    const err = new Error('No model is set up yet. Choose one on the Models page first.');
    err.status = 400;
    throw err;
  }
  return {
    providerProfileId: active.profile_id || null,
    providerSnapshot: providerSnapshotFromRow(active),
  };
}
