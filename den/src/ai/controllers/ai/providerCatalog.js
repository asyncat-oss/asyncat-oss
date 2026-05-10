import { resolveContextWindow } from './modelContextResolver.js';

const LLAMA_PORT = parseInt(process.env.LLAMA_SERVER_PORT ?? '8765', 10);

export const LLAMA_PROVIDER_ID = 'llamacpp-builtin';
export const LLAMA_BASE_URL = `http://127.0.0.1:${LLAMA_PORT}/v1`;

const MLX_PORT = parseInt(process.env.MLX_SERVER_PORT ?? '8766', 10);
export const MLX_PROVIDER_ID = 'mlx-local';
export const MLX_BASE_URL = `http://127.0.0.1:${MLX_PORT}/v1`;

export const PROVIDER_CATALOG = [
  {
    id: LLAMA_PROVIDER_ID,
    name: 'Built-in llama.cpp',
    providerType: 'local',
    providerId: LLAMA_PROVIDER_ID,
    baseUrl: LLAMA_BASE_URL,
    model: '',
    requiresApiKey: false,
    supportsTools: false,
    supportsModelList: false,
    local: true,
    managed: true,
    description: 'Run downloaded GGUF models with Asyncat managed llama.cpp.',
  },
  {
    id: MLX_PROVIDER_ID,
    name: 'MLX (Apple Silicon)',
    providerType: 'local',
    providerId: MLX_PROVIDER_ID,
    baseUrl: MLX_BASE_URL,
    model: '',
    requiresApiKey: false,
    supportsTools: false,
    supportsModelList: false,
    local: true,
    managed: true,
    description: 'Run HuggingFace MLX models natively on Apple Silicon via mlx_lm.server.',
  },
  {
    id: 'openai-codex',
    name: 'OpenAI Codex',
    providerType: 'cloud',
    providerId: 'openai-codex',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    model: 'gpt-5.5',
    requiresApiKey: false,
    supportsTools: false,
    supportsModelList: false,
    contextWindow: 272000,
    local: false,
    managed: false,
    directCodex: true,
    setup: [
      'Uses Codex/ChatGPT OAuth against the Codex Responses backend.',
      'Asyncat keeps its own token bundle after connection; it should not live-share refresh tokens with Codex CLI.',
      'If you already ran codex login, Asyncat can import that token once to bootstrap its own session.'
    ],
    description: 'Use Codex subscription auth directly from Asyncat.',
  },
  {
    id: 'codex-cli',
    name: 'Codex CLI Runtime',
    providerType: 'local',
    providerId: 'codex-cli',
    baseUrl: 'runtime://codex-cli',
    model: 'gpt-5.5',
    requiresApiKey: false,
    supportsTools: false,
    supportsModelList: false,
    contextWindow: 272000,
    local: true,
    managed: false,
    runtime: true,
    setup: [
      'Uses codex exec as a subprocess and lets Codex own its auth session.',
      'Asyncat does not read or refresh ~/.codex/auth.json.',
      'Run codex login or open codex once before activating this provider.'
    ],
    description: 'Use your local Codex CLI login as a runtime boundary.',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    providerType: 'local',
    providerId: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    requiresApiKey: false,
    supportsTools: false,
    supportsModelList: true,
    local: true,
    managed: false,
    description: 'Use models served by a local Ollama instance.',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    providerType: 'local',
    providerId: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    requiresApiKey: false,
    supportsTools: false,
    supportsModelList: true,
    local: true,
    managed: false,
    description: 'Use an OpenAI-compatible LM Studio local server.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    providerType: 'cloud',
    providerId: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.2',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: true,
    contextWindow: 400000,
    local: false,
    apiKeyEnv: 'OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/docs',
    setup: [
      'Create a Platform API key in the OpenAI dashboard.',
      'ChatGPT Plus/Pro/Business subscriptions and Codex plan access do not replace an API key for this app.',
      'Codex CLI sign-in can create API credentials for Codex CLI, but there is no general-purpose ChatGPT subscription token that Asyncat can safely use.'
    ],
    description: 'OpenAI Platform API for GPT-5.2 and other API models.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    providerType: 'cloud',
    providerId: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-6',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: false,
    contextWindow: 200000,
    local: false,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    docsUrl: 'https://docs.anthropic.com/en/api/openai-sdk',
    compatibility: 'Anthropic documents this OpenAI SDK layer as useful for testing and comparison, with native Anthropic API recommended for the full feature set.',
    setup: [
      'Use an Anthropic API key.',
      'Claude model listing is not exposed through the OpenAI-compatible /models flow here, so enter the model ID manually.',
      'Some OpenAI parameters are ignored or mapped differently by Anthropic compatibility.'
    ],
    description: 'Claude through Anthropic OpenAI SDK compatibility.',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    providerType: 'cloud',
    providerId: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-flash',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: true,
    contextWindow: 1048576,
    local: false,
    apiKeyEnv: 'GEMINI_API_KEY',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    setup: [
      'Create a Gemini API key in Google AI Studio.',
      'Use the Google OpenAI-compatible endpoint ending in /v1beta/openai/.'
    ],
    description: 'Google Gemini through OpenAI compatibility.',
  },
  {
    id: 'xai',
    name: 'xAI',
    providerType: 'cloud',
    providerId: 'xai',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-4.20-reasoning',
    requiresApiKey: true,
    supportsTools: false,
    supportsModelList: true,
    contextWindow: 256000,
    local: false,
    apiKeyEnv: 'XAI_API_KEY',
    docsUrl: 'https://docs.x.ai/docs/guides/chat-completions',
    setup: [
      'Create an xAI API key in the xAI Console.',
      'Long-running reasoning models may need higher client timeouts; Asyncat streams responses but provider-side limits still apply.',
      'Native tool support varies by xAI model, so this preset keeps tool calling off by default.'
    ],
    description: 'Grok models through xAI OpenAI-compatible Chat Completions.',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    providerType: 'cloud',
    providerId: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: true,
    contextWindow: 128000,
    local: false,
    apiKeyEnv: 'MISTRAL_API_KEY',
    docsUrl: 'https://docs.mistral.ai/resources/migration-guides',
    setup: [
      'Create a Mistral API key.',
      'Mistral follows the Chat Completions request structure, so the OpenAI SDK works after changing base URL, key, and model name.'
    ],
    description: 'Mistral chat models through OpenAI-compatible Chat Completions.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    providerType: 'cloud',
    providerId: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: false,
    contextWindow: 64000,
    local: false,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    docsUrl: 'https://api-docs.deepseek.com/',
    setup: [
      'Create a DeepSeek API key.',
      'DeepSeek supports OpenAI-compatible chat completions. Model aliases can change over time, so verify the selected model in DeepSeek docs before production use.'
    ],
    description: 'DeepSeek models through an OpenAI-compatible API.',
  },
  {
    id: 'together',
    name: 'Together AI',
    providerType: 'cloud',
    providerId: 'together',
    baseUrl: 'https://api.together.ai/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    requiresApiKey: true,
    supportsTools: false,
    supportsModelList: true,
    contextWindow: 131072,
    local: false,
    apiKeyEnv: 'TOGETHER_API_KEY',
    docsUrl: 'https://docs.together.ai/docs/openai-api-compatibility',
    setup: [
      'Create a Together API key.',
      'Choose a concrete model ID from Together before activating if the default is unavailable in your account.',
      'Tool support is model-dependent, so enable native tools only after testing.'
    ],
    description: 'Open-source and hosted models through Together OpenAI compatibility.',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    providerType: 'cloud',
    providerId: 'perplexity',
    baseUrl: 'https://api.perplexity.ai',
    model: 'sonar-pro',
    requiresApiKey: true,
    supportsTools: false,
    supportsModelList: false,
    contextWindow: 200000,
    local: false,
    apiKeyEnv: 'PERPLEXITY_API_KEY',
    docsUrl: 'https://docs.perplexity.ai/docs/sonar/openai-compatibility',
    setup: [
      'Create a Perplexity API key.',
      'Perplexity uses https://api.perplexity.ai as the OpenAI SDK base URL; do not append /v1.',
      'Sonar is optimized for grounded web answers, not general agent tool calling, so native tools are off by default.'
    ],
    description: 'Perplexity Sonar API through OpenAI-compatible Chat Completions.',
  },
  {
    id: 'minimax',
    name: 'MiniMax Global',
    providerType: 'cloud',
    providerId: 'minimax',
    baseUrl: 'https://api.minimax.io/v1',
    model: 'MiniMax-M2.7',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: true,
    contextWindow: 204800,
    local: false,
    apiKeyEnv: 'MINIMAX_API_KEY',
    docsUrl: 'https://www.minimax.io/platform/document',
    description: 'MiniMax international OpenAI-compatible API.',
  },
  {
    id: 'minimax-cn',
    name: 'MiniMax China',
    providerType: 'cloud',
    providerId: 'minimax-cn',
    baseUrl: 'https://api.minimaxi.com/v1',
    model: 'MiniMax-M2.7',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: true,
    contextWindow: 204800,
    local: false,
    apiKeyEnv: 'MINIMAX_API_KEY',
    docsUrl: 'https://www.minimaxi.com/document',
    description: 'MiniMax China OpenAI-compatible API.',
  },
  {
    id: 'groq',
    name: 'Groq',
    providerType: 'cloud',
    providerId: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: true,
    contextWindow: 131072,
    local: false,
    apiKeyEnv: 'GROQ_API_KEY',
    docsUrl: 'https://console.groq.com/docs/overview',
    setup: [
      'Create a GroqCloud API key.',
      'Groq uses https://api.groq.com/openai/v1 and supports /models for available model IDs.'
    ],
    description: 'Groq OpenAI-compatible API.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    providerType: 'cloud',
    providerId: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/auto',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: true,
    contextWindow: 128000,
    local: false,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    docsUrl: 'https://openrouter.ai/docs/api/reference/overview',
    setup: [
      'Create an OpenRouter API key.',
      'openrouter/auto lets OpenRouter route automatically; pick a concrete provider/model when you need predictable behavior.',
      'Asyncat sends OpenRouter app attribution headers for better dashboard attribution.'
    ],
    description: 'Route through OpenRouter with one API key.',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    providerType: 'cloud',
    providerId: 'cohere',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    model: 'command-a-03-2025',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: true,
    contextWindow: 256000,
    local: false,
    apiKeyEnv: 'COHERE_API_KEY',
    docsUrl: 'https://docs.cohere.com/docs/compatibility-api',
    compatibility: 'Cohere compatibility supports many OpenAI chat parameters, but not every OpenAI field.',
    setup: [
      'Create a Cohere API key.',
      'Use the compatibility endpoint ending in /compatibility/v1.'
    ],
    description: 'Cohere Command models through the OpenAI SDK compatibility API.',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    providerType: 'cloud',
    providerId: 'fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    requiresApiKey: true,
    supportsTools: false,
    supportsModelList: true,
    contextWindow: 131072,
    local: false,
    apiKeyEnv: 'FIREWORKS_API_KEY',
    docsUrl: 'https://docs.fireworks.ai/tools-sdks/openai-compatibility',
    setup: [
      'Create a Fireworks API key.',
      'Fireworks model IDs often include the account path, for example accounts/fireworks/models/...',
      'Tool support depends on the selected model, so this preset starts with native tools disabled.'
    ],
    description: 'Fireworks serverless and dedicated models through OpenAI compatibility.',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    providerType: 'cloud',
    providerId: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'gpt-oss-120b',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: true,
    contextWindow: 131072,
    local: false,
    apiKeyEnv: 'CEREBRAS_API_KEY',
    docsUrl: 'https://inference-docs.cerebras.ai/resources/openai',
    setup: [
      'Create a Cerebras API key.',
      'Use Cerebras model IDs such as gpt-oss-120b or another model enabled for your account.'
    ],
    description: 'Fast Cerebras-hosted inference through OpenAI-compatible APIs.',
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    providerType: 'cloud',
    providerId: 'deepinfra',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    requiresApiKey: true,
    supportsTools: false,
    supportsModelList: true,
    contextWindow: 131072,
    local: false,
    apiKeyEnv: 'DEEPINFRA_TOKEN',
    docsUrl: 'https://docs.deepinfra.com/chat/overview',
    setup: [
      'Create a DeepInfra API token.',
      'Use the OpenAI-compatible base URL ending in /v1/openai.',
      'Tool support is model-dependent, so enable native tools only after testing.'
    ],
    description: 'DeepInfra hosted open-source models through OpenAI-compatible chat.',
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    providerType: 'cloud',
    providerId: 'azure',
    baseUrl: '',
    model: '',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: false,
    contextWindow: 128000,
    local: false,
    settings: { apiVersion: '2024-10-21' },
    apiKeyEnv: 'AZURE_OPENAI_API_KEY',
    docsUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/reference',
    setup: [
      'Enter your Azure OpenAI resource endpoint, for example https://resource-name.openai.azure.com.',
      'Set Model to the Azure deployment name, or set deployment in advanced settings.',
      'Azure requires an api-version query parameter; Asyncat defaults to 2024-10-21.'
    ],
    description: 'Azure OpenAI deployment endpoint.',
  },
  {
    id: 'custom',
    name: 'Custom',
    providerType: 'custom',
    providerId: 'custom',
    baseUrl: '',
    model: '',
    requiresApiKey: false,
    supportsTools: true,
    supportsModelList: true,
    contextWindow: 8192,
    local: false,
    setup: [
      'Use this for any endpoint that implements OpenAI-compatible /chat/completions.',
      'Set the exact base URL expected by the provider and a model ID that endpoint accepts.',
      'Enable native tools only if the endpoint supports OpenAI tool_calls.'
    ],
    description: 'Any OpenAI-compatible endpoint.',
  },
];

export function getProviderPreset(providerId) {
  return PROVIDER_CATALOG.find(p => p.id === providerId || p.providerId === providerId) || null;
}

export function parseSettings(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeProviderType(providerType, providerId) {
  const preset = getProviderPreset(providerId);
  if (providerType === 'local' || providerType === 'cloud' || providerType === 'custom') return providerType;
  return preset?.providerType || 'custom';
}

export function normalizeBaseUrl(baseUrl, providerId) {
  const preset = getProviderPreset(providerId);
  let url = String(baseUrl || preset?.baseUrl || '').trim();
  if (!url) return '';
  url = url.replace(/\s+/g, '');
  if (providerId === 'openai-codex') return url.replace(/\/+$/, '');
  if (providerId === 'codex-cli' || url.startsWith('runtime://')) return url;
  if (providerId === 'azure') return url.replace(/\/+$/, '');
  if (providerId === 'perplexity') return url.replace(/\/+$/, '');
  if (/\/(v\d+(?:beta)?|openai\/v\d+|v\d+\/openai|api\/v\d+|v\d+beta\/openai|compatibility\/v\d+|inference\/v\d+)\/?$/i.test(url)) {
    return url;
  }
  return `${url.replace(/\/+$/, '')}/v1`;
}

export function providerRequiresBuiltinServer(providerInfo = {}) {
  return providerInfo.provider_id === LLAMA_PROVIDER_ID || providerInfo.providerId === LLAMA_PROVIDER_ID;
}

export function providerIsLocal(providerInfo = {}) {
  const providerType = providerInfo.provider_type || providerInfo.providerType;
  return providerType === 'local';
}

export function providerSupportsTools(providerInfo = {}) {
  if (providerInfo.supports_tools !== undefined && providerInfo.supports_tools !== null) {
    return Boolean(Number(providerInfo.supports_tools));
  }
  if (providerInfo.supportsTools !== undefined) return Boolean(providerInfo.supportsTools);
  const preset = getProviderPreset(providerInfo.provider_id || providerInfo.providerId);
  return Boolean(preset?.supportsTools);
}

export function publicProvider(row) {
  if (!row) return null;
  const preset = getProviderPreset(row.provider_id);
  const settings = parseSettings(row.settings);
  const resolvedContext = resolveContextWindow({
    providerId: row.provider_id,
    model: row.model,
    settings,
    preset,
  });
  return {
    id: row.id,
    name: row.name || preset?.name || row.provider_id || row.provider_type,
    provider_type: normalizeProviderType(row.provider_type, row.provider_id),
    provider_id: row.provider_id || preset?.providerId || 'custom',
    base_url: row.base_url || '',
    model: row.model || '',
    api_key_set: Boolean(row.api_key),
    settings,
    supports_tools: providerSupportsTools(row),
    supports_model_list: Boolean(preset?.supportsModelList),
    context_window: resolvedContext.contextWindow,
    context_window_source: resolvedContext.source,
    context_window_confidence: resolvedContext.confidence,
    local: providerIsLocal(row),
    managed: row.provider_id === LLAMA_PROVIDER_ID,
    last_test_status: row.last_test_status || null,
    last_test_message: row.last_test_message || null,
    last_test_at: row.last_test_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

/**
 * Check if Ollama is installed and running on localhost:11434
 * Attempts both /api/tags (list models) and / (health check) endpoints
 */
export async function checkOllamaRunning() {
  const OLLAMA_BASE = 'http://localhost:11434';

  // Try /api/tags first - gives us model list too
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        found: true,
        running: true,
        baseUrl: `${OLLAMA_BASE}/v1`,
        models: data.models?.map(m => m.name) || [],
      };
    }
  } catch {}

  // Fallback: try root health endpoint
  try {
    const health = await fetch(`${OLLAMA_BASE}/`, {
      signal: AbortSignal.timeout(2000)
    });
    if (health.ok) {
      return {
        found: true,
        running: true,
        baseUrl: `${OLLAMA_BASE}/v1`,
        models: [],
      };
    }
  } catch {}

  return {
    found: false,
    running: false,
    baseUrl: null,
    models: [],
  };
}

/**
 * Check if LM Studio is installed and running on localhost:1234
 */
export async function checkLMStudioRunning() {
  const LM_STUDIO_BASE = 'http://localhost:1234';

  try {
    const res = await fetch(`${LM_STUDIO_BASE}/v1/models`, {
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        found: true,
        running: true,
        baseUrl: `${LM_STUDIO_BASE}/v1`,
        models: data.data?.map(m => m.id) || [],
      };
    }
  } catch {}

  return {
    found: false,
    running: false,
    baseUrl: null,
    models: [],
  };
}
