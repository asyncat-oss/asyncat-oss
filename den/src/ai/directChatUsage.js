// Usage for a plain (direct) chat answer and Quick ask, recorded the way an
// agent run records its model calls, so Models → Usage counts them too.
import { normalizeUsage, recordModelUsage } from './controllers/ai/modelUsageService.js';

const estimateTokens = (text) => Math.ceil(String(text || '').length / 4);

function promptText(messages = []) {
  return messages.map((message) => {
    if (typeof message?.content === 'string') return message.content;
    if (Array.isArray(message?.content)) {
      return message.content.map((part) => (part?.type === 'text' ? part.text || '' : '')).join('\n');
    }
    return '';
  }).join('\n');
}

/**
 * Record one direct chat call. `usage` is what the provider sent (OpenAI
 * style), or null: then the counts are estimated from the text and marked so.
 */
export function recordDirectChatUsage({
  userId,
  workspaceId = null,
  conversationId = null,
  model,
  providerInfo = null,
  operation = 'chat',
  messages = [],
  answer = '',
  usage = null,
  latencyMs = null,
  stopped = false,
} = {}) {
  const hasRealUsage = Boolean(usage && (usage.prompt_tokens || usage.completion_tokens || usage.input_tokens || usage.output_tokens || usage.total_tokens));
  const normalized = normalizeUsage(hasRealUsage ? usage : {}, {
    inputTokens: estimateTokens(promptText(messages)),
    outputTokens: estimateTokens(answer),
  });
  const outputTokens = normalized.outputTokens;
  try {
    return recordModelUsage({
      userId,
      workspaceId,
      conversationId,
      providerProfileId: providerInfo?.profileId || providerInfo?.profile_id || null,
      providerId: providerInfo?.providerId || providerInfo?.provider_id || null,
      providerType: providerInfo?.type || providerInfo?.provider_type || null,
      providerName: providerInfo?.name || null,
      model,
      operation,
      inputTokens: normalized.inputTokens,
      outputTokens,
      totalTokens: normalized.totalTokens || normalized.inputTokens + outputTokens,
      currentContextTokens: normalized.inputTokens,
      cachedTokens: normalized.cachedTokens,
      reasoningTokens: normalized.reasoningTokens,
      estimated: !hasRealUsage,
      usageSource: hasRealUsage ? 'provider' : 'estimated',
      latencyMs,
      tokensPerSecond: latencyMs > 0 && outputTokens ? Math.round((outputTokens / latencyMs) * 1000) : null,
      rawUsage: hasRealUsage ? normalized.raw : null,
      metadata: stopped ? { stopped: true } : {},
    });
  } catch (error) {
    console.warn('[usage] could not record a direct chat call:', error.message);
    return null;
  }
}
