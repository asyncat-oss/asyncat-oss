import { useState, useEffect } from 'react';
import { RefreshCw, Cloud, KeyRound, CheckCircle2, X, Plus, Save, Link2, Search, Zap, Sparkles, TriangleAlert } from 'lucide-react';
import { aiProviderApi } from '../Settings/settingApi.js';
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';
import { Badge, providerLabel } from './modelPageShared.jsx';

const ProviderProfileModal = ({ catalog, profile, preset, onClose, onSave, saving }) => {
  const seed = profile || preset || {};
  const [form, setForm] = useState({
    name: seed.name || '',
    provider_id: seed.provider_id || seed.providerId || seed.id || 'custom',
    base_url: seed.base_url || seed.baseUrl || '',
    model: seed.model || '',
    api_key: '',
    supports_tools: seed.supports_tools ?? seed.supportsTools ?? true,
    settings: seed.settings || {},
  });
  const [apiKeyTouched, setApiKeyTouched] = useState(false);

  const selectedPreset = catalog.find(item => item.providerId === form.provider_id || item.id === form.provider_id);
  const isAzure = form.provider_id === 'azure';
  const isLocalManaged = form.provider_id === 'llamacpp-builtin';
  const requiresKey = selectedPreset?.requiresApiKey;

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const updateSetting = (key, value) => setForm(prev => ({ ...prev, settings: { ...(prev.settings || {}), [key]: value } }));

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      provider_id: form.provider_id,
      base_url: form.base_url,
      model: form.model,
      supports_tools: Boolean(form.supports_tools),
      settings: form.settings || {},
    };
    if (!profile || apiKeyTouched) payload.api_key = form.api_key;
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">{profile ? 'Edit Provider' : 'Connect Provider'}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{selectedPreset?.description || 'Configure an OpenAI-compatible endpoint.'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Provider
            <select
              value={form.provider_id}
              onChange={(e) => {
                const next = catalog.find(item => item.providerId === e.target.value || item.id === e.target.value);
                setForm(prev => ({
                  ...prev,
                  provider_id: e.target.value,
                  name: prev.name || next?.name || '',
                  base_url: next?.baseUrl || prev.base_url,
                  model: next?.model || prev.model,
                  supports_tools: next?.supportsTools ?? prev.supports_tools,
                  settings: next?.settings || prev.settings || {},
                }));
              }}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
            >
              {catalog.filter(item => !item.managed).map(item => (
                <option key={item.id} value={item.providerId}>{item.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Name
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
              placeholder={selectedPreset?.name || 'Provider name'}
            />
          </label>

          <label className="md:col-span-2 text-xs font-medium text-gray-600 dark:text-gray-300">
            Base URL
            <input
              value={form.base_url}
              onChange={(e) => update('base_url', e.target.value)}
              disabled={isLocalManaged}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none disabled:opacity-60"
              placeholder={selectedPreset?.baseUrl || 'https://.../v1'}
            />
          </label>

          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Model
            <input
              value={form.model}
              onChange={(e) => update('model', e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
              placeholder={selectedPreset?.model || 'model-id'}
            />
          </label>

          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            API Key {profile?.api_key_set && !apiKeyTouched ? <span className="text-gray-400">(saved)</span> : null}
            <input
              value={form.api_key}
              onChange={(e) => { setApiKeyTouched(true); update('api_key', e.target.value); }}
              type="password"
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
              placeholder={requiresKey ? 'Required' : 'Optional'}
            />
          </label>

          {isAzure && (
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              API Version
              <input
                value={form.settings?.apiVersion || '2024-10-21'}
                onChange={(e) => updateSetting('apiVersion', e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
              />
            </label>
          )}

          <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={Boolean(form.supports_tools)}
              onChange={(e) => update('supports_tools', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Enable native tool calling for chat and agents
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-5 py-4">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

const LocalProviderCard = ({ name, running, baseUrl, models, onUse, onDismiss, providerAction }) => {
  const hasModels = models && models.length > 0;
  return (
    <div className="rounded-3xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-green-900 dark:text-green-100">{name} Detected</h3>
              {running && <Badge color="green">Running</Badge>}
            </div>
            <p className="mt-1 text-xs text-green-700 dark:text-green-300 break-all">{baseUrl}</p>
            {hasModels && (
              <div className="mt-2 flex flex-wrap gap-1">
                {models.slice(0, 5).map(m => (
                  <span key={m} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">{m}</span>
                ))}
                {models.length > 5 && <span className="text-xs text-green-600 dark:text-green-400">+{models.length - 5} more</span>}
              </div>
            )}
          </div>
        </div>
        <button onClick={onDismiss} className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-800 rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onUse}
          disabled={Boolean(providerAction)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          Use {name}
        </button>
        {hasModels && (
          <span className="flex items-center text-xs text-green-700 dark:text-green-300 py-2">
            {models.length} model{models.length !== 1 ? 's' : ''} available
          </span>
        )}
      </div>
    </div>
  );
};

const LocalSwitchPrompt = ({ profile, serverStatus, onChoose, onClose, busy }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Local model is still loaded</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Switch to {profile?.name || 'this provider'} and choose whether to keep {serverStatus?.model || 'the local model'} in memory.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <button disabled={busy} onClick={() => onChoose(true)} className="flex-1 px-3 py-2 text-sm font-medium rounded-xl bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 disabled:opacity-50">Stop local server</button>
        <button disabled={busy} onClick={() => onChoose(false)} className="flex-1 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">Keep it running</button>
        <button disabled={busy} onClick={onClose} className="px-3 py-2 text-sm font-medium rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
      </div>
    </div>
  </div>
);

const RemoteModelPickerModal = ({
  profile,
  models,
  loading,
  onClose,
  onRefresh,
  onSelect,
  onSelectAndActivate,
}) => {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? models.filter(model => String(model.id || model.name || '').toLowerCase().includes(normalized))
    : models;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Choose Remote Model</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{profile?.name} · {profile?.base_url}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
                autoFocus
              />
            </label>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="mt-4 max-h-[420px] overflow-y-auto rounded-2xl border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading models...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No models matched.</div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800">
                {filtered.map(model => {
                  const modelId = model.id || model.name;
                  const isCurrent = profile?.model === modelId;
                  return (
                    <div key={modelId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{modelId}</p>
                          {isCurrent && <Badge color="green">Current</Badge>}
                        </div>
                        {model.owned_by && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{model.owned_by}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => onSelect(modelId)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                        >
                          Set Model
                        </button>
                        <button
                          onClick={() => onSelectAndActivate(modelId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Set + Activate
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ProvidersSection = ({
  catalog,
  profiles,
  activeConfig,
  serverStatus,
  loading,
  providerAction,
  providerError,
  onRefresh,
  onSave,
  onDelete,
  onTest,
  onActivate,
  onLoadModels,
}) => {
  const network = useNetworkStatus();
  const [modalState, setModalState] = useState(null);
  const [pendingActivate, setPendingActivate] = useState(null);
  const [ollamaInfo, setOllamaInfo] = useState(null); // { found, running, models, baseUrl }
  const [lmStudioInfo, setLmStudioInfo] = useState(null); // { found, running, models, baseUrl }
  const [checkingLocal, setCheckingLocal] = useState(false);
  const [modelLists, setModelLists] = useState({});
  const [modelLoading, setModelLoading] = useState(null);
  const [modelPickerProfile, setModelPickerProfile] = useState(null);

  // Auto-detect Ollama and LM Studio on mount
  useEffect(() => {
    if (checkingLocal) return;
    setCheckingLocal(true);

    Promise.all([
      aiProviderApi.checkOllama(),
      aiProviderApi.checkLMStudio(),
    ])
      .then(([ollamaRes, lmStudioRes]) => {
        if (ollamaRes.success && ollamaRes.found && ollamaRes.running) {
          setOllamaInfo({ found: true, running: true, models: ollamaRes.models || [], baseUrl: ollamaRes.baseUrl });
        }
        if (lmStudioRes.success && lmStudioRes.found && lmStudioRes.running) {
          setLmStudioInfo({ found: true, running: true, models: lmStudioRes.models || [], baseUrl: lmStudioRes.baseUrl });
        }
      })
      .catch(() => {})
      .finally(() => setCheckingLocal(false));
  }, []);

  const activeProfileId = activeConfig?.profile_id;
  const cloudPresets = catalog.filter(item => !item.managed);
  const localServerRunning = serverStatus?.status === 'ready' || serverStatus?.status === 'loading';

  const handleUseLocalProvider = async (providerId, info) => {
    if (!info?.found) return;
    const model = info.models[0] || (providerId === 'ollama' ? 'llama3.2' : 'local-model');
    const payload = {
      name: providerId === 'ollama' ? 'Ollama Auto' : 'LM Studio Auto',
      provider_id: providerId,
      provider_type: 'local',
      base_url: info.baseUrl,
      model,
      supports_tools: false,
      settings: {},
    };
    await onSave(null, payload);
    if (providerId === 'ollama') setOllamaInfo(null);
    else setLmStudioInfo(null);
  };

  const activate = (profile) => {
    if (profile.provider_id !== 'llamacpp-builtin' && profile.provider_type !== 'local' && localServerRunning) {
      setPendingActivate(profile);
      return;
    }
    onActivate(profile.id, false);
  };

  const fetchModels = async (profile, openPicker = false) => {
    setModelLoading(profile.id);
    try {
      const models = await onLoadModels(profile.id);
      setModelLists(prev => ({ ...prev, [profile.id]: models }));
      if (openPicker) setModelPickerProfile(profile);
    } finally {
      setModelLoading(null);
    }
  };

  const openModelPicker = (profile) => {
    if (modelLists[profile.id]) {
      setModelPickerProfile(profile);
      return;
    }
    fetchModels(profile, true);
  };

  return (
    <div className="space-y-6">
      {providerError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
          <TriangleAlert className="w-4 h-4 flex-shrink-0" />
          {providerError}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Provider Profiles</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Activate one profile to route chat and agents through it.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge color={network.fullyOnline ? 'green' : 'red'}>{network.fullyOnline ? 'Online' : 'Offline'}</Badge>
            <button onClick={onRefresh} disabled={loading} className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
        {network.needsNetworkMessage && (
          <p className="mb-3 text-xs text-red-600 dark:text-red-400">{network.needsNetworkMessage}</p>
        )}

        {loading ? (
          <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ) : profiles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 p-8 text-center">
            <Cloud className="w-7 h-7 text-gray-300 dark:text-gray-600 mx-auto" />
            <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">No provider profiles yet</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Add a provider below when you want cloud or OpenAI-compatible local routing.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {profiles.map(profile => {
              const isActive = activeProfileId === profile.id;
              const busy = providerAction === profile.id;
              return (
                <div key={profile.id} className={`rounded-3xl border bg-white dark:bg-gray-900 midnight:bg-slate-950 p-5 shadow-sm ${isActive ? 'border-green-400 dark:border-green-500' : 'border-gray-200 dark:border-gray-700 midnight:border-slate-800'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{profile.name}</h3>
                        {isActive && <Badge color="green">Active</Badge>}
                        {profile.api_key_set && <Badge color="gray">Key saved</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{providerLabel(profile, catalog)} · {profile.model || 'No model selected'}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-all">{profile.base_url}</p>
                      {profile.last_test_message && (
                        <p className={`mt-2 text-xs ${profile.last_test_status === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{profile.last_test_message}</p>
                      )}
                    </div>
                    {isActive ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" /> : <Cloud className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => activate(profile)} disabled={busy || isActive} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 disabled:opacity-50">
                      {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      Activate
                    </button>
                    <button onClick={() => onTest(profile.id)} disabled={busy} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">Test</button>
                    <button onClick={() => openModelPicker(profile)} disabled={modelLoading === profile.id} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">
                      {modelLoading === profile.id ? 'Loading...' : 'Models'}
                    </button>
                    <button onClick={() => setModalState({ profile })} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">Edit</button>
                    <button onClick={() => onDelete(profile.id)} disabled={busy} className="px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/10 disabled:opacity-50">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detected Local Providers - Ollama & LM Studio */}
      {(ollamaInfo?.found || lmStudioInfo?.found) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Detected Local Providers</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ollamaInfo?.found && (
              <LocalProviderCard
                name="Ollama"
                found
                running={ollamaInfo.running}
                baseUrl={ollamaInfo.baseUrl}
                models={ollamaInfo.models}
                onUse={() => handleUseLocalProvider('ollama', ollamaInfo)}
                onDismiss={() => setOllamaInfo(null)}
                providerAction={providerAction}
              />
            )}
            {lmStudioInfo?.found && (
              <LocalProviderCard
                name="LM Studio"
                found
                running={lmStudioInfo.running}
                baseUrl={lmStudioInfo.baseUrl}
                models={lmStudioInfo.models}
                onUse={() => handleUseLocalProvider('lmstudio', lmStudioInfo)}
                onDismiss={() => setLmStudioInfo(null)}
                providerAction={providerAction}
              />
            )}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Provider</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Connect cloud APIs, Ollama, LM Studio, or any OpenAI-compatible endpoint.</p>
          </div>
          <button onClick={() => setModalState({ preset: catalog.find(item => item.id === 'custom') })} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
            <Plus className="w-4 h-4" />
            Custom
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {cloudPresets.map(item => (
            <button
              key={item.id}
              onClick={() => setModalState({ preset: item })}
              className="text-left rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 p-4 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{item.name}</div>
                {item.requiresApiKey ? <KeyRound className="w-4 h-4 text-gray-400" /> : <Link2 className="w-4 h-4 text-gray-400" />}
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{item.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge color={item.local ? 'gray' : 'blue'}>{item.local ? 'Local' : 'Cloud'}</Badge>
                {item.supportsTools && <Badge color="green">Tools</Badge>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {modalState && (
        <ProviderProfileModal
          catalog={catalog}
          profile={modalState.profile || null}
          preset={modalState.preset || null}
          saving={Boolean(providerAction)}
          onClose={() => setModalState(null)}
          onSave={async (payload) => {
            await onSave(modalState.profile?.id || null, payload);
            setModalState(null);
          }}
        />
      )}

      {modelPickerProfile && (
        <RemoteModelPickerModal
          profile={modelPickerProfile}
          models={modelLists[modelPickerProfile.id] || []}
          loading={modelLoading === modelPickerProfile.id}
          onClose={() => setModelPickerProfile(null)}
          onRefresh={() => fetchModels(modelPickerProfile, true)}
          onSelect={async (modelId) => {
            await onSave(modelPickerProfile.id, { model: modelId });
            setModelPickerProfile(prev => prev ? { ...prev, model: modelId } : prev);
          }}
          onSelectAndActivate={async (modelId) => {
            await onSave(modelPickerProfile.id, { model: modelId });
            const nextProfile = { ...modelPickerProfile, model: modelId };
            setModelPickerProfile(null);
            activate(nextProfile);
          }}
        />
      )}

      {pendingActivate && (
        <LocalSwitchPrompt
          profile={pendingActivate}
          serverStatus={serverStatus}
          busy={providerAction === pendingActivate.id}
          onClose={() => setPendingActivate(null)}
          onChoose={async (stopLocal) => {
            await onActivate(pendingActivate.id, stopLocal);
            setPendingActivate(null);
          }}
        />
      )}
    </div>
  );
};

export default ProvidersSection;
