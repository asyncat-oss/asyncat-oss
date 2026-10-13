import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound } from 'lucide-react';
import { configApi } from '../Settings/settingApi.js';
import Button from '../components/ui/Button.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { Badge } from './modelPageShared.jsx';
import { ProviderLogo } from './modelLogos.jsx';

const ACTIVE_KEYS = {
  stt: 'ASYNCAT_STT_PROVIDER',
  tts: 'ASYNCAT_TTS_PROVIDER',
  image: 'ASYNCAT_IMAGE_PROVIDER',
};

const CAPABILITY_LABELS = {
  stt: 'speech to text',
  tts: 'text to speech',
  image: 'image generation',
};

// implemented: which capabilities are actually wired in the backend.
const PROVIDERS = [
  {
    id: 'local',
    logoId: 'on-device',
    name: 'On this computer',
    secretKey: null,
    capabilities: ['stt', 'tts', 'image'],
    implemented: { stt: true, tts: true, image: true },
    models: {
      stt: 'whisper.cpp',
      tts: 'Piper',
      image: 'stable-diffusion.cpp / ComfyUI',
    },
    description: 'Free and private. Uses the models downloaded on this page.',
    docsUrl: '',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    secretKey: 'OPENAI_API_KEY',
    capabilities: ['stt', 'tts', 'image'],
    implemented: { stt: true, tts: true, image: true },
    models: {
      stt: 'gpt-4o-transcribe',
      tts: 'gpt-4o-mini-tts',
      image: 'DALL-E 3',
    },
    description: 'Best all-round cloud option: transcription, speech, and image generation (DALL-E 3).',
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
    capabilities: ['tts'],
    implemented: { tts: true },
    models: {
      tts: 'Gemini 2.5 Flash TTS (30 voices)',
    },
    description: 'Natural TTS with 30 expressive voices.',
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

  const [keyDialog, setKeyDialog] = useState(null);

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
      setKeyDialog(null);
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
      await configApi.updateConfig(activeKey, provider.id);
      setConfig(prev => ({ ...prev, [activeKey]: provider.id }));
      setMessage(`${provider.name} now handles ${CAPABILITY_LABELS[capability]}.`);
    } catch (err) {
      setError(err.message || `Failed to select ${provider.name}.`);
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="space-y-2">
      {(message || error) && (
        <p className={`text-[12px] ${error ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {error || message}
        </p>
      )}

      <div role="radiogroup" aria-label={`Provider for ${CAPABILITY_LABELS[capability]}`} className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {providers.map(provider => {
          const isImplemented = provider.implemented?.[capability] !== false;
          const isActive = activeProvider === provider.id;
          const hasKey = !provider.secretKey || Boolean(secrets[provider.secretKey]);
          const busy = saving === `active:${provider.id}`;
          return (
            <div key={provider.id} className={`flex items-center gap-3 px-3.5 py-3 ${isActive ? 'bg-accent-soft' : ''} ${isImplemented ? '' : 'opacity-60'}`}>
              <ProviderLogo providerId={provider.logoId || provider.id} name={provider.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-fg">{provider.name}</span>
                  {provider.secretKey ? (
                    hasKey ? <Badge color="gray">Key saved</Badge> : null
                  ) : <Badge color="green">Free</Badge>}
                  {provider.docsUrl ? (
                    <a href={provider.docsUrl} target="_blank" rel="noreferrer" aria-label={`${provider.name} docs`} className="text-fg-subtle hover:text-fg">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-fg-muted" title={provider.description}>{provider.models[capability]}</p>
              </div>
              {provider.secretKey && isImplemented ? (
                <Button size="xs" variant="ghost" icon={KeyRound} onClick={() => setKeyDialog(provider)}>
                  {hasKey ? 'Change key' : 'Add key'}
                </Button>
              ) : null}
              {isActive ? (
                <span role="radio" aria-checked="true" className="inline-flex h-7 items-center gap-1 px-2 text-[12px] font-medium text-accent">
                  <CheckCircle2 className="h-3.5 w-3.5" /> In use
                </span>
              ) : (
                <Button
                  size="xs"
                  variant="secondary"
                  role="radio"
                  aria-checked="false"
                  onClick={() => activate(provider)}
                  loading={busy}
                  disabled={!isImplemented || !hasKey || loading}
                  title={!hasKey ? 'Add a key first' : undefined}
                >
                  Use
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {keyDialog ? (
        <Dialog
          as="form"
          size="sm"
          title={`${keyDialog.name} API key`}
          description={`Used for ${keyDialog.capabilities.map((item) => CAPABILITY_LABELS[item]).join(', ')}. Stored on this computer only.`}
          icon={<ProviderLogo providerId={keyDialog.logoId || keyDialog.id} name={keyDialog.name} size="md" />}
          onClose={() => setKeyDialog(null)}
          onSubmit={(event) => { event.preventDefault(); saveKey(keyDialog); }}
          footer={(
            <>
              <Button variant="ghost" onClick={() => setKeyDialog(null)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={saving === `key:${keyDialog.id}`} disabled={!keyValues[keyDialog.secretKey]?.trim()}>Save key</Button>
            </>
          )}
        >
          <Field
            label="API key"
            htmlFor="capability-key"
            hint={secrets[keyDialog.secretKey] ? 'A key is already saved; this replaces it.' : null}
            action={keyDialog.docsUrl ? <a href={keyDialog.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">Get a key <ExternalLink className="h-3 w-3" /></a> : null}
          >
            <Input
              id="capability-key"
              type="password"
              autoComplete="off"
              value={keyValues[keyDialog.secretKey] || ''}
              onChange={(e) => setKeyValues(prev => ({ ...prev, [keyDialog.secretKey]: e.target.value }))}
              placeholder="Paste your API key"
            />
          </Field>
        </Dialog>
      ) : null}
    </div>
  );
};

export default CapabilityProvidersSection;
