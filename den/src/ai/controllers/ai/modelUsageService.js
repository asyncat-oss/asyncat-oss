import { randomUUID } from 'crypto';
import db from '../../../db/client.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveInt(value, fallback = 0) {
  return Math.max(0, Math.floor(toNumber(value, fallback)));
}

function readDetail(details, keys = []) {
  if (!details || typeof details !== 'object') return 0;
  return keys.reduce((sum, key) => sum + positiveInt(details[key]), 0);
}

function stringifyMetadata(metadata = {}) {
  try {
    return JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {});
  } catch {
    return '{}';
  }
}

export function normalizeUsage(rawUsage = {}, fallback = {}) {
  const promptDetails = rawUsage?.prompt_tokens_details || rawUsage?.input_tokens_details || {};
  const completionDetails = rawUsage?.completion_tokens_details || rawUsage?.output_tokens_details || {};

  const inputTokens = positiveInt(
    rawUsage?.prompt_tokens ?? rawUsage?.input_tokens,
    fallback.inputTokens ?? fallback.input_tokens ?? 0,
  );
  const outputTokens = positiveInt(
    rawUsage?.completion_tokens ?? rawUsage?.output_tokens,
    fallback.outputTokens ?? fallback.output_tokens ?? 0,
  );
  const totalTokens = positiveInt(
    rawUsage?.total_tokens,
    fallback.totalTokens ?? fallback.total_tokens ?? inputTokens + outputTokens,
  ) || inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedTokens: readDetail(promptDetails, ['cached_tokens', 'cached_content_token_count', 'input_cached_tokens']),
    reasoningTokens: readDetail(completionDetails, ['reasoning_tokens']) || positiveInt(rawUsage?.thoughts_token_count),
    audioTokens: readDetail(promptDetails, ['audio_tokens', 'input_audio_tokens'])
      + readDetail(completionDetails, ['audio_tokens', 'output_audio_tokens']),
    imageTokens: readDetail(promptDetails, ['image_tokens']),
    raw: rawUsage && typeof rawUsage === 'object' ? rawUsage : {},
  };
}

export function recordModelUsage(event = {}) {
  if (!event.userId || !event.model) return null;

  const id = event.id || randomUUID();
  const now = event.createdAt || new Date().toISOString();
  const metadata = {
    ...(event.metadata || {}),
    ...(event.rawUsage ? { rawUsage: event.rawUsage } : {}),
  };

  db.prepare(`
    INSERT INTO ai_model_usage_events (
      id, user_id, workspace_id, conversation_id, message_id, assistant_message_id,
      agent_session_id, provider_profile_id, provider_id, provider_type, provider_name,
      model, operation, input_tokens, output_tokens, total_tokens,
      current_context_tokens, cached_tokens, reasoning_tokens, audio_tokens, image_tokens,
      estimated, usage_source, context_window, context_window_source,
      context_window_confidence, latency_ms, tokens_per_second, round, metadata, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `).run(
    id,
    event.userId,
    event.workspaceId || null,
    event.conversationId || null,
    event.messageId || null,
    event.assistantMessageId || null,
    event.agentSessionId || null,
    event.providerProfileId || null,
    event.providerId || null,
    event.providerType || null,
    event.providerName || null,
    event.model,
    event.operation || 'agent',
    positiveInt(event.inputTokens),
    positiveInt(event.outputTokens),
    positiveInt(event.totalTokens),
    positiveInt(event.currentContextTokens),
    positiveInt(event.cachedTokens),
    positiveInt(event.reasoningTokens),
    positiveInt(event.audioTokens),
    positiveInt(event.imageTokens),
    event.estimated ? 1 : 0,
    event.usageSource || (event.estimated ? 'estimated' : 'provider'),
    event.contextWindow ? positiveInt(event.contextWindow) : null,
    event.contextWindowSource || null,
    event.contextWindowConfidence || null,
    event.latencyMs ? positiveInt(event.latencyMs) : null,
    event.tokensPerSecond !== null && event.tokensPerSecond !== undefined ? toNumber(event.tokensPerSecond) : null,
    event.round !== undefined && event.round !== null ? positiveInt(event.round) : null,
    stringifyMetadata(metadata),
    now,
  );

  return id;
}

function cutoffForRange(range = '30d') {
  const raw = String(range || '30d').toLowerCase();
  if (raw === 'all') return null;
  const days = raw === '7d' ? 7 : raw === '90d' ? 90 : raw === '24h' || raw === '1d' ? 1 : 30;
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function whereForUsage(userId, workspaceId, range) {
  const conditions = ['user_id = ?'];
  const params = [userId];
  if (workspaceId) {
    conditions.push('workspace_id = ?');
    params.push(workspaceId);
  }
  const cutoff = cutoffForRange(range);
  if (cutoff) {
    conditions.push('created_at >= ?');
    params.push(cutoff);
  }
  return { where: conditions.join(' AND '), params, cutoff };
}

export function getModelUsageSummary(userId, { workspaceId = null, range = '30d', limit = 12 } = {}) {
  const { where, params, cutoff } = whereForUsage(userId, workspaceId, range);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS request_count,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(estimated), 0) AS estimated_count,
      MIN(created_at) AS first_seen_at,
      MAX(created_at) AS last_seen_at
    FROM ai_model_usage_events
    WHERE ${where}
  `).get(...params);

  const models = db.prepare(`
    SELECT
      provider_id,
      provider_type,
      provider_name,
      provider_profile_id,
      model,
      COUNT(*) AS request_count,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
      COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
      COALESCE(SUM(estimated), 0) AS estimated_count,
      MAX(context_window) AS context_window,
      MAX(created_at) AS last_used_at
    FROM ai_model_usage_events
    WHERE ${where}
    GROUP BY provider_id, model
    ORDER BY total_tokens DESC, request_count DESC, last_used_at DESC
    LIMIT ?
  `).all(...params, safeLimit);

  const providers = db.prepare(`
    SELECT
      provider_id,
      provider_type,
      provider_name,
      COUNT(*) AS request_count,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(estimated), 0) AS estimated_count,
      MAX(created_at) AS last_used_at
    FROM ai_model_usage_events
    WHERE ${where}
    GROUP BY provider_id
    ORDER BY total_tokens DESC, request_count DESC
  `).all(...params);

  const recent = db.prepare(`
    SELECT
      id, conversation_id, message_id, assistant_message_id, agent_session_id,
      provider_profile_id, provider_id, provider_type, provider_name, model,
      operation, input_tokens, output_tokens, total_tokens, current_context_tokens,
      cached_tokens, reasoning_tokens, estimated, usage_source, context_window,
      latency_ms, tokens_per_second, round, metadata, created_at
    FROM ai_model_usage_events
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params, Math.min(safeLimit, 20)).map(row => ({
    ...row,
    estimated: Boolean(row.estimated),
    metadata: parseJson(row.metadata, {}),
  }));

  return {
    success: true,
    range,
    cutoff,
    totals: {
      request_count: totals?.request_count || 0,
      input_tokens: totals?.input_tokens || 0,
      output_tokens: totals?.output_tokens || 0,
      total_tokens: totals?.total_tokens || 0,
      cached_tokens: totals?.cached_tokens || 0,
      reasoning_tokens: totals?.reasoning_tokens || 0,
      estimated_count: totals?.estimated_count || 0,
      first_seen_at: totals?.first_seen_at || null,
      last_seen_at: totals?.last_seen_at || null,
    },
    models,
    providers,
    recent,
  };
}
