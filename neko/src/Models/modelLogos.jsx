import PropTypes from 'prop-types';
import { HardDrive, Plug, Server } from 'lucide-react';
import {
  siAlibabacloud,
  siAnthropic,
  siClaude,
  siCursor,
  siDeepseek,
  siElevenlabs,
  siGithubcopilot,
  siGoogle,
  siGooglegemini,
  siHuggingface,
  siMeta,
  siMinimax,
  siMistralai,
  siMoonshotai,
  siNvidia,
  siOllama,
  siOpenrouter,
  siPerplexity,
  siQwen,
  siVllm,
} from 'simple-icons';
import AsyncatMark from '../components/ui/AsyncatMark.jsx';

// Logos sit on a neutral tile, like connectors in Claude and ChatGPT. Real
// brand marks come from simple-icons in their own colour; marks whose brand
// colour is black follow the text colour so they invert in dark themes.
// Brands without a published mark get a plain letter monogram instead of a
// look-alike drawing.

// OpenAI's mark is not in simple-icons; this is the official path.
const OPENAI_PATH = 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654 2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';

const INK = null; // follow the text colour

const mark = (icon, color = `#${icon.hex}`) => ({ path: icon.path, color: /^#(0{6}|191919|121212)$/i.test(color) ? INK : color });
const letters = (text) => ({ monogram: text });

const OPENAI = { path: OPENAI_PATH, color: INK };

const PROVIDERS = {
  openai: OPENAI,
  'openai-codex': OPENAI,
  'codex-cli': OPENAI,
  codex: OPENAI,
  anthropic: mark(siAnthropic),
  claude: mark(siClaude),
  'claude-code': mark(siClaude),
  gemini: mark(siGooglegemini),
  'google-gemini': mark(siGooglegemini),
  google: mark(siGoogle),
  mistral: mark(siMistralai),
  deepseek: mark(siDeepseek),
  perplexity: mark(siPerplexity),
  ollama: mark(siOllama),
  qwen: mark(siQwen),
  alibaba: mark(siAlibabacloud),
  huggingface: mark(siHuggingface),
  vllm: mark(siVllm),
  nvidia: mark(siNvidia),
  'nvidia-nim': mark(siNvidia),
  openrouter: mark(siOpenrouter),
  minimax: mark(siMinimax),
  'minimax-cn': mark(siMinimax),
  kimi: mark(siMoonshotai),
  moonshot: mark(siMoonshotai),
  cursor: mark(siCursor),
  copilot: mark(siGithubcopilot),
  xai: letters('xAI'),
  grok: letters('xAI'),
  groq: letters('Gq'),
  cohere: letters('Co'),
  azure: letters('Az'),
  bedrock: letters('aws'),
  together: letters('T'),
  fireworks: letters('Fw'),
  cerebras: letters('Ce'),
  deepinfra: letters('DI'),
  lmstudio: letters('LM'),
  jan: letters('Jan'),
  localai: letters('LA'),
  koboldcpp: letters('Kb'),
  gpt4all: letters('G4'),
  opencode: letters('OC'),
  'opencode-go': letters('OC'),
  'mlx-builtin': letters('MLX'),
  'llamacpp-builtin': { component: (props) => <AsyncatMark variant="glyph" className={props.className} /> },
  custom: { component: Plug },
  'local-server': { component: Server },
  'on-device': { component: HardDrive },
  elevenlabs: mark(siElevenlabs),
  fal: letters('fal'),
  stability: letters('St'),
};

const MODEL_FAMILIES = [
  { match: ['pythia', 'eleuther', 'gpt-neox', 'gpt_neox'], cfg: letters('EA') },
  { match: ['codellama', 'code-llama', 'llama', 'meta-llama'], cfg: mark(siMeta) },
  { match: ['qwen', 'qwq'], cfg: mark(siQwen) },
  { match: ['mistral', 'mixtral', 'devstral', 'codestral', 'ministral'], cfg: mark(siMistralai) },
  { match: ['deepseek'], cfg: mark(siDeepseek) },
  { match: ['gemma', 'gemini'], cfg: mark(siGooglegemini) },
  { match: ['claude'], cfg: mark(siClaude) },
  { match: ['gpt-oss', 'gpt', 'openai', 'o1-', 'o3-', 'o4-'], cfg: OPENAI },
  { match: ['kimi', 'moonshot'], cfg: mark(siMoonshotai) },
  { match: ['minimax'], cfg: mark(siMinimax) },
  { match: ['nemotron', 'nvidia'], cfg: mark(siNvidia) },
  { match: ['phi-', 'phi3', 'phi4', 'phi '], cfg: letters('Phi') },
  { match: ['granite'], cfg: letters('IBM') },
  { match: ['command', 'aya', 'c4ai'], cfg: letters('Co') },
  { match: ['falcon'], cfg: letters('Fa') },
  { match: ['solar', 'exaone', 'upstage'], cfg: letters('So') },
  { match: ['yi-', '01-ai'], cfg: letters('Yi') },
  { match: ['smollm'], cfg: mark(siHuggingface) },
];

const HF_AUTHORS = {
  'deepseek-ai': mark(siDeepseek),
  qwen: mark(siQwen),
  mistralai: mark(siMistralai),
  'meta-llama': mark(siMeta),
  facebook: mark(siMeta),
  google: mark(siGoogle),
  'google-deepmind': mark(siGooglegemini),
  openai: OPENAI,
  'openai-community': OPENAI,
  anthropic: mark(siAnthropic),
  nvidia: mark(siNvidia),
  moonshotai: mark(siMoonshotai),
  minimaxai: mark(siMinimax),
  huggingfaceh4: mark(siHuggingface),
  huggingfacetb: mark(siHuggingface),
  huggingface: mark(siHuggingface),
  microsoft: letters('MS'),
  cohereforai: letters('Co'),
  'cohere-for-ai': letters('Co'),
  tiiuae: letters('Fa'),
  '01-ai': letters('Yi'),
  upstage: letters('So'),
  stabilityai: letters('St'),
  unsloth: letters('Us'),
  eleutherai: letters('EA'),
  ibm: letters('IBM'),
  'ibm-granite': letters('IBM'),
  nousresearch: letters('N'),
  thebloke: letters('TB'),
  bartowski: letters('bw'),
  lmstudio: letters('LM'),
  'lmstudio-community': letters('LM'),
  ggml: letters('gg'),
  'ggml-org': letters('gg'),
};

const TILE = {
  xs: 'h-6 w-6 rounded-md',
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-xl',
};
const GLYPH = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-[18px] w-[18px]',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};
const TEXT = {
  xs: ['text-[10px]', 'text-[8px]'],
  sm: ['text-[13px]', 'text-[10px]'],
  md: ['text-[15px]', 'text-[12px]'],
  lg: ['text-[17px]', 'text-[13px]'],
};

function monogramFor(label = '') {
  const words = String(label).replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** One logo tile. `cfg` is a path mark, a component, or a monogram. */
export function LogoTile({ cfg, label = '', size = 'md', className = '' }) {
  const tile = TILE[size] || TILE.md;
  const glyph = GLYPH[size] || GLYPH.md;
  const resolved = cfg || letters(monogramFor(label));
  let content;
  if (resolved.path) {
    content = (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${glyph} ${resolved.color ? '' : 'text-fg'}`} style={resolved.color ? { color: resolved.color } : undefined} fill="currentColor">
        <path d={resolved.path} />
      </svg>
    );
  } else if (resolved.component) {
    const Component = resolved.component;
    content = <Component className={`${glyph} text-fg`} strokeWidth={1.75} />;
  } else {
    const text = resolved.monogram || '?';
    const [large, small] = TEXT[size] || TEXT.md;
    content = (
      <span className={`select-none font-semibold leading-none tracking-[-0.03em] text-fg-muted ${text.length > 2 ? small : large}`}>
        {text}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-surface ring-1 ring-inset ring-line shadow-[0_1px_2px_rgb(0_0_0/0.04)] ${tile} ${className}`}
    >
      {content}
    </span>
  );
}

LogoTile.propTypes = {
  cfg: PropTypes.object,
  label: PropTypes.string,
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg']),
  className: PropTypes.string,
};

// Provider logos are looked up by provider id only. Matching on names gave a
// profile called "Janet" Jan's logo; unknown ids get a monogram of the name.
const providerLogoConfig = (providerId) => PROVIDERS[String(providerId || '').toLowerCase()] || null;

export const ProviderLogo = ({ providerId, name = '', size = 'md', className = '' }) => (
  <LogoTile cfg={providerLogoConfig(providerId)} label={name || providerId} size={size} className={className} />
);

ProviderLogo.propTypes = {
  providerId: PropTypes.string,
  name: PropTypes.string,
  isActive: PropTypes.bool,
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg']),
  className: PropTypes.string,
};

const modelFamilyConfig = (modelName = '', modelFile = '') => {
  const fileName = String(modelFile).split(/[\\/]/).pop();
  const haystack = `${modelName} ${fileName}`.toLowerCase();
  return MODEL_FAMILIES.find(({ match }) => match.some((key) => haystack.includes(key)))?.cfg || null;
};

export const LocalModelLogo = ({ modelName = '', modelFile = '', size = 'md', className = '' }) => (
  <LogoTile cfg={modelFamilyConfig(modelName, modelFile)} label={(modelName || modelFile).split('/').pop()} size={size} className={className} />
);

LocalModelLogo.propTypes = {
  modelName: PropTypes.string,
  modelFile: PropTypes.string,
  isActive: PropTypes.bool,
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg']),
  className: PropTypes.string,
};

export const HFAuthorLogo = ({ author = '', size = 'sm', className = '' }) => (
  <LogoTile cfg={HF_AUTHORS[String(author).toLowerCase()] || null} label={author} size={size} className={className} />
);

HFAuthorLogo.propTypes = {
  author: PropTypes.string,
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg']),
  className: PropTypes.string,
};

/**
 * A provider's mark on its own, sized by className, for inline use in pills
 * and rows. It is drawn in the text colour around it (grey in the app's
 * chrome), never in brand colours or on a coloured tile.
 */
export const ProviderGlyph = ({ providerId, className = 'h-4 w-4' }) => {
  if (providerId === 'asyncat') return <AsyncatMark variant="glyph" className={className} />;
  const cfg = providerLogoConfig(providerId);
  if (!cfg?.path) return null;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d={cfg.path} />
    </svg>
  );
};

/** A provider's logo tile in the app's greys: its mark without the brand colour. */
export const MonoProviderLogo = ({ providerId, name = '', size = 'md', className = '' }) => {
  const cfg = providerLogoConfig(providerId);
  return <LogoTile cfg={cfg?.path ? { path: cfg.path } : cfg} label={name || providerId} size={size} className={className} />;
};

MonoProviderLogo.propTypes = {
  providerId: PropTypes.string,
  name: PropTypes.string,
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg']),
  className: PropTypes.string,
};

ProviderGlyph.propTypes = {
  providerId: PropTypes.string,
  className: PropTypes.string,
};
