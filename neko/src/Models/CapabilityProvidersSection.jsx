import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, Zap, Construction } from 'lucide-react';
import { configApi } from '../Settings/settingApi.js';
import { Badge, Panel, SectionHeader } from './modelPageShared.jsx';

const ACTIVE_KEYS = {
  stt: 'ASYNCAT_STT_PROVIDER',
  tts: 'ASYNCAT_TTS_PROVIDER',
  vision: 'ASYNCAT_VISION_PROVIDER',
  image: 'ASYNCAT_IMAGE_PROVIDER',
};

const CAPABILITY_LABELS = {
  stt: 'Speech-to-Text',
  tts: 'Text-to-Speech',
  vision: 'Vision',
  image: 'Image Generation',
};

// Vision uses the active chat LLM's multimodal capability — not a separate routing system.
const VISION_ROUTING_NOTE = 'Vision is handled by your active chat provider if it supports multimodal input (e.g. GPT-4o, Claude 3, Gemini, MiniMax-M2). To change the vision model, switch your chat provider above.';

// implemented: which capabilities are actually wired in the backend.
// Providers listed but not implemented will show a "Coming soon" badge and cannot be selected.
const PROVIDERS = [
  {
    id: 'local',
    name: 'Local Runtime',
    secretKey: null,
    capabilities: ['stt', 'tts', 'vision', 'image'],
    implemented: { stt: true, tts: true, vision: true, image: true },
    models: {
      stt: 'whisper.cpp',
      tts: 'Piper',
      vision: 'Local multimodal assets (mmproj)',
      image: 'stable-diffusion.cpp / ComfyUI',
    },
    description: 'Runs on your machine with the assets and engines configured on this page.',
    docsUrl: '',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    secretKey: 'OPENAI_API_KEY',
    capabilities: ['stt', 'tts', 'vision', 'image'],
    implemented: { stt: true, tts: true, vision: false, image: true },
    models: {
      stt: 'gpt-4o-transcribe',
      tts: 'gpt-4o-mini-tts',
      vision: 'Routes through active LLM — set OpenAI as your chat provider',
      image: 'DALL-E 3',
    },
    description: 'Best all-round cloud option: transcription, speech, and image generation (DALL-E 3). Vision works via active chat provider.',
    docsUrl: 'https://platform.openai.com/docs',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    secretKey: 'ELEVENLABS_API_KEY',
    capabilities: ['stt', 'tts'],
    implemented: { stt: true, tts: true },
    models: {
      stt: 'Scribe v2',
      tts: 'Eleven v3 / Flash v2.5',
    },
    description: 'High-quality voices, voice cloning, and strong transcription.',
    docsUrl: 'https://elevenlabs.io/docs',
  },
  {
    id: 'fal',
    name: 'fal.ai',
    secretKey: 'FAL_KEY',
    capabilities: ['stt', 'tts', 'image'],
    implemented: { stt: true, tts: true, image: true },
    models: {
      stt: 'Whisper (fast cloud transcription)',
      tts: 'Kokoro (natural voices)',
      image: 'Flux Schnell (fast, high-quality)',
    },
    description: 'Fast media router for image generation (Flux), transcription, and TTS. Great value alternative to OpenAI.',
    docsUrl: 'https://fal.ai/docs',
  },
  {
    id: 'stability',
    name: 'Stability AI',
    secretKey: 'STABILITY_API_KEY',
    capabilities: ['image'],
    implemented: { image: true },
    models: {
      image: 'Stable Image Ultra',
    },
    description: 'Photorealistic image generation via Stability AI Ultra — best for detail and realism.',
    docsUrl: 'https://platform.stability.ai/docs',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    secretKey: 'GEMINI_API_KEY',
    capabilities: ['tts', 'vision'],
    implemented: { tts: true, vision: false },
    models: {
      tts: 'Gemini 2.5 Flash TTS (30 voices)',
      vision: 'Routes through active LLM — set Gemini as your chat provider',
    },
    description: 'Natural TTS with 30 expressive voices. Vision works via active Gemini chat provider.',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
  },
];

const providersForCapability = (capability) => (
  PROVIDERS.filter(provider => provider.capabilities.includes(capability))
);

const CapabilityProvidersSection = ({ capability }) => {
  const providers = useMemo(() => providersForCapability(capability), [capability]);
  const activeKey = ACTIVE_KEYS[capability];
  const [config, setConfig] = useState({});
  const [secrets, setSecrets] = useState({});
  const [keyValues, setKeyValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const activeProvider = config[activeKey] || 'local';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, secretRes] = await Promise.all([
        configApi.getConfig(),
        configApi.getSecrets(),
      ]);
      setConfig(cfg.config || {});
      setSecrets(secretRes.secrets || {});
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load provider settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveKey = async (provider) => {
    const value = keyValues[provider.secretKey]?.trim();
    if (!provider.secretKey || !value) return;
    setSaving(`key:${provider.id}`);
    setError('');
    setMessage('');
    try {
      await configApi.updateSecret(provider.secretKey, value);
      setKeyValues(prev => ({ ...prev, [provider.secretKey]: '' }));
      setMessage(`${provider.name} key saved.`);
      await load();
    } catch (err) {
      setError(err.message || `Failed to save ${provider.name} key.`);
    } finally {
      setSaving('');
    }
  };

  const activate = async (provider) => {
    if (!activeKey) return;
    setSaving(`active:${provider.id}`);
    setError('');
    setMessage('');
    try {
      await configApi.updateConfig(activeKey, provider.id, false);
      setConfig(prev => ({ ...prev, [activeKey]: provider.id }));
      setMessage(`${provider.name} selected for ${CAPABILITY_LABELS[capability]}.`);
    } catch (err) {
      setError(err.message || `Failed to select ${provider.name}.`);
    } finally {
      setSaving('');
    }
  };

  return (
    <Panel className="p-5">
      <SectionHeader
        title={`${CAPABILITY_LABELS[capability] || 'Capability'} Providers`}
        description="Local runs first. Add API keys when you want cloud fallback or hosted specialist models."
        action={
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800">
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {capability === 'vision' && (
        <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
          {VISION_ROUTING_NOTE}
        </p>
      )}

      {(message || error) && (
        <p className={`mt-3 text-xs ${error ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
          {error || message}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {providers.map(provider => {
          const isImplemented = provider.implemented?.[capability] !== false;
          const isActive = activeProvider === provider.id;
          const hasKey = !provider.secretKey || Boolean(secrets[provider.secretKey]);
          const busy = saving.endsWith(`:${provider.id}`);
          return (
            <div key={provider.id} className={`rounded-xl border bg-white p-4 transition-colors dark:bg-gray-900 midnight:bg-slate-950 ${
              !isImplemented
                ? 'opacity-60 border-gray-100 dark:border-gray-800 midnight:border-slate-800'
                : isActive
                ? 'border-gray-300 dark:border-gray-600 midnight:border-slate-600'
                : 'border-gray-100 dark:border-gray-800 midnight:border-slate-800'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{provider.name}</h3>
                    {isActive && isImplemented && <Badge color="green">Selected</Badge>}
                    {!isImplemented
                      ? <Badge color="gray"><Construction className="inline h-2.5 w-2.5 mr-0.5" />Coming soon</Badge>
                      : hasKey
                        ? <Badge color="gray">{provider.secretKey ? 'Key ready' : 'Local'}</Badge>
                        : <Badge color="amber">Key needed</Badge>
                    }
                  </div>
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{provider.description}</p>
                  <p className="mt-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    {provider.models[capability]}
                  </p>
                </div>
                {provider.docsUrl && (
                  <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200" title="Provider docs">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>

              {isImplemented && provider.secretKey && (
                <div className="mt-3 flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="password"
                      value={keyValues[provider.secretKey] || ''}
                      onChange={(e) => setKeyValues(prev => ({ ...prev, [provider.secretKey]: e.target.value }))}
                      placeholder={hasKey ? `Replace ${provider.secretKey}` : provider.secretKey}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-300 focus:ring-1 focus:ring-gray-300 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100 dark:focus:border-gray-600"
                    />
                  </div>
                  <button
                    onClick={() => saveKey(provider)}
                    disabled={!keyValues[provider.secretKey]?.trim() || busy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {saving === `key:${provider.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                    Save
                  </button>
                </div>
              )}

              <button
                onClick={() => activate(provider)}
                disabled={!isImplemented || isActive || !hasKey || busy}
                title={!isImplemented ? 'Not yet available — coming soon' : undefined}
                className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
                  !isImplemented
                    ? 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed'
                    : isActive
                    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                    : 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200'
                }`}
              >
                {saving === `active:${provider.id}` ? <Loader2 className="h-4 w-4 animate-spin" />
                  : !isImplemented ? <Construction className="h-4 w-4" />
                  : isActive ? <CheckCircle2 className="h-4 w-4" />
                  : <Zap className="h-4 w-4" />}
                {!isImplemented ? 'Coming soon' : isActive ? 'Selected' : 'Use for this capability'}
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

export default CapabilityProvidersSection;
