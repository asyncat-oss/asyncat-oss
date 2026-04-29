const LLAMA_PORT = parseInt(process.env.LLAMA_SERVER_PORT ?? '8765', 10);

export const LLAMA_PROVIDER_ID = 'llamacpp-builtin';
export const LLAMA_BASE_URL = `http://127.0.0.1:${LLAMA_PORT}/v1`;

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
    model: 'gpt-4o',
    requiresApiKey: true,
    supportsTools: true,
    supportsModelList: true,
    local: false,
    description: 'OpenAI platform API.',
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
    local: false,
    description: 'Claude through Anthropic OpenAI compatibility.',
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
    local: false,
    description: 'Google Gemini through OpenAI compatibility.',
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
    local: false,
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
    local: false,
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
    local: false,
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
    local: false,
    description: 'Route through OpenRouter with one API key.',
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
    local: false,
    settings: { apiVersion: '2024-10-21' },
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
    local: false,
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
  if (providerId === 'azure') return url.replace(/\/+$/, '');
  if (/\/(v\d+(?:beta)?|openai\/v\d+|api\/v\d+|v\d+beta\/openai)\/?$/i.test(url)) {
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
