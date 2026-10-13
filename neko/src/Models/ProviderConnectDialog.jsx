import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, ExternalLink, RefreshCw, Terminal } from 'lucide-react';
import Dialog from '../components/ui/Dialog.jsx';
import Button from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Segmented } from '../components/ui/Tabs.jsx';
import { aiProviderApi } from '../Settings/settingApi.js';
import { ProviderLogo } from './modelLogos.jsx';
import ModelList from './ModelList.jsx';
import { settingsForModel } from './modelSettings.js';

const portOf = (url = '') => {
  try { return new URL(url).port; } catch { return ''; }
};

// Plain-language versions of the errors a model list request usually hits.
function explainModelError(message = '', { local, baseUrl }) {
  const text = String(message);
  if (/connection error|ECONNREFUSED|fetch failed|ENOTFOUND|timed out/i.test(text)) {
    return local
      ? `Nothing answered at ${baseUrl}. Start the server, or check the address and port.`
      : `Couldn't reach ${baseUrl}. Check your internet connection and the address.`;
  }
  if (/401|403|unauthori[sz]ed|invalid.*key|incorrect api key|authentication/i.test(text)) {
    return 'The provider rejected this API key. Check it and try again.';
  }
  return text || 'The provider did not return a model list. You can still type a model name.';
}

/**
 * Connect a provider, or edit a saved profile. The model is picked from the
 * provider's own list (fetched before saving), or typed by hand.
 *
 * entry   — a directory entry from providerDirectory.buildDirectory (new connection)
 * profile — a saved profile (editing)
 */
export default function ProviderConnectDialog({ entry = null, profile = null, catalog, saving = false, error = '', onClose, onSave }) {
  const presetFor = useCallback((id) => catalog.find((item) => item.providerId === id || item.id === id) || null, [catalog]);
  const variants = entry?.presets || [];
  const initialPreset = profile ? presetFor(profile.provider_id) : variants[0]?.preset || null;

  const [providerId, setProviderId] = useState(profile?.provider_id || initialPreset?.providerId || 'custom');
  const preset = presetFor(providerId) || initialPreset || {};
  const isRuntime = Boolean(preset.runtime);
  const isLocal = Boolean(preset.local) && !isRuntime;
  const isAzure = providerId === 'azure';
  const needsKey = !isLocal && !isRuntime;

  const [name, setName] = useState(profile?.name || '');
  const [baseUrl, setBaseUrl] = useState(profile?.base_url || preset.baseUrl || '');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(profile?.model || '');
  const [settings, setSettings] = useState(profile?.settings || preset.settings || {});
  const [supportsTools, setSupportsTools] = useState(profile ? Boolean(profile.supports_tools) : Boolean(preset.supportsTools));
  const [showAdvanced, setShowAdvanced] = useState(Boolean(profile) || !preset.baseUrl || providerId === 'custom');
  const [models, setModels] = useState([]);
  const [modelsState, setModelsState] = useState('idle'); // idle | loading | done | error
  const [modelsError, setModelsError] = useState('');
  const requestRef = useRef(0);

  // Switching variant (e.g. vLLM → Jan) resets the address and model to that preset's defaults.
  const chooseVariant = (nextId) => {
    const next = presetFor(nextId);
    setProviderId(nextId);
    setBaseUrl(next?.baseUrl || '');
    setModel(next?.model || '');
    setSettings(next?.settings || {});
    setSupportsTools(Boolean(next?.supportsTools));
    setModels([]);
    setModelsState('idle');
    setModelsError('');
  };

  const loadModels = useCallback(async () => {
    const requestId = ++requestRef.current;
    setModelsState('loading');
    setModelsError('');
    try {
      const draft = { provider_id: providerId, base_url: baseUrl, settings };
      if (apiKey) draft.api_key = apiKey;
      if (profile?.id) draft.profileId = profile.id;
      const res = await aiProviderApi.previewProviderModels(draft);
      if (requestId !== requestRef.current) return;
      const list = res.models || [];
      setModels(list);
      setModelsState('done');
      // Nothing chosen yet (or a stale preset default): take the provider's first model.
      if (list.length && (!model || !list.some((item) => (item.id || item.name) === model)) && !profile) {
        const first = list.find((item) => (item.id || item.name) === preset.model) || list[0];
        setModel(first.id || first.name);
        setSettings((current) => settingsForModel(first, current));
      }
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setModels([]);
      setModelsState('error');
      setModelsError(explainModelError(err.message, { local: isLocal, baseUrl }));
    }
    // model is read once per request on purpose; re-fetching on every pick would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, baseUrl, isLocal, preset.model, profile, providerId, settings]);

  // Local servers and runtimes need no key, so their model list loads straight away;
  // so does an edited profile, which already has its key saved.
  useEffect(() => {
    if ((isLocal || isRuntime || profile) && baseUrl) loadModels();
    // Only on open and when the variant changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  const submit = (event) => {
    event.preventDefault();
    if (!model.trim() && !preset.model) return;
    const payload = {
      name: name.trim() || (entry && variants.length > 1 ? `${entry.name} (${variants.find((v) => v.preset.providerId === providerId)?.label})` : entry?.name || preset.name || 'Provider'),
      provider_id: providerId,
      base_url: baseUrl,
      model: model.trim() || preset.model || '',
      supports_tools: supportsTools,
      settings,
    };
    if (!profile || apiKey) payload.api_key = apiKey;
    onSave(payload);
  };

  const displayName = entry?.name || preset.name || 'provider';
  const title = profile ? `Edit ${profile.name}` : isRuntime ? `Use ${displayName}` : `Connect ${displayName}`;
  const canSave = Boolean(model.trim() || preset.model);
  const setupNotes = Array.isArray(preset.setup) ? preset.setup : [];

  return (
    <Dialog
      as="form"
      onSubmit={submit}
      size="md"
      title={title}
      description={entry?.description || preset.description}
      icon={<ProviderLogo providerId={entry?.logoId || providerId} name={entry?.name || preset.name} size="md" />}
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!canSave}>
            {profile ? 'Save changes' : isRuntime ? `Use ${displayName}` : 'Connect'}
          </Button>
        </>
      )}
    >
      <div className="space-y-5">
        {error ? (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] leading-5 text-red-700 dark:text-red-400">{error}</p>
        ) : null}
        {variants.length > 1 ? (
          <Field label={entry.variantLabel || 'Variant'}>
            {variants.length <= 3 ? (
              <Segmented
                value={providerId}
                onChange={chooseVariant}
                items={variants.map(({ preset: item, label }) => ({ value: item.providerId, label }))}
              />
            ) : (
              <Select value={providerId} onChange={(event) => chooseVariant(event.target.value)}>
                {variants.map(({ preset: item, label }) => <option key={item.providerId} value={item.providerId}>{label}</option>)}
              </Select>
            )}
          </Field>
        ) : null}

        {isRuntime ? (
          <div className="flex gap-3 rounded-xl border border-line bg-canvas p-3.5">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
            <ul className="space-y-1 text-[13px] leading-5 text-fg-muted">
              {setupNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        ) : null}

        {needsKey ? (
          <Field
            label="API key"
            htmlFor="provider-api-key"
            hint={profile?.api_key_set ? 'A key is saved. Leave this empty to keep it.' : 'Stored on this computer only.'}
            action={preset.docsUrl ? (
              <a href={preset.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
                Get a key <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          >
            <div className="flex gap-2">
              <Input
                id="provider-api-key"
                type="password"
                value={apiKey}
                autoComplete="off"
                onChange={(event) => setApiKey(event.target.value)}
                onBlur={() => { if (apiKey && modelsState !== 'loading') loadModels(); }}
                placeholder={profile?.api_key_set ? '••••••••••••' : 'Paste your API key'}
              />
              <Button onClick={loadModels} loading={modelsState === 'loading'} disabled={!apiKey && !profile?.api_key_set}>
                Check
              </Button>
            </div>
          </Field>
        ) : null}

        {isLocal ? (
          <Field
            label="Server address"
            htmlFor="provider-base-url"
            hint={preset.baseUrl ? `${preset.name} usually listens on port ${portOf(preset.baseUrl) || 'its default port'}.` : 'The address of an OpenAI-compatible server, ending in /v1.'}
          >
            <div className="flex gap-2">
              <Input
                id="provider-base-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="http://localhost:8000/v1"
                className="font-mono"
              />
              <Button icon={RefreshCw} onClick={loadModels} loading={modelsState === 'loading'} disabled={!baseUrl}>
                Detect
              </Button>
            </div>
          </Field>
        ) : null}

        <Field
          label="Model"
          error={modelsState === 'error' ? modelsError : ''}
          hint={modelsState === 'idle' && needsKey ? 'Add your key to see the models this provider offers.' : ''}
        >
          {models.length ? (
            <ModelList
              models={models}
              value={model}
              onSelect={(picked) => {
                setModel(picked.id || picked.name);
                setSettings((current) => settingsForModel(picked, current));
              }}
            />
          ) : modelsState === 'loading' ? (
            <ModelList models={[]} loading onSelect={() => {}} />
          ) : (
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={preset.model || 'model-name'}
              className="font-mono"
            />
          )}
        </Field>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((open) => !open)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-fg-muted outline-none hover:text-fg focus-visible:underline"
            aria-expanded={showAdvanced}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? '' : '-rotate-90'}`} />
            Advanced
          </button>
          {showAdvanced ? (
            <div className="mt-3 grid gap-4 rounded-xl border border-line p-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="provider-name" className="sm:col-span-2">
                <Input id="provider-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={entry?.name || preset.name || 'My provider'} />
              </Field>
              {!isLocal && !isRuntime ? (
                <Field label="Base URL" htmlFor="provider-url" className="sm:col-span-2">
                  <Input id="provider-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={preset.baseUrl || 'https://api.example.com/v1'} className="font-mono" />
                </Field>
              ) : null}
              {models.length ? (
                <Field label="Model id" htmlFor="provider-model" className="sm:col-span-2" hint="Type a model the list doesn't show.">
                  <Input id="provider-model" value={model} onChange={(event) => setModel(event.target.value)} className="font-mono" />
                </Field>
              ) : null}
              {isAzure ? (
                <>
                  <Field label="API version" htmlFor="azure-version">
                    <Input id="azure-version" value={settings.apiVersion || '2024-10-21'} onChange={(event) => setSettings((current) => ({ ...current, apiVersion: event.target.value }))} />
                  </Field>
                  <Field label="Deployment" htmlFor="azure-deployment" hint="Defaults to the model name.">
                    <Input id="azure-deployment" value={settings.deployment || ''} onChange={(event) => setSettings((current) => ({ ...current, deployment: event.target.value }))} />
                  </Field>
                </>
              ) : null}
              {!isRuntime ? (
                <label className="flex items-start gap-2.5 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={supportsTools}
                    onChange={(event) => setSupportsTools(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line-strong accent-[var(--as-accent)]"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-fg">Native tool calling</span>
                    <span className="block text-[12px] leading-5 text-fg-subtle">Let agents call tools through the provider&apos;s own function calling. Turn off if the model doesn&apos;t support it.</span>
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

ProviderConnectDialog.propTypes = {
  entry: PropTypes.object,
  profile: PropTypes.object,
  catalog: PropTypes.arrayOf(PropTypes.object).isRequired,
  saving: PropTypes.bool,
  error: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};
