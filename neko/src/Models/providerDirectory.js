// How the provider catalog (GET /api/ai/providers/catalog) is presented in the
// "Add provider" directory. Presets that only differ by region, plan or local
// server software are shown as one card with a variant picker; their ids stay
// separate so existing profiles keep working.

export const POPULAR_PROVIDER_IDS = [
  'openai', 'anthropic', 'gemini', 'openrouter', 'ollama', 'lmstudio',
  'xai', 'deepseek', 'mistral', 'groq',
];

export const PROVIDER_GROUPS = [
  {
    id: 'local-server',
    name: 'Local server',
    description: 'Any OpenAI-compatible server on this computer or your network: vLLM, Jan, LocalAI, KoboldCpp, GPT4All and others.',
    local: true,
    variantLabel: 'Server software',
    members: [
      { id: 'vllm', label: 'vLLM' },
      { id: 'jan', label: 'Jan' },
      { id: 'localai', label: 'LocalAI' },
      { id: 'koboldcpp', label: 'KoboldCpp' },
      { id: 'gpt4all', label: 'GPT4All' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax models through their OpenAI-compatible API.',
    variantLabel: 'Region',
    members: [
      { id: 'minimax', label: 'Global' },
      { id: 'minimax-cn', label: 'China' },
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'Curated coding models from OpenCode with one API key.',
    variantLabel: 'Plan',
    members: [
      { id: 'opencode', label: 'Zen' },
      { id: 'opencode-go', label: 'Go (low cost)' },
    ],
  },
];

// Plain descriptions for the directory; the catalog's own text describes the
// API compatibility layer, which matters less when choosing a provider.
const DESCRIPTIONS = {
  openai: 'GPT models from the OpenAI API.',
  anthropic: 'Claude models from Anthropic.',
  gemini: 'Gemini models from Google AI Studio.',
  openrouter: 'Hundreds of models from many labs with one key.',
  ollama: 'Run open models on this computer with Ollama.',
  lmstudio: 'Run open models on this computer with LM Studio.',
  xai: 'Grok models from xAI.',
  deepseek: "DeepSeek's chat and reasoning models.",
  mistral: "Mistral's open and commercial models.",
  groq: 'Very fast inference for popular open models.',
  perplexity: 'Sonar models that search the web as they answer.',
  together: 'Open models hosted by Together AI.',
  fireworks: 'Fast hosted open models from Fireworks AI.',
  deepinfra: 'Low-cost hosted open models from DeepInfra.',
  cerebras: 'Very fast inference on Cerebras hardware.',
  'nvidia-nim': 'Models hosted on NVIDIA NIM.',
  huggingface: 'Models from Hugging Face inference providers.',
  cohere: 'Command models from Cohere.',
  kimi: 'Kimi models from Moonshot AI.',
  qwen: 'Qwen models from Alibaba Cloud.',
  bedrock: 'Models on Amazon Bedrock in your AWS account.',
  azure: 'OpenAI models deployed in your Azure account.',
  'codex-cli': 'Use the Codex CLI on this computer, signed in with your ChatGPT account.',
  custom: 'Any service with an OpenAI-compatible API.',
};

const NAMES = { 'codex-cli': 'Codex CLI' };

// Not offered as new connections: built-in engines live under Local models,
// and the Codex CLI is set up from the detected-runtime card.
const HIDDEN_IDS = new Set(['openai-codex']);

const groupOf = (id) => PROVIDER_GROUPS.find((group) => group.members.some((member) => member.id === id));

/**
 * Directory entries built from the catalog:
 *   { key, name, description, local, runtime, popular, presets: [{ preset, label }] }
 * Single providers have one preset; grouped ones list each variant.
 */
export function buildDirectory(catalog = []) {
  const byId = new Map(catalog.map((preset) => [preset.providerId || preset.id, preset]));
  const entries = [];
  const seenGroups = new Set();

  for (const preset of catalog) {
    const id = preset.providerId || preset.id;
    if (preset.managed || HIDDEN_IDS.has(id)) continue;

    const group = groupOf(id);
    if (group) {
      if (seenGroups.has(group.id)) continue;
      seenGroups.add(group.id);
      const presets = group.members
        .map((member) => (byId.has(member.id) ? { preset: byId.get(member.id), label: member.label } : null))
        .filter(Boolean);
      if (!presets.length) continue;
      entries.push({
        key: group.id,
        logoId: group.id === 'local-server' ? 'local-server' : presets[0].preset.providerId,
        name: group.name,
        description: group.description,
        local: Boolean(group.local),
        runtime: false,
        popular: false,
        variantLabel: group.variantLabel,
        presets,
      });
      continue;
    }

    entries.push({
      key: id,
      logoId: id,
      name: NAMES[id] || preset.name,
      description: DESCRIPTIONS[id] || preset.description,
      local: Boolean(preset.local),
      runtime: Boolean(preset.runtime),
      popular: POPULAR_PROVIDER_IDS.includes(id),
      presets: [{ preset, label: preset.name }],
    });
  }

  const popularRank = (entry) => {
    const index = POPULAR_PROVIDER_IDS.indexOf(entry.key);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  return entries.sort((a, b) => {
    if (a.key === 'custom') return 1;
    if (b.key === 'custom') return -1;
    return popularRank(a) - popularRank(b);
  });
}

export function matchesDirectoryFilter(entry, filter, query) {
  if (filter === 'popular' && !entry.popular) return false;
  if (filter === 'local' && !entry.local) return false;
  if (filter === 'cloud' && entry.local) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [entry.name, entry.description, ...entry.presets.map(({ preset, label }) => `${label} ${preset.name} ${preset.providerId}`)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
