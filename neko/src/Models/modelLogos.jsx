/* eslint-disable react/prop-types */
import {
  siAnthropic,
  siMistralai,
  siMeta,
  siGoogle,
  siGooglegemini,
  siDeepseek,
  siPerplexity,
  siOllama,
  siQwen,
  siHuggingface,
} from 'simple-icons';

// Renders an official simple-icons SVG path (viewBox 0 0 24 24)
const SI = ({ icon, ...p }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d={icon.path} />
  </svg>
);

// ── Icons from simple-icons (real brand logos) ────────────────────────────────

const AnthropicIcon  = (p) => <SI icon={siAnthropic}    {...p} />;
const MistralIcon    = (p) => <SI icon={siMistralai}    {...p} />;
const MetaIcon       = (p) => <SI icon={siMeta}         {...p} />;
const GoogleIcon     = (p) => <SI icon={siGoogle}       {...p} />;
const GeminiIcon     = (p) => <SI icon={siGooglegemini} {...p} />;
const DeepSeekIcon   = (p) => <SI icon={siDeepseek}     {...p} />;
const PerplexityIcon = (p) => <SI icon={siPerplexity}   {...p} />;
const OllamaIcon     = (p) => <SI icon={siOllama}       {...p} />;
const QwenIcon       = (p) => <SI icon={siQwen}         {...p} />;
const HuggingFaceIcon= (p) => <SI icon={siHuggingface}  {...p} />;

// ── Icons hand-crafted (brand not in simple-icons v16) ────────────────────────

// OpenAI "bloom" — official path from openai.com branding
const OpenAIIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654 2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
  </svg>
);

// Microsoft Windows 4-square logo
const MicrosoftIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
  </svg>
);

// Groq — not in simple-icons; their mark is a circle-G letterform
const GroqIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 3a7 7 0 0 1 6.32 4H13v2h7a7 7 0 0 1-8 6.93V15h2v-2h-4v5.9A7 7 0 0 1 12 5z" />
  </svg>
);

// Cohere — their logo is a stylised "C" with coral brand color
const CohereIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 2a10 10 0 1 0 7.07 17.07l-1.41-1.41A8 8 0 1 1 19.9 13H17a5 5 0 1 0-1.46 3.54l1.41 1.42A7 7 0 1 1 12 5a7 7 0 0 1 4.95 2.05l1.41-1.41A9 9 0 0 0 12 2z" />
  </svg>
);

// Azure — Microsoft's official Azure "A" wave shape
const AzureIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M13.05 4.24L6.56 18.05l13.03.01L13.05 4.24zM5.58 18.17L2 21.76h9.27l-5.69-3.59zm8.94-11.42L8.6 19.05H22L14.52 6.75z" />
  </svg>
);

// Fireworks AI — spark/starburst
const FireworksIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...p}>
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
  </svg>
);

// LM Studio — monitor with code prompt
const LMStudioIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <polyline points="8,21 12,17 16,21" />
    <path d="M8 9l3 3-3 3" />
    <line x1="13" y1="15" x2="16" y2="15" />
  </svg>
);

// Unsloth — flame shape
const UnslothIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 2c.32 2.82.14 5.17-1.02 7.01C9.8 11.05 8.5 12.3 8.5 14.5a3.5 3.5 0 0 0 3.5 3.5 3.5 3.5 0 0 0 3.5-3.5c0-1.5-1-2.5-1.5-3.5C13 9.5 12.18 6.5 12 2zm0 4.5c.3 1.6.8 3.1 1.5 4C14.5 12 15 13 15 14.5A3 3 0 0 1 12 17.5 3 3 0 0 1 9 14.5c0-1 .5-2 1-3 .8-1.25 1.7-2.8 2-4.5z" />
  </svg>
);

// Yi / 01.ai — Y letterform
const YiIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M4 4h3.5l4.5 7 4.5-7H20l-6.25 9.5V20h-3.5v-6.5z" />
  </svg>
);

// Falcon / TII — stylised bird wing
const FalconIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M21 6c-3.5.5-6.5 2.5-8 6-1.5-3.5-4.5-5.5-8-6 2 2 3 5 3 8H4l3 4h10l3-4h-4c0-3 1-6 3-8z" />
  </svg>
);

// Solar / Upstage — sun with rays
const SolarIcon = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" {...p}>
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    <line x1="12" y1="2" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
    <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
    <line x1="2" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="22" y2="12" />
    <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
    <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
  </svg>
);

// Generic letter monogram fallback
const Monogram = ({ letters = '?', ...p }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...p}>
    <text
      x="10" y="14.5"
      textAnchor="middle"
      fontSize={letters.length > 1 ? '9' : '12'}
      fontWeight="800"
      fontFamily="system-ui,-apple-system,sans-serif"
      letterSpacing="-0.5"
    >
      {letters}
    </text>
  </svg>
);

// ── Provider brand configs ────────────────────────────────────────────────────

const PROVIDER_CONFIGS = {
  openai:              { bg: '#000000', Icon: OpenAIIcon },
  'openai-codex':      { bg: '#000000', Icon: OpenAIIcon },
  anthropic:           { bg: '#CC785C', Icon: AnthropicIcon },
  claude:              { bg: '#CC785C', Icon: AnthropicIcon },
  deepseek:            { bg: '#5786FE', Icon: DeepSeekIcon },
  mistral:             { bg: '#FA520F', Icon: MistralIcon },
  groq:                { bg: '#F55036', Icon: GroqIcon },
  gemini:              { bg: '#8E75B2', Icon: GeminiIcon },
  'google-gemini':     { bg: '#8E75B2', Icon: GeminiIcon },
  google:              { bg: '#4285F4', Icon: GoogleIcon },
  'google-ai':         { bg: '#4285F4', Icon: GoogleIcon },
  openrouter:          { bg: '#6D28D9', Icon: (p) => <Monogram letters="OR" {...p} /> },
  together:            { bg: '#2563EB', Icon: (p) => <Monogram letters="T+" {...p} /> },
  togetherai:          { bg: '#2563EB', Icon: (p) => <Monogram letters="T+" {...p} /> },
  perplexity:          { bg: '#1FB8CD', Icon: PerplexityIcon },
  cohere:              { bg: '#39594D', Icon: CohereIcon },
  azure:               { bg: '#0078D4', Icon: AzureIcon },
  'azure-openai':      { bg: '#0078D4', Icon: AzureIcon },
  fireworks:           { bg: '#7C3AED', Icon: FireworksIcon },
  'fireworks-ai':      { bg: '#7C3AED', Icon: FireworksIcon },
  nvidia:              { bg: '#76B900', Icon: (p) => <Monogram letters="NV" {...p} /> },
  'nvidia-nim':        { bg: '#76B900', Icon: (p) => <Monogram letters="NV" {...p} /> },
  ollama:              { bg: '#2D2D2D', Icon: OllamaIcon },
  lmstudio:            { bg: '#1A1A2E', Icon: LMStudioIcon },
  vllm:                { bg: '#1A56DB', Icon: (p) => <Monogram letters="vL" {...p} /> },
  jan:                 { bg: '#0F172A', Icon: (p) => <Monogram letters="J" {...p} /> },
  localai:             { bg: '#0E7490', Icon: (p) => <Monogram letters="LA" {...p} /> },
  koboldcpp:           { bg: '#B45309', Icon: (p) => <Monogram letters="K" {...p} /> },
  gpt4all:             { bg: '#374151', Icon: (p) => <Monogram letters="G4" {...p} /> },
  'llamacpp-builtin':  { bg: '#374151', Icon: (p) => <Monogram letters="LC" {...p} /> },
  'codex-cli':         { bg: '#000000', Icon: OpenAIIcon },
  xai:                 { bg: '#111827', Icon: (p) => <Monogram letters="xAI" {...p} /> },
  grok:                { bg: '#111827', Icon: (p) => <Monogram letters="xAI" {...p} /> },
  hyperbolic:          { bg: '#4338CA', Icon: (p) => <Monogram letters="HB" {...p} /> },
  cerebras:            { bg: '#E84142', Icon: (p) => <Monogram letters="CB" {...p} /> },
  custom:              { bg: '#6B7280', Icon: (p) => <Monogram letters="C" {...p} /> },
};

// ── Local model family configs ────────────────────────────────────────────────

const LOCAL_MODEL_FAMILIES = [
  { match: ['llama', 'meta-llama'],           cfg: { bg: '#0467DF', Icon: MetaIcon } },
  { match: ['qwen'],                           cfg: { bg: '#6950EF', Icon: QwenIcon } },
  { match: ['mistral', 'mixtral', 'devstral'],cfg: { bg: '#FA520F', Icon: MistralIcon } },
  { match: ['deepseek'],                       cfg: { bg: '#5786FE', Icon: DeepSeekIcon } },
  { match: ['phi', 'phi-'],                    cfg: { bg: '#0078D4', Icon: MicrosoftIcon } },
  { match: ['gemma'],                          cfg: { bg: '#4285F4', Icon: GoogleIcon } },
  { match: ['gemini'],                         cfg: { bg: '#8E75B2', Icon: GeminiIcon } },
  { match: ['unsloth'],                        cfg: { bg: '#DC2626', Icon: UnslothIcon } },
  { match: ['falcon'],                         cfg: { bg: '#1E3A5F', Icon: FalconIcon } },
  { match: ['solar', 'exaone', 'upstage'],     cfg: { bg: '#F59E0B', Icon: SolarIcon } },
  { match: ['command', 'aya', 'c4ai'],         cfg: { bg: '#39594D', Icon: CohereIcon } },
  { match: ['yi', '01-ai', 'yi-'],             cfg: { bg: '#E11D48', Icon: YiIcon } },
  { match: ['claude'],                         cfg: { bg: '#CC785C', Icon: AnthropicIcon } },
  { match: ['gpt', 'openai'],                  cfg: { bg: '#000000', Icon: OpenAIIcon } },
  { match: ['groq'],                           cfg: { bg: '#F55036', Icon: GroqIcon } },
  { match: ['wizard', 'wizardlm'],             cfg: { bg: '#7C3AED', Icon: (p) => <Monogram letters="W" {...p} /> } },
  { match: ['stablelm', 'stability'],          cfg: { bg: '#6366F1', Icon: (p) => <Monogram letters="S" {...p} /> } },
  { match: ['neural', 'nous'],                 cfg: { bg: '#2563EB', Icon: (p) => <Monogram letters="N" {...p} /> } },
  { match: ['orca'],                           cfg: { bg: '#0E7490', Icon: (p) => <Monogram letters="OR" {...p} /> } },
  { match: ['vicuna', 'lmsys'],                cfg: { bg: '#7C3AED', Icon: (p) => <Monogram letters="V" {...p} /> } },
  { match: ['zephyr'],                         cfg: { bg: '#0F766E', Icon: (p) => <Monogram letters="Z" {...p} /> } },
  { match: ['codellama', 'code-llama'],        cfg: { bg: '#0467DF', Icon: MetaIcon } },
  { match: ['starcoder', 'starling'],          cfg: { bg: '#F97316', Icon: (p) => <Monogram letters="SC" {...p} /> } },
  { match: ['internlm'],                       cfg: { bg: '#1D4ED8', Icon: (p) => <Monogram letters="IL" {...p} /> } },
];

// ── HuggingFace author → brand config ─────────────────────────────────────────

const HF_AUTHOR_CONFIGS = {
  'deepseek-ai':    { bg: '#5786FE', Icon: DeepSeekIcon },
  deepseek:         { bg: '#5786FE', Icon: DeepSeekIcon },
  qwen:             { bg: '#6950EF', Icon: QwenIcon },
  mistralai:        { bg: '#FA520F', Icon: MistralIcon },
  mistral:          { bg: '#FA520F', Icon: MistralIcon },
  'meta-llama':     { bg: '#0467DF', Icon: MetaIcon },
  facebook:         { bg: '#0467DF', Icon: MetaIcon },
  meta:             { bg: '#0467DF', Icon: MetaIcon },
  google:           { bg: '#4285F4', Icon: GoogleIcon },
  'google-deepmind':{ bg: '#4285F4', Icon: GoogleIcon },
  microsoft:        { bg: '#0078D4', Icon: MicrosoftIcon },
  openai:           { bg: '#000000', Icon: OpenAIIcon },
  anthropic:        { bg: '#CC785C', Icon: AnthropicIcon },
  cohere:           { bg: '#39594D', Icon: CohereIcon },
  'cohere-for-ai':  { bg: '#39594D', Icon: CohereIcon },
  tiiuae:           { bg: '#1E3A5F', Icon: FalconIcon },
  '01-ai':          { bg: '#E11D48', Icon: YiIcon },
  upstage:          { bg: '#F59E0B', Icon: SolarIcon },
  stabilityai:      { bg: '#6366F1', Icon: (p) => <Monogram letters="S" {...p} /> },
  'lmsys-chat':     { bg: '#7C3AED', Icon: (p) => <Monogram letters="V" {...p} /> },
  lmsys:            { bg: '#7C3AED', Icon: (p) => <Monogram letters="V" {...p} /> },
  unsloth:          { bg: '#DC2626', Icon: UnslothIcon },
  'huggingfaceh4':  { bg: '#FFD21E', Icon: HuggingFaceIcon },
  huggingface:      { bg: '#FFD21E', Icon: HuggingFaceIcon },
  'nousresearch':   { bg: '#2563EB', Icon: (p) => <Monogram letters="N" {...p} /> },
  teknium:          { bg: '#2563EB', Icon: (p) => <Monogram letters="N" {...p} /> },
  thebloke:         { bg: '#374151', Icon: (p) => <Monogram letters="TB" {...p} /> },
  bartowski:        { bg: '#374151', Icon: (p) => <Monogram letters="BW" {...p} /> },
};

// ── Logo lookup helpers ───────────────────────────────────────────────────────

const FALLBACK_CFG = { bg: '#6B7280', Icon: null };

const getProviderCfg = (providerId, providerName) => {
  if (providerId) {
    const direct = PROVIDER_CONFIGS[providerId.toLowerCase()];
    if (direct) return direct;
  }
  if (providerName) {
    const lower = providerName.toLowerCase();
    for (const [key, cfg] of Object.entries(PROVIDER_CONFIGS)) {
      if (lower.includes(key)) return cfg;
    }
  }
  return FALLBACK_CFG;
};

const getLocalModelCfg = (modelName = '', modelFile = '') => {
  const hay = `${modelName} ${modelFile}`.toLowerCase();
  for (const { match, cfg } of LOCAL_MODEL_FAMILIES) {
    if (match.some((m) => hay.includes(m))) return cfg;
  }
  return FALLBACK_CFG;
};

const getHFAuthorCfg = (author = '') => {
  const key = author.toLowerCase();
  if (HF_AUTHOR_CONFIGS[key]) return HF_AUTHOR_CONFIGS[key];
  for (const [k, v] of Object.entries(HF_AUTHOR_CONFIGS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
};

const fallbackLetter = (str = '') => {
  const clean = str.replace(/[^a-zA-Z0-9]/g, '');
  return (clean.slice(0, 2) || '?').toUpperCase();
};

// ── Shared size tokens ────────────────────────────────────────────────────────
const SIZES = {
  sm: { box: 'h-7 w-7',   icon: 'w-3.5 h-3.5' },
  md: { box: 'h-10 w-10', icon: 'w-5 h-5' },
  lg: { box: 'h-12 w-12', icon: 'w-6 h-6' },
};

// ── Provider logo (cloud/API providers) ──────────────────────────────────────
export const ProviderLogo = ({ providerId, name, isActive = false, size = 'md' }) => {
  const cfg = getProviderCfg(providerId, name);
  const { box, icon } = SIZES[size] || SIZES.md;
  const Icon = cfg.Icon;

  if (isActive) {
    return (
      <div className={`flex ${box} flex-shrink-0 items-center justify-center rounded-xl bg-gray-900 dark:bg-gray-600 midnight:bg-slate-700`}>
        {Icon
          ? <Icon className={`${icon} text-white flex-shrink-0`} />
          : <span className="text-white text-xs font-bold select-none">{fallbackLetter(name || providerId)}</span>
        }
      </div>
    );
  }

  return (
    <div
      className={`flex ${box} flex-shrink-0 items-center justify-center rounded-xl transition-colors`}
      style={{ backgroundColor: cfg.bg || '#6B7280' }}
    >
      {Icon
        ? <Icon className={`${icon} text-white flex-shrink-0`} />
        : <span className="text-white text-xs font-bold select-none">{fallbackLetter(name || providerId)}</span>
      }
    </div>
  );
};

// ── Local model logo (by model name/filename) ─────────────────────────────────
export const LocalModelLogo = ({ modelName = '', modelFile = '', isActive = false, size = 'md' }) => {
  const cfg = getLocalModelCfg(modelName, modelFile);
  const { box, icon } = SIZES[size] || SIZES.md;
  const Icon = cfg.Icon;
  const letter = fallbackLetter(modelName || modelFile);

  if (isActive) {
    return (
      <div className={`flex ${box} flex-shrink-0 items-center justify-center rounded-xl bg-gray-900 dark:bg-gray-600 midnight:bg-slate-700`}>
        {Icon
          ? <Icon className={`${icon} text-white flex-shrink-0`} />
          : <span className="text-white text-xs font-bold select-none">{letter}</span>
        }
      </div>
    );
  }

  return (
    <div
      className={`flex ${box} flex-shrink-0 items-center justify-center rounded-xl transition-colors`}
      style={{ backgroundColor: cfg.bg || '#6B7280' }}
    >
      {Icon
        ? <Icon className={`${icon} text-white flex-shrink-0`} />
        : <span className="text-white text-xs font-bold select-none">{letter}</span>
      }
    </div>
  );
};

// ── HuggingFace author logo (inline, for search result rows) ──────────────────
export const HFAuthorLogo = ({ author = '', size = 'sm' }) => {
  const cfg = getHFAuthorCfg(author);
  const { box, icon } = SIZES[size] || SIZES.sm;
  if (!cfg) {
    return (
      <div className={`flex ${box} flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800`}>
        <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 select-none">
          {fallbackLetter(author)}
        </span>
      </div>
    );
  }
  const Icon = cfg.Icon;
  return (
    <div
      className={`flex ${box} flex-shrink-0 items-center justify-center rounded-lg`}
      style={{ backgroundColor: cfg.bg }}
    >
      {Icon
        ? <Icon className={`${icon} text-white flex-shrink-0`} />
        : <span className="text-white text-[9px] font-bold select-none">{fallbackLetter(author)}</span>
      }
    </div>
  );
};
