/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';
import {
  siAnthropic,
  siDeepseek,
  siGoogle,
  siGooglegemini,
  siHuggingface,
  siMeta,
  siMinimax,
  siMistralai,
  siNvidia,
  siOllama,
  siOpenrouter,
  siPerplexity,
  siQwen,
  siX,
} from 'simple-icons';

const SI = ({ icon, ...props }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d={icon.path} />
  </svg>
);

const officialIcon = (icon, displayName) => {
  const OfficialIcon = (props) => <SI icon={icon} {...props} />;
  OfficialIcon.displayName = displayName;
  return OfficialIcon;
};
const AnthropicIcon = officialIcon(siAnthropic, 'AnthropicIcon');
const DeepSeekIcon = officialIcon(siDeepseek, 'DeepSeekIcon');
const GoogleIcon = officialIcon(siGoogle, 'GoogleIcon');
const GeminiIcon = officialIcon(siGooglegemini, 'GeminiIcon');
const HuggingFaceIcon = officialIcon(siHuggingface, 'HuggingFaceIcon');
const MetaIcon = officialIcon(siMeta, 'MetaIcon');
const MiniMaxIcon = officialIcon(siMinimax, 'MiniMaxIcon');
const MistralIcon = officialIcon(siMistralai, 'MistralIcon');
const NvidiaIcon = officialIcon(siNvidia, 'NvidiaIcon');
const OllamaIcon = officialIcon(siOllama, 'OllamaIcon');
const OpenRouterIcon = officialIcon(siOpenrouter, 'OpenRouterIcon');
const PerplexityIcon = officialIcon(siPerplexity, 'PerplexityIcon');
const QwenIcon = officialIcon(siQwen, 'QwenIcon');
const XIcon = officialIcon(siX, 'XIcon');

// OpenAI is not distributed by simple-icons. This is its published bloom mark.
const OpenAIIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654 2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
);

const Monogram = ({ letters = '?', ...props }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
    <text
      x="10"
      y="14.5"
      textAnchor="middle"
      fontSize={letters.length > 1 ? '8.5' : '12'}
      fontWeight="750"
      fontFamily="system-ui,-apple-system,sans-serif"
      letterSpacing="-0.4"
    >
      {letters}
    </text>
  </svg>
);

const neutralCfg = (letters) => ({
  bg: '#F3F4F6',
  fg: '#4B5563',
  Icon: (props) => <Monogram letters={letters} {...props} />,
  neutral: true,
});

const PROVIDER_CONFIGS = {
  openai: { bg: '#000000', fg: '#FFFFFF', Icon: OpenAIIcon },
  'openai-codex': { bg: '#000000', fg: '#FFFFFF', Icon: OpenAIIcon },
  'codex-cli': { bg: '#000000', fg: '#FFFFFF', Icon: OpenAIIcon },
  anthropic: { bg: '#CC785C', fg: '#FFFFFF', Icon: AnthropicIcon },
  claude: { bg: '#CC785C', fg: '#FFFFFF', Icon: AnthropicIcon },
  deepseek: { bg: '#5786FE', fg: '#FFFFFF', Icon: DeepSeekIcon },
  mistral: { bg: '#FA520F', fg: '#FFFFFF', Icon: MistralIcon },
  gemini: { bg: '#8E75B2', fg: '#FFFFFF', Icon: GeminiIcon },
  'google-gemini': { bg: '#8E75B2', fg: '#FFFFFF', Icon: GeminiIcon },
  google: { bg: '#4285F4', fg: '#FFFFFF', Icon: GoogleIcon },
  'google-ai': { bg: '#4285F4', fg: '#FFFFFF', Icon: GoogleIcon },
  openrouter: { bg: '#0F172A', fg: '#FFFFFF', Icon: OpenRouterIcon },
  perplexity: { bg: '#1FB8CD', fg: '#FFFFFF', Icon: PerplexityIcon },
  nvidia: { bg: '#76B900', fg: '#FFFFFF', Icon: NvidiaIcon },
  'nvidia-nim': { bg: '#76B900', fg: '#FFFFFF', Icon: NvidiaIcon },
  ollama: { bg: '#111827', fg: '#FFFFFF', Icon: OllamaIcon },
  qwen: { bg: '#6950EF', fg: '#FFFFFF', Icon: QwenIcon },
  minimax: { bg: '#E73562', fg: '#FFFFFF', Icon: MiniMaxIcon },
  huggingface: { bg: '#FFD21E', fg: '#111827', Icon: HuggingFaceIcon },
  xai: { bg: '#000000', fg: '#FFFFFF', Icon: XIcon },
  grok: { bg: '#000000', fg: '#FFFFFF', Icon: XIcon },
  groq: neutralCfg('GQ'),
  cohere: neutralCfg('CO'),
  azure: neutralCfg('AZ'),
  'azure-openai': neutralCfg('AZ'),
  fireworks: neutralCfg('FW'),
  'fireworks-ai': neutralCfg('FW'),
  together: neutralCfg('T+'),
  togetherai: neutralCfg('T+'),
  lmstudio: neutralCfg('LM'),
  vllm: neutralCfg('vL'),
  jan: neutralCfg('J'),
  localai: neutralCfg('LA'),
  koboldcpp: neutralCfg('KC'),
  gpt4all: neutralCfg('G4'),
  'llamacpp-builtin': neutralCfg('LC'),
  hyperbolic: neutralCfg('HB'),
  cerebras: neutralCfg('CB'),
  deepinfra: neutralCfg('DI'),
  bedrock: neutralCfg('BR'),
  custom: neutralCfg('C'),
};

const LOCAL_MODEL_FAMILIES = [
  { match: ['llama', 'meta-llama', 'codellama', 'code-llama'], cfg: { bg: '#0467DF', fg: '#FFFFFF', Icon: MetaIcon } },
  { match: ['qwen'], cfg: { bg: '#6950EF', fg: '#FFFFFF', Icon: QwenIcon } },
  { match: ['mistral', 'mixtral', 'devstral'], cfg: { bg: '#FA520F', fg: '#FFFFFF', Icon: MistralIcon } },
  { match: ['deepseek'], cfg: { bg: '#5786FE', fg: '#FFFFFF', Icon: DeepSeekIcon } },
  { match: ['gemma'], cfg: { bg: '#4285F4', fg: '#FFFFFF', Icon: GoogleIcon } },
  { match: ['gemini'], cfg: { bg: '#8E75B2', fg: '#FFFFFF', Icon: GeminiIcon } },
  { match: ['claude'], cfg: { bg: '#CC785C', fg: '#FFFFFF', Icon: AnthropicIcon } },
  { match: ['gpt', 'openai'], cfg: { bg: '#000000', fg: '#FFFFFF', Icon: OpenAIIcon } },
];

const HF_AUTHOR_CONFIGS = {
  'deepseek-ai': { bg: '#5786FE', fg: '#FFFFFF', Icon: DeepSeekIcon },
  deepseek: { bg: '#5786FE', fg: '#FFFFFF', Icon: DeepSeekIcon },
  qwen: { bg: '#6950EF', fg: '#FFFFFF', Icon: QwenIcon },
  mistralai: { bg: '#FA520F', fg: '#FFFFFF', Icon: MistralIcon },
  mistral: { bg: '#FA520F', fg: '#FFFFFF', Icon: MistralIcon },
  'meta-llama': { bg: '#0467DF', fg: '#FFFFFF', Icon: MetaIcon },
  facebook: { bg: '#0467DF', fg: '#FFFFFF', Icon: MetaIcon },
  meta: { bg: '#0467DF', fg: '#FFFFFF', Icon: MetaIcon },
  google: { bg: '#4285F4', fg: '#FFFFFF', Icon: GoogleIcon },
  'google-deepmind': { bg: '#4285F4', fg: '#FFFFFF', Icon: GoogleIcon },
  openai: { bg: '#000000', fg: '#FFFFFF', Icon: OpenAIIcon },
  anthropic: { bg: '#CC785C', fg: '#FFFFFF', Icon: AnthropicIcon },
  'huggingfaceh4': { bg: '#FFD21E', fg: '#111827', Icon: HuggingFaceIcon },
  huggingface: { bg: '#FFD21E', fg: '#111827', Icon: HuggingFaceIcon },
};

const FALLBACK_CFG = { bg: '#F3F4F6', fg: '#4B5563', Icon: null, neutral: true };

const fallbackLetter = (value = '') => {
  const clean = value.replace(/[^a-zA-Z0-9]/g, '');
  return (clean.slice(0, 2) || '?').toUpperCase();
};

const getProviderCfg = (providerId, providerName) => {
  const direct = PROVIDER_CONFIGS[String(providerId || '').toLowerCase()];
  if (direct) return direct;
  const lowerName = String(providerName || '').toLowerCase();
  const match = Object.entries(PROVIDER_CONFIGS).find(([key]) => lowerName.includes(key));
  return match?.[1] || FALLBACK_CFG;
};

const getLocalModelCfg = (modelName = '', modelFile = '') => {
  const haystack = `${modelName} ${modelFile}`.toLowerCase();
  return LOCAL_MODEL_FAMILIES.find(({ match }) => match.some(marker => haystack.includes(marker)))?.cfg || FALLBACK_CFG;
};

const getHFAuthorCfg = (author = '') => HF_AUTHOR_CONFIGS[author.toLowerCase()] || null;

const SIZES = {
  sm: { box: 'h-8 w-8', icon: 'h-4 w-4' },
  md: { box: 'h-10 w-10', icon: 'h-5 w-5' },
  lg: { box: 'h-12 w-12', icon: 'h-6 w-6' },
};

const BrandTile = ({ cfg, label, isActive = false, size = 'md', rounded = 'rounded-xl' }) => {
  const { box, icon } = SIZES[size] || SIZES.md;
  const Icon = cfg.Icon;
  return (
    <div
      className={`flex ${box} ${rounded} flex-shrink-0 items-center justify-center border transition-shadow ${
        cfg.neutral
          ? 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 midnight:border-slate-700 midnight:bg-slate-800 midnight:text-slate-300'
          : 'border-transparent'
      } ${isActive ? 'ring-2 ring-gray-900/15 ring-offset-1 dark:ring-white/30 dark:ring-offset-gray-900 midnight:ring-slate-400/40 midnight:ring-offset-slate-950' : ''}`}
      style={cfg.neutral ? undefined : { backgroundColor: cfg.bg, color: cfg.fg }}
    >
      {Icon
        ? <Icon className={`${icon} flex-shrink-0`} />
        : <span className="select-none text-[10px] font-semibold">{fallbackLetter(label)}</span>}
    </div>
  );
};

export const ProviderLogo = ({ providerId, name, isActive = false, size = 'md' }) => (
  <BrandTile cfg={getProviderCfg(providerId, name)} label={name || providerId} isActive={isActive} size={size} />
);

export const LocalModelLogo = ({ modelName = '', modelFile = '', isActive = false, size = 'md' }) => (
  <BrandTile
    cfg={getLocalModelCfg(modelName, modelFile)}
    label={modelName || modelFile}
    isActive={isActive}
    size={size}
  />
);

// Hugging Face account avatars are the publisher-controlled source of truth.
// Known official marks and then a neutral monogram remain as offline fallbacks.
export const HFAuthorLogo = ({ author = '', avatarUrl = '', size = 'sm' }) => {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const resolvedAvatarUrl = avatarUrl || (author
    ? `https://huggingface.co/api/avatars/${encodeURIComponent(author)}`
    : '');

  useEffect(() => setAvatarFailed(false), [resolvedAvatarUrl]);

  const { box } = SIZES[size] || SIZES.sm;
  if (resolvedAvatarUrl && !avatarFailed) {
    return (
      <div
        className={`flex ${box} flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-900`}
        title={`${author} on Hugging Face`}
      >
        <img
          src={resolvedAvatarUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setAvatarFailed(true)}
        />
      </div>
    );
  }

  return (
    <BrandTile
      cfg={getHFAuthorCfg(author) || FALLBACK_CFG}
      label={author}
      size={size}
      rounded="rounded-lg"
    />
  );
};
