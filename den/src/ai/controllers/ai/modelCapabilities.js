// modelCapabilities.js — Centralized registry for AI model capabilities

const CAPABILITIES_REGISTRY = [
  // OpenAI
  { match: /^(o1|o3|o4-mini|gpt-5(?:[.-]|$)|gpt-5\.4-thinking|gpt-5\.5)/i, supportsReasoning: true, reasoningType: 'effort_string', reasoningTiers: ['low', 'medium', 'high'] },
  // DeepSeek
  { match: /^deepseek-v4/i, supportsReasoning: true, reasoningType: 'effort_string', reasoningTiers: ['low', 'medium', 'high'] },
  { match: /^deepseek-(r1|r2|v3\.1|v3\.2)/i, supportsReasoning: true, reasoningType: 'native_tags', reasoningTiers: null },
  // Google Gemini
  { match: /^gemini-(2\.5|3(\.[0-9]+)?)/i, supportsReasoning: true, reasoningType: 'effort_string', reasoningTiers: ['minimal', 'low', 'medium', 'high'] },
  // Qwen
  { match: /^(qwq|qwen-3\.6)/i, supportsReasoning: true, reasoningType: 'native_tags', reasoningTiers: null },
  // xAI (Grok)
  { match: /^grok-4\.[0-9]+/i, supportsReasoning: true, reasoningType: 'effort_string', reasoningTiers: ['low', 'medium', 'high'] },
  // MiniMax
  { match: /^minimax-m2\.7/i, supportsReasoning: true, reasoningType: 'effort_string', reasoningTiers: ['low', 'medium', 'high'] },
];

export function getModelCapabilities(providerId, modelId) {
  const normalizedModelId = String(modelId || '').toLowerCase().trim();
  const normalizedProviderId = String(providerId || '').toLowerCase().trim();
  
  // Clean off prefixes like "openrouter/" if they exist in the model string
  const cleanModelId = normalizedModelId.includes('/') ? normalizedModelId.split('/').pop() : normalizedModelId;

  if (normalizedProviderId === 'anthropic') {
    return {
      supportsReasoning: false,
      reasoningType: null,
      reasoningTiers: null,
    };
  }

  for (const entry of CAPABILITIES_REGISTRY) {
    if (entry.match.test(cleanModelId)) {
      return {
        supportsReasoning: entry.supportsReasoning,
        reasoningType: entry.reasoningType,
        reasoningTiers: entry.reasoningTiers,
      };
    }
  }

  // Fallback heuristic: some unknown models might still have 'thinking' or 'reasoning' in the name
  if (/\b(thinking|reasoning)\b/i.test(cleanModelId)) {
    return {
      supportsReasoning: true,
      reasoningType: 'native_tags', // Assume native tags (no effort parameter) for unknown local models to be safe
      reasoningTiers: null,
    };
  }

  return {
    supportsReasoning: false,
    reasoningType: null,
    reasoningTiers: null,
  };
}

export function normalizeReasoningEffort(value, capabilities) {
  const effort = String(value || '').trim().toLowerCase();
  if (!effort || effort === 'auto' || effort === 'off' || effort === 'none') return null;
  
  if (!capabilities || !capabilities.supportsReasoning || capabilities.reasoningType !== 'effort_string') {
    return null; // Not supported or uses native tags (no payload parameter needed)
  }

  const validTiers = capabilities.reasoningTiers || ['low', 'medium', 'high'];
  
  // Mapping aliases
  if (effort === 'extra_high' || effort === 'extra-high' || effort === 'xhigh') {
    return validTiers.includes('xhigh') ? 'xhigh' : validTiers.includes('high') ? 'high' : null;
  }
  if (effort === 'minimal') {
    return validTiers.includes('minimal') ? 'minimal' : validTiers.includes('low') ? 'low' : null;
  }

  return validTiers.includes(effort) ? effort : null;
}
