// huggingFaceAuth.js — Shared HuggingFace authentication helpers
// Used by providerRoutes.js and agent model management tools.

import db from '../../../db/client.js';

export function getHuggingFaceToken(userId) {
  const envToken = String(process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '').trim();
  if (envToken) return envToken;
  if (!userId) return '';
  try {
    const row = db.prepare(`
      SELECT api_key
      FROM ai_provider_profiles
      WHERE user_id = ? AND provider_id = 'huggingface' AND api_key IS NOT NULL AND api_key <> ''
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(userId);
    return String(row?.api_key || '').trim();
  } catch {
    return '';
  }
}

export function huggingFaceHeaders(userId, extra = {}) {
  const token = getHuggingFaceToken(userId);
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export function isHuggingFaceUrl(rawUrl = '') {
  try {
    const url = new URL(rawUrl);
    return url.hostname === 'huggingface.co' || url.hostname.endsWith('.huggingface.co');
  } catch {
    return false;
  }
}
