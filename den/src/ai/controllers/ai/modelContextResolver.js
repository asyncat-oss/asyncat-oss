// Central context-window resolver for cloud, custom, and local model providers.
// Priority: explicit user/provider settings > provider /models metadata >
// model-pattern registry > provider preset default > conservative fallback.

const DEFAULT_CONTEXT_WINDOW = 8192;

const MODEL_CONTEXT_RULES = [
  { providerId: /^minimax(?:-cn)?$/i, model: /m2\.7/i, contextWindow: 204800 },
  { providerId: /^minimax(?:-cn)?$/i, model: /m2\.5/i, contextWindow: 200000 },
  { providerId: /^minimax(?:-cn)?$/i, model: /m1/i, contextWindow: 1000000 },

  { providerId: /^gemini$/i, model: /2\.5/i, contextWindow: 1048576 },
  { providerId: /^gemini$/i, model: /1\.5/i, contextWindow: 1048576 },

  { providerId: /^anthropic$/i, model: /claude-(opus|sonnet)-4/i, contextWindow: 1000000 },
  { providerId: /^anthropic$/i, model: /claude/i, contextWindow: 200000 },

  { providerId: /^openai$/i, model: /gpt-4\.1|gpt-4o|o3|o4/i, contextWindow: 128000 },
  { providerId: /^openai$/i, model: /gpt-5/i, contextWindow: 400000 },

  { providerId: /^xai$/i, model: /grok-4\.20|grok-4-1-fast|grok-4-fast/i, contextWindow: 2000000 },
  { providerId: /^xai$/i, model: /grok-4\.3/i, contextWindow: 1000000 },
  { providerId: /^xai$/i, model: /grok-4/i, contextWindow: 256000 },
  { providerId: /^mistral$/i, model: /mistral-large/i, contextWindow: 128000 },
  { providerId: /^deepseek$/i, model: /deepseek-v4|deepseek-chat|deepseek-reasoner/i, contextWindow: 1000000 },
  { providerId: /^together$/i, model: /llama-3\.3-70b/i, contextWindow: 131072 },
  { providerId: /^perplexity$/i, model: /sonar/i, contextWindow: 200000 },
  { providerId: /^qwen$/i, model: /qwen/i, contextWindow: 131072 },
  { providerId: /^kimi$/i, model: /kimi-k2/i, contextWindow: 256000 },
  { providerId: /^cohere$/i, model: /command-a/i, contextWindow: 256000 },
  { providerId: /^fireworks$/i, model: /llama-v3p1|deepseek/i, contextWindow: 131072 },
  { providerId: /^cerebras$/i, model: /gpt-oss/i, contextWindow: 131072 },
  { providerId: /^deepinfra$/i, model: /llama-3\.3-70b/i, contextWindow: 131072 },
  { providerId: /^huggingface$/i, model: /gpt-oss|llama-3\.3|deepseek|qwen/i, contextWindow: 131072 },
  { providerId: /^nvidia-nim$/i, model: /gpt-oss|llama-3\.3|nemotron/i, contextWindow: 131072 },
  { providerId: /^bedrock$/i, model: /gpt-oss/i, contextWindow: 128000 },

  { providerId: /^groq$/i, model: /llama-3\.3-70b-versatile/i, contextWindow: 131072 },
  { providerId: /^groq$/i, model: /llama-3\.1-8b-instant/i, contextWindow: 131072 },
];

const CONTEXT_KEYS = [
  'context_window',
  'contextWindow',
  'context_length',
  'contextLength',
  'max_context',
  'maxContext',
  'ctx_size',
  'ctxSize',
  'n_ctx',
  'max_input_tokens',
  'maxInputTokens',
];

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function readNested(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

export function readContextWindowFromObject(obj = {}) {
  if (!obj || typeof obj !== 'object') return null;

  for (const key of CONTEXT_KEYS) {
    const direct = toPositiveInt(obj[key]);
    if (direct) return direct;
  }

  for (const path of [
    'metadata.context_window',
    'metadata.contextWindow',
    'metadata.context_length',
    'metadata.max_context',
    'metadata.max_input_tokens',
    'limits.context_window',
    'limits.context_length',
    'limits.max_context',
    'limits.max_input_tokens',
    'top_provider.context_length',
    'top_provider.contextWindow',
    'architecture.context_length',
  ]) {
    const nested = toPositiveInt(readNested(obj, path));
    if (nested) return nested;
  }

  return null;
}

export function inferContextWindowFromModel(providerId, modelId, fallback = null) {
  const providerText = String(providerId || '');
  const modelText = String(modelId || '');
  const rule = MODEL_CONTEXT_RULES.find(item => (
    item.providerId.test(providerText) && item.model.test(modelText)
  ));
  return rule?.contextWindow || fallback || null;
}

export function resolveContextWindow({
  providerId = '',
  model = '',
  settings = {},
  modelMetadata = null,
  preset = null,
  fallback = DEFAULT_CONTEXT_WINDOW,
} = {}) {
  const explicit = readContextWindowFromObject(settings);
  if (explicit) {
    return { contextWindow: explicit, source: 'settings', confidence: 'explicit' };
  }

  const metadata = readContextWindowFromObject(modelMetadata);
  if (metadata) {
    return { contextWindow: metadata, source: 'model-metadata', confidence: 'reported' };
  }

  const inferred = inferContextWindowFromModel(providerId, model, null);
  if (inferred) {
    return { contextWindow: inferred, source: 'model-registry', confidence: 'known-model' };
  }

  const presetWindow = toPositiveInt(preset?.contextWindow);
  if (presetWindow) {
    return { contextWindow: presetWindow, source: 'provider-preset', confidence: 'provider-default' };
  }

  return { contextWindow: fallback, source: 'fallback', confidence: 'conservative' };
}

export { DEFAULT_CONTEXT_WINDOW };
