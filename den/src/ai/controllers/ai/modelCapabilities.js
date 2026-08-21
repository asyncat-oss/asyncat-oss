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

const IMAGE_INPUT_PATTERNS = [
  /(?:^|[\W_])(gpt-4o|gpt-4\.1|gpt-4\.5|gpt-4-(?:turbo|vision)|gpt-5(?:[.-]|$)|o1(?:[.-]|$)|o3(?:[.-]|$)|o4(?:[.-]|$))/i,
  /(?:^|[\W_])gemini(?:[.-]|$)/i,
  /(?:^|[\W_])claude-(?:3|4)(?:[.-]|$)/i,
  /(?:^|[\W_])grok-(?:2-vision|4)(?:[.-]|$)/i,
  /(?:^|[\W_])(?:llava|bakllava|moondream|pixtral|paligemma|molmo|smolvlm|internvl)(?:[.-]|$)/i,
  /(?:^|[\W_])(?:qwen\d*(?:\.\d+)?[-_.]?(?:vl|omni)|qwen[-_.]?(?:vl|omni))(?:[.-]|$)/i,
  /(?:^|[\W_])(?:minicpm[-_.]?v|phi[-_.]?(?:3(?:\.5)?|4)[-_.]?(?:vision|multimodal))(?:[.-]|$)/i,
  /(?:^|[\W_])(?:llama[-_.]?3\.2[-_.]?vision|llama[-_.]?4)(?:[.-]|$)/i,
  /(?:^|[\W_])(?:gemma[-_.]?3|gemma[-_.]?4)(?:[.-]|$)/i,
  /(?:^|[\W_])(?:deepseek[-_.]?vl|mistral[-_.]?small[-_.]?3\.1)(?:[.-]|$)/i,
  /(?:^|[\W_])(?:vision|visual|multimodal)(?:[\W_]|$)/i,
];

const IMAGE_UNSUPPORTED_PROVIDERS = new Set(['codex-cli', 'openai-codex']);

function normalizeModalities(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim().toLowerCase()).filter(Boolean))];
}

function explicitImageInputSupport(metadata = null) {
  if (!metadata || typeof metadata !== 'object') return null;
  const capabilityObjects = [metadata, metadata.capabilities, metadata.model_capabilities]
    .filter(value => value && typeof value === 'object');

  for (const value of capabilityObjects) {
    for (const key of ['supportsImageInput', 'supports_image_input']) {
      if (typeof value[key] === 'boolean') return value[key];
    }
  }

  const architecture = metadata.architecture && typeof metadata.architecture === 'object'
    ? metadata.architecture
    : {};
  const inputModalities = normalizeModalities(
    metadata.input_modalities
      || metadata.inputModalities
      || architecture.input_modalities
      || architecture.inputModalities
      || metadata.modalities?.input,
  );
  if (inputModalities.length > 0) {
    return inputModalities.some(modality => modality === 'image' || modality === 'vision');
  }

  return null;
}

function modelSupportsImageInput(providerId, modelId, metadata = null) {
  const normalizedProviderId = String(providerId || '').toLowerCase().trim();
  if (IMAGE_UNSUPPORTED_PROVIDERS.has(normalizedProviderId)) return false;

  const explicit = explicitImageInputSupport(metadata);
  if (explicit !== null) return explicit;

  const modelText = String(modelId || '').toLowerCase().trim();
  return IMAGE_INPUT_PATTERNS.some(pattern => pattern.test(modelText));
}

export function getModelCapabilities(providerId, modelId, modelMetadata = null) {
  const normalizedModelId = String(modelId || '').toLowerCase().trim();
  const normalizedProviderId = String(providerId || '').toLowerCase().trim();
  
  // Clean off prefixes like "openrouter/" if they exist in the model string
  const cleanModelId = normalizedModelId.includes('/') ? normalizedModelId.split('/').pop() : normalizedModelId;

  let reasoning = {
    supportsReasoning: false,
    reasoningType: null,
    reasoningTiers: null,
  };

  if (normalizedProviderId !== 'anthropic') {
    for (const entry of CAPABILITIES_REGISTRY) {
      if (!entry.match.test(cleanModelId)) continue;
      reasoning = {
        supportsReasoning: entry.supportsReasoning,
        reasoningType: entry.reasoningType,
        reasoningTiers: entry.reasoningTiers,
      };
      break;
    }
  }

  // Fallback heuristic: some unknown models might still have 'thinking' or 'reasoning' in the name
  if (!reasoning.supportsReasoning && /\b(thinking|reasoning)\b/i.test(cleanModelId)) {
    reasoning = {
      supportsReasoning: true,
      reasoningType: 'native_tags', // Assume native tags (no effort parameter) for unknown local models to be safe
      reasoningTiers: null,
    };
  }

  const supportsImageInput = modelSupportsImageInput(normalizedProviderId, normalizedModelId, modelMetadata);
  return {
    ...reasoning,
    supportsImageInput,
    inputModalities: supportsImageInput ? ['text', 'image'] : ['text'],
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
