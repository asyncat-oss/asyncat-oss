// AiProviderSection.jsx — AI Provider settings with local model support
import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu, Zap, CheckCircle, XCircle, RefreshCw, Search,
  ChevronDown, Server, Settings2, Wifi, WifiOff,
  MemoryStick, Thermometer, Activity, HardDrive, AlertCircle,
  RotateCcw, Save, TestTube2, Info
} from 'lucide-react';
import { aiProviderApi } from './settingApi.js';

// ── Small helpers ─────────────────────────────────────────────────────────────

const StatusDot = ({ ok, loading }) => {
  if (loading) return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />;
  return ok
    ? <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
    : <span className="inline-block w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />;
};

const Badge = ({ children, color = 'gray' }) => {
  const colors = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    blue:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    gray:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
};

const GpuBar = ({ used, total, label }) => {
  if (!total) return null;
  const pct = Math.min(100, Math.round((used / total) * 100));
  const color = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{label}</span>
        <span>{used} / {total} GB ({pct}%)</span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const AiProviderSection = () => {
  // Config state
  const [providerType, setProviderType] = useState('local'); // 'local' | 'cloud' | 'custom'
  const [selectedProviderId, setSelectedProviderId] = useState('ollama');
  const [cloudProviderId, setCloudProviderId] = useState('openai');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [selectedModel, setSelectedModel] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');

  // Detection state
  const [detecting, setDetecting] = useState(false);
  const [detectedProviders, setDetectedProviders] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, latencyMs, reply, error }

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // Hardware stats
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Current saved config (from server)
  const [savedConfig, setSavedConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const KNOWN_PROVIDERS = [
    { id: 'ollama',   name: 'Ollama',          icon: '🦙', defaultUrl: 'http://localhost:11434', description: 'Run Llama, Mistral, Gemma locally' },
    { id: 'lmstudio', name: 'LM Studio',        icon: '🖥️', defaultUrl: 'http://localhost:1234',  description: 'GUI app for local models' },
    { id: 'llamacpp', name: 'llama.cpp server', icon: '⚡', defaultUrl: 'http://localhost:8080',  description: 'llama.cpp HTTP server' },
  ];

  const CLOUD_PROVIDERS = [
    { id: 'openai',     name: 'OpenAI',      icon: '🟢', baseUrl: 'https://api.openai.com/v1',       models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
    { id: 'anthropic',  name: 'Anthropic',   icon: '🔷', baseUrl: 'https://api.anthropic.com/v1',    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
    { id: 'groq',       name: 'Groq',        icon: '⚡', baseUrl: 'https://api.groq.com/openai/v1',  models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
    { id: 'together',   name: 'Together AI', icon: '🤝', baseUrl: 'https://api.together.xyz/v1',     models: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'] },
    { id: 'mistral',    name: 'Mistral',     icon: '🌬️', baseUrl: 'https://api.mistral.ai/v1',      models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'] },
    { id: 'openrouter', name: 'OpenRouter',  icon: '🔀', baseUrl: 'https://openrouter.ai/api/v1',    models: [] },
  ];

  // ── Load saved config on mount ──────────────────────────────────────────────
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await aiProviderApi.getConfig();
      if (res.success && res.config) {
        const cfg = res.config;
        setSavedConfig(cfg);
        const pType = cfg.providerType || 'local';
        setProviderType(pType);
        if (pType === 'cloud') {
          const cp = CLOUD_PROVIDERS.find(p => p.id === cfg.providerId);
          setCloudProviderId(cfg.providerId || 'openai');
          setBaseUrl(cfg.baseUrl || cp?.baseUrl || 'https://api.openai.com/v1');
          setAvailableModels((cp?.models || []).map(m => ({ id: m, name: m })));
          setSelectedModel(cfg.model || '');
        } else if (pType === 'local') {
          setSelectedProviderId(cfg.providerId || 'ollama');
          setBaseUrl(cfg.baseUrl || 'http://localhost:11434');
          setSelectedModel(cfg.model || '');
        } else {
          setBaseUrl(cfg.baseUrl || '');
          setSelectedModel(cfg.model || '');
        }
      }
    } catch (err) {
      console.warn('Failed to load AI config:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  // ── Auto-detect providers ───────────────────────────────────────────────────
  const handleDetect = async () => {
    setDetecting(true);
    setTestResult(null);
    try {
      const res = await aiProviderApi.detectProviders();
      if (res.success) {
        setDetectedProviders(res.providers || []);
        // Auto-select first reachable provider
        const first = res.providers?.find(p => p.reachable);
        if (first) {
          setSelectedProviderId(first.id);
          setBaseUrl(first.baseUrl || first.defaultUrl);
          setAvailableModels(first.models || []);
          if (first.models?.length > 0 && !selectedModel) {
            setSelectedModel(first.models[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Detection failed:', err);
    } finally {
      setDetecting(false);
    }
  };

  // ── Load models for current URL ─────────────────────────────────────────────
  const handleLoadModels = useCallback(async (url) => {
    if (!url) return;
    setLoadingModels(true);
    setAvailableModels([]);
    try {
      const res = await aiProviderApi.listModels(url);
      if (res.success && res.models) {
        setAvailableModels(res.models);
        if (res.models.length > 0 && !selectedModel) {
          setSelectedModel(res.models[0].id);
        }
      }
    } catch (err) {
      console.warn('Failed to load models:', err);
    } finally {
      setLoadingModels(false);
    }
  }, [selectedModel]);

  // ── Test connection ─────────────────────────────────────────────────────────
  const handleTest = async () => {
    if (!baseUrl || !selectedModel) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await aiProviderApi.testConnection(baseUrl, selectedModel);
      setTestResult(res);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  // ── Save config ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!baseUrl || !selectedModel) {
      setSaveMessage({ type: 'error', text: 'Please select a model before saving.' });
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      await aiProviderApi.saveConfig({
        providerType,
        providerId: providerType === 'local' ? selectedProviderId
                  : providerType === 'cloud'  ? cloudProviderId
                  : null,
        baseUrl,
        model: selectedModel,
        apiKey: customApiKey || null,
      });
      setSaveMessage({ type: 'success', text: 'AI provider saved! Your next chat will use this model.' });
      await loadConfig();
    } catch (err) {
      setSaveMessage({ type: 'error', text: err.message || 'Failed to save.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  // ── Reset to defaults ───────────────────────────────────────────────────────
  const handleReset = async () => {
    setSaving(true);
    try {
      await aiProviderApi.resetConfig();
      setSaveMessage({ type: 'success', text: 'Reset to server defaults.' });
      await loadConfig();
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'Failed to reset.' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // ── Load hardware stats ─────────────────────────────────────────────────────
  const handleLoadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await aiProviderApi.getStats();
      if (res.success) setStats(res);
    } catch (err) {
      console.warn('Failed to load stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  // When provider type changes, update URL
  const handleProviderTypeChange = (type) => {
    setProviderType(type);
    setTestResult(null);
    setAvailableModels([]);
    setSelectedModel('');
    if (type === 'local') {
      const known = KNOWN_PROVIDERS.find(p => p.id === selectedProviderId);
      setBaseUrl(known?.defaultUrl || 'http://localhost:11434');
    } else if (type === 'cloud') {
      const cp = CLOUD_PROVIDERS.find(p => p.id === cloudProviderId);
      setBaseUrl(cp?.baseUrl || 'https://api.openai.com/v1');
      setAvailableModels((cp?.models || []).map(m => ({ id: m, name: m })));
      if (cp?.models?.length) setSelectedModel(cp.models[0]);
    }
  };

  const handleLocalProviderChange = (id) => {
    setSelectedProviderId(id);
    const known = KNOWN_PROVIDERS.find(p => p.id === id);
    if (known) setBaseUrl(known.defaultUrl);
    setAvailableModels([]);
    setSelectedModel('');
    setTestResult(null);
  };

  const handleCloudProviderChange = (id) => {
    setCloudProviderId(id);
    const cp = CLOUD_PROVIDERS.find(p => p.id === id);
    if (cp) {
      setBaseUrl(cp.baseUrl);
      setAvailableModels(cp.models.map(m => ({ id: m, name: m })));
      setSelectedModel(cp.models[0] || '');
    }
    setTestResult(null);
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const isLocalOrCustom = providerType === 'local' || providerType === 'custom' || providerType === 'cloud';
  const detectedProvider = detectedProviders.find(p => p.id === selectedProviderId);

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Current active config banner ── */}
      {savedConfig && !savedConfig.isDefault && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
          <span className="text-green-700 dark:text-green-300">
            Active: <strong>{savedConfig.model}</strong>
            {savedConfig.providerType === 'local' && <span className="ml-1 text-green-600 dark:text-green-400">(local)</span>}
          </span>
        </div>
      )}

      {/* ── Provider type selector ── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          AI Provider Type
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'local',  label: 'Local',  icon: <Server className="w-4 h-4" />,   desc: 'Ollama, LM Studio…' },
            { id: 'cloud',  label: 'Cloud',  icon: <Wifi className="w-4 h-4" />,      desc: 'OpenAI, Anthropic…' },
            { id: 'custom', label: 'Custom', icon: <Settings2 className="w-4 h-4" />, desc: 'Any compatible URL' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => handleProviderTypeChange(opt.id)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm transition-all
                ${providerType === opt.id
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
            >
              {opt.icon}
              <span className="font-medium">{opt.label}</span>
              <span className="text-xs opacity-70">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Local provider picker ── */}
      {providerType === 'local' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Local Provider
            </label>
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 disabled:opacity-50"
            >
              {detecting
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <Search className="w-3 h-3" />
              }
              {detecting ? 'Scanning…' : 'Auto-detect'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {KNOWN_PROVIDERS.map(p => {
              const detected = detectedProviders.find(d => d.id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => handleLocalProviderChange(p.id)}
                  className={`relative flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all
                    ${selectedProviderId === p.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                >
                  <div className="flex items-center gap-1.5 w-full">
                    <span className="text-base">{p.icon}</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.name}</span>
                    <div className="ml-auto">
                      <StatusDot ok={detected?.reachable} loading={detecting} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{p.description}</span>
                  {detected?.reachable && (
                    <Badge color="green">{detected.models?.length || 0} models</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Cloud provider picker ── */}
      {providerType === 'cloud' && (
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Cloud Provider
          </label>
          <div className="grid grid-cols-3 gap-2">
            {CLOUD_PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => handleCloudProviderChange(p.id)}
                className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all
                  ${cloudProviderId === p.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
              >
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-base">{p.icon}</span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Base URL ── */}
      {isLocalOrCustom && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Server URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={baseUrl}
              onChange={e => { setBaseUrl(e.target.value); setAvailableModels([]); setSelectedModel(''); }}
              placeholder="http://localhost:11434"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => handleLoadModels(baseUrl)}
              disabled={loadingModels || !baseUrl}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {loadingModels ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Load models
            </button>
          </div>
          {detectedProvider && (
            <p className="mt-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <Wifi className="w-3 h-3" /> Connected · {detectedProvider.latencyMs}ms
            </p>
          )}
        </div>
      )}

      {/* ── Model selector ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Model
          </label>
          {isLocalOrCustom && availableModels.length === 0 && (
            <button
              onClick={() => handleLoadModels(baseUrl)}
              disabled={loadingModels}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
            >
              {loadingModels ? 'Loading…' : 'Fetch models'}
            </button>
          )}
        </div>

        {availableModels.length > 0 ? (
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {availableModels.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm transition-all
                  ${selectedModel === m.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{m.name}</span>
                  {m.quantization && <Badge color="gray">{m.quantization}</Badge>}
                  {m.parameterSize && <Badge color="blue">{m.parameterSize}</Badge>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {m.size && <span className="text-xs text-gray-400">{m.size}</span>}
                  {selectedModel === m.id && <CheckCircle className="w-4 h-4 text-indigo-500" />}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <input
            type="text"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            placeholder="llama3.2:latest"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}
      </div>

      {/* ── API key (required for cloud, optional for custom) ── */}
      {(providerType === 'cloud' || providerType === 'custom') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            API Key{' '}
            <span className="text-gray-400 font-normal">
              {providerType === 'cloud' ? '(required)' : '(optional override)'}
            </span>
          </label>
          <input
            type="password"
            value={customApiKey}
            onChange={e => setCustomApiKey(e.target.value)}
            placeholder={savedConfig?.hasCustomApiKey ? '••••••••••••••••' : providerType === 'cloud' ? 'sk-...' : 'Leave blank to use server .env key'}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* ── Test connection ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTest}
          disabled={testing || !baseUrl || !selectedModel}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TestTube2 className="w-4 h-4" />}
          Test connection
        </button>

        {testResult && (
          <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {testResult.success
              ? <><CheckCircle className="w-4 h-4" /> Working · {testResult.latencyMs}ms</>
              : <><XCircle className="w-4 h-4" /> {testResult.error || 'Failed'}</>
            }
          </div>
        )}
      </div>

      {/* ── Save / Reset buttons ── */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={handleSave}
          disabled={saving || !selectedModel}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save provider
        </button>

        {savedConfig && !savedConfig.isDefault && (
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to defaults
          </button>
        )}

        {saveMessage && (
          <span className={`text-sm ${saveMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {saveMessage.text}
          </span>
        )}
      </div>

      {/* ── Hardware stats panel ── */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <button
          onClick={handleLoadStats}
          disabled={loadingStats}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <Activity className="w-4 h-4" />
            Hardware & Performance
          </div>
          {loadingStats
            ? <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
            : <RefreshCw className="w-4 h-4 text-gray-400" />
          }
        </button>

        {stats && (
          <div className="p-4 space-y-4">
            {/* CPU */}
            <div className="flex items-start gap-3">
              <Cpu className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {stats.hardware?.cpu?.model || 'CPU'}
                  </span>
                  <Badge color={stats.hardware?.cpu?.usagePercent > 80 ? 'amber' : 'gray'}>
                    {stats.hardware?.cpu?.usagePercent ?? '—'}% used
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {stats.hardware?.cpu?.cores} cores · {stats.hardware?.platform}
                </p>
              </div>
            </div>

            {/* RAM */}
            <div className="flex items-start gap-3">
              <MemoryStick className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">RAM</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {stats.hardware?.ram?.usedGb} / {stats.hardware?.ram?.totalGb} GB
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      (stats.hardware?.ram?.usagePercent || 0) > 85 ? 'bg-red-500' :
                      (stats.hardware?.ram?.usagePercent || 0) > 60 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${stats.hardware?.ram?.usagePercent || 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* GPU */}
            {stats.hardware?.gpu?.length > 0 ? (
              stats.hardware.gpu.map((gpu, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Zap className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {gpu.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge color="blue">{gpu.vendor}</Badge>
                        {gpu.temperatureC && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-0.5">
                            <Thermometer className="w-3 h-3" />{gpu.temperatureC}°C
                          </span>
                        )}
                      </div>
                    </div>
                    {gpu.vramTotalGb > 0 && (
                      <GpuBar
                        used={gpu.vramUsedGb}
                        total={gpu.vramTotalGb}
                        label="VRAM"
                      />
                    )}
                    {gpu.utilizationPercent !== undefined && (
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>GPU utilization</span>
                        <span>{gpu.utilizationPercent}%</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Info className="w-4 h-4" />
                No GPU detected — model will run on CPU
              </div>
            )}

            {/* Running models (Ollama) */}
            {stats.runningModels?.length > 0 && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Loaded in memory</p>
                <div className="space-y-1">
                  {stats.runningModels.map((m, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{m.name}</span>
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                        {m.sizeVram && <span>VRAM: {m.sizeVram}</span>}
                        {m.sizeRam && <span>RAM: {m.sizeRam}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Model hardware info */}
            {stats.modelHardwareInfo && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Active model</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{stats.modelHardwareInfo.name}</span>
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    {stats.modelHardwareInfo.gpuLayers && (
                      <span>{stats.modelHardwareInfo.gpuLayers} GPU layers</span>
                    )}
                    {stats.modelHardwareInfo.sizeVram && (
                      <span>VRAM: {stats.modelHardwareInfo.sizeVram}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!stats && !loadingStats && (
          <div className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
            Click refresh to load hardware stats
          </div>
        )}
      </div>

      {/* ── Info box ── */}
      <div className="flex gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p><strong>Local models need GGUF format.</strong> Install <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline">Ollama</a> and run <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">ollama pull llama3.2</code> to get started.</p>
          <p>LM Studio and llama.cpp server also work — just start the server and click Auto-detect.</p>
        </div>
      </div>

    </div>
  );
};

export default AiProviderSection;
