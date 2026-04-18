import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu, Zap, CheckCircle, RefreshCw, Server, Play, Square,
  MemoryStick, Thermometer, Activity, Info
} from 'lucide-react';
import { llamaServerApi, localModelsApi, aiProviderApi } from './settingApi.js';

const Badge = ({ children, color = 'gray' }) => {
  const colors = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    blue:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    gray:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    red:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
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

const STATUS_META = {
  idle:    { label: 'No model loaded', color: 'gray'  },
  loading: { label: 'Loading model…',  color: 'amber' },
  ready:   { label: 'Ready',           color: 'green' },
  error:   { label: 'Error',           color: 'red'   },
};

const AiProviderSection = () => {
  const [serverStatus, setServerStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const pollCleanup = useRef(null);

  useEffect(() => {
    loadStatus();
    loadModelList();
    return () => pollCleanup.current?.();
  }, []);

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const snap = await llamaServerApi.getStatus();
      setServerStatus(snap);
      if (snap.model) setSelectedModel(snap.model);
    } catch (err) {
      console.warn('Failed to load server status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadModelList = async () => {
    setLoadingModels(true);
    try {
      const res = await localModelsApi.listModels();
      setModels(res.models || []);
    } catch (err) {
      console.warn('Failed to load models:', err);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleStart = async () => {
    if (!selectedModel) return;
    setStarting(true);
    try {
      await llamaServerApi.start(selectedModel);
      setServerStatus(prev => ({ ...prev, status: 'loading', model: selectedModel }));
      pollCleanup.current?.();
      pollCleanup.current = llamaServerApi.pollStatus(
        (snap) => setServerStatus(snap),
        (snap) => { setServerStatus(snap); setStarting(false); pollCleanup.current = null; },
        (snap) => { setServerStatus(snap); setStarting(false); pollCleanup.current = null; },
      );
    } catch (err) {
      setServerStatus(prev => ({ ...prev, status: 'error', error: err.message }));
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    pollCleanup.current?.();
    pollCleanup.current = null;
    try {
      await llamaServerApi.stop();
      setServerStatus({ status: 'idle', model: null });
    } catch (err) {
      console.error('Failed to stop server:', err);
    } finally {
      setStopping(false);
    }
  };

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

  const status = serverStatus?.status ?? 'idle';
  const { label: statusLabel, color: statusColor } = STATUS_META[status] || STATUS_META.idle;
  const isRunning = status === 'ready' || status === 'loading';

  const bannerClass = {
    ready:   'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    loading: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    error:   'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    idle:    'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
  }[status] ?? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700';

  const iconClass = {
    ready:   'text-green-600 dark:text-green-400',
    loading: 'text-amber-600 dark:text-amber-400 animate-pulse',
    error:   'text-red-500',
    idle:    'text-gray-400',
  }[status] ?? 'text-gray-400';

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Server status banner ── */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${bannerClass}`}>
        <Server className={`w-5 h-5 flex-shrink-0 ${iconClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Built-in AI Server</span>
            <Badge color={statusColor}>{statusLabel}</Badge>
          </div>
          {serverStatus?.model && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{serverStatus.model}</p>
          )}
          {serverStatus?.error && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{serverStatus.error}</p>
          )}
        </div>
        {loadingStatus && <RefreshCw className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />}
      </div>

      {/* ── Model selector ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Select Model</label>
          <button
            onClick={loadModelList}
            disabled={loadingModels}
            className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loadingModels ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loadingModels ? (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading models…
          </div>
        ) : models.length === 0 ? (
          <div className="flex items-center gap-2 p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400">
            <Info className="w-4 h-4 flex-shrink-0" />
            No models downloaded yet. Go to the Models tab to download one.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {models.map(m => (
              <button
                key={m.filename}
                onClick={() => setSelectedModel(m.filename)}
                disabled={isRunning}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left text-sm transition-all
                  ${selectedModel === m.filename
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  } disabled:opacity-40`}
              >
                <span className="font-medium truncate">{m.name || m.filename}</span>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {m.sizeFormatted && <span className="text-xs text-gray-400">{m.sizeFormatted}</span>}
                  {selectedModel === m.filename && <CheckCircle className="w-4 h-4 text-indigo-500" />}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Load / Unload controls ── */}
      <div className="flex items-center gap-3">
        {!isRunning ? (
          <button
            onClick={handleStart}
            disabled={starting || !selectedModel}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {starting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {starting ? 'Starting…' : 'Load model'}
          </button>
        ) : (
          <button
            onClick={handleStop}
            disabled={stopping || status === 'loading'}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {stopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            {stopping ? 'Stopping…' : 'Unload model'}
          </button>
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
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loadingStats ? 'animate-spin' : ''}`} />
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
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{gpu.name}</span>
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
                      <GpuBar used={gpu.vramUsedGb} total={gpu.vramTotalGb} label="VRAM" />
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
        <p>
          Download GGUF models from the <strong>Models</strong> tab, then select one above and click <strong>Load model</strong> to start the built-in AI server.
        </p>
      </div>

    </div>
  );
};

export default AiProviderSection;
