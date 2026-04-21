import React, { useState, useEffect, useRef } from 'react';
import { HardDrive, Server, RefreshCw, Play, Square, CheckCircle, Info, Trash2, Box, Cpu, Zap, Activity, Thermometer } from 'lucide-react';
import LocalModelsSection from './LocalModelsSection';
import { llamaServerApi, localModelsApi, aiProviderApi } from './settingApi.js';

const Badge = ({ children, color = 'gray' }) => {
  const colors = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 midnight:bg-green-900/30 midnight:text-green-400',
    gray:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 midnight:bg-gray-800 midnight:text-gray-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 midnight:bg-amber-900/30 midnight:text-amber-400',
    red:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 midnight:bg-red-900/30 midnight:text-red-400',
    blue:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 midnight:bg-blue-900/30 midnight:text-blue-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
};

const STATUS_META = {
  idle:    { label: 'No model loaded', color: 'gray'  },
  loading: { label: 'Loading model…',  color: 'amber' },
  ready:   { label: 'Ready',           color: 'green' },
  error:   { label: 'Error',           color: 'red'   },
};

const MiniBar = ({ value, color = 'bg-indigo-500', max = 100 }) => {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  const barColor = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : color;
  return (
    <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex-1">
      <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
};

const SystemInfoSection = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await aiProviderApi.getStats();
        if (res.success) setStats(res);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 8000);
    return () => clearInterval(interval);
  }, []);

  const cpu = stats?.hardware?.cpu;
  const ram = stats?.hardware?.ram;
  const gpu = stats?.hardware?.gpu?.[0];

  return (
    <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-200">System Resources</h3>
        {loading && <RefreshCw className="w-3 h-3 animate-spin text-gray-400 ml-auto" />}
      </div>

      {cpu && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <Cpu className="w-3.5 h-3.5" />
              <span className="truncate max-w-[120px]">{cpu.model?.split('@')[0]?.trim() || 'CPU'}</span>
            </div>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{cpu.usagePercent}%</span>
          </div>
          <MiniBar value={cpu.usagePercent} color="bg-blue-500" />
        </div>
      )}

      {ram && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">RAM</span>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {ram.usedGb}/{ram.totalGb} GB
            </span>
          </div>
          <MiniBar value={ram.usagePercent} color="bg-indigo-500" />
        </div>
      )}

      {gpu && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <Zap className="w-3.5 h-3.5 text-yellow-500" />
              <span className="truncate max-w-[120px]">{gpu.name?.split(' ').slice(0, 2).join(' ') || 'GPU'}</span>
            </div>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {gpu.utilizationPercent}%{gpu.temperatureC ? ` · ${gpu.temperatureC}°C` : ''}
            </span>
          </div>
          <MiniBar value={gpu.utilizationPercent} color="bg-yellow-500" />
          {gpu.vramTotalGb > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">VRAM</span>
                <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
                  {gpu.vramUsedGb}/{gpu.vramTotalGb} GB
                </span>
              </div>
              <MiniBar value={gpu.vramUsedGb} max={gpu.vramTotalGb} color="bg-green-500" />
            </div>
          )}
        </div>
      )}

      {!cpu && !gpu && !loading && (
        <div className="text-xs text-gray-400 dark:text-gray-500">No hardware data available</div>
      )}

      {stats?.modelHardwareInfo && (
        <div className="pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          <div className="font-medium text-gray-600 dark:text-gray-400">{stats.modelHardwareInfo.name}</div>
          {stats.modelHardwareInfo.sizeVram && <div className="mt-0.5">{stats.modelHardwareInfo.sizeVram} VRAM</div>}
          {stats.modelHardwareInfo.gpuLayers && <div className="mt-0.5">{stats.modelHardwareInfo.gpuLayers} GPU layers</div>}
        </div>
      )}
    </div>
  );
};

const ModelsPage = () => {
  const [serverStatus, setServerStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [storage, setStorage] = useState(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [startingModel, setStartingModel] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [deletingModel, setDeletingModel] = useState(null);
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
      if (res.success) {
        setModels(res.models || []);
        setStorage(res.storage || null);
      }
    } catch (err) {
      console.warn('Failed to load models:', err);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleStart = async (filename) => {
    setStartingModel(filename);
    try {
      await llamaServerApi.start(filename);
      setServerStatus(prev => ({ ...prev, status: 'loading', model: filename }));
      pollCleanup.current?.();
      pollCleanup.current = llamaServerApi.pollStatus(
        (snap) => setServerStatus(snap),
        (snap) => { setServerStatus(snap); setStartingModel(null); pollCleanup.current = null; },
        (snap) => { setServerStatus(snap); setStartingModel(null); pollCleanup.current = null; },
      );
    } catch (err) {
      setServerStatus(prev => ({ ...prev, status: 'error', error: err.message }));
      setStartingModel(null);
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

  const handleDelete = async (filename) => {
    setDeletingModel(filename);
    try {
      await localModelsApi.deleteModel(filename);
      await loadModelList();
    } catch (err) {
      console.error('Failed to delete model:', err);
    } finally {
      setDeletingModel(null);
    }
  };

  const status = serverStatus?.status ?? 'idle';
  const { label: statusLabel, color: statusColor } = STATUS_META[status] || STATUS_META.idle;
  const isRunning = status === 'ready' || status === 'loading';

  const bannerClass = {
    ready:   'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800 midnight:bg-green-900/20 midnight:border-green-800',
    loading: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 midnight:bg-amber-900/20 midnight:border-amber-800',
    error:   'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800 midnight:bg-red-900/20 midnight:border-red-800',
    idle:    'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 midnight:bg-gray-800/50 midnight:border-gray-700',
  }[status] ?? 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 midnight:bg-gray-800/50 midnight:border-gray-700';

  const iconClass = {
    ready:   'text-green-600 dark:text-green-400',
    loading: 'text-amber-600 dark:text-amber-400 animate-pulse',
    error:   'text-red-500',
    idle:    'text-gray-400',
  }[status] ?? 'text-gray-400';

  return (
    <div className="flex h-full w-full bg-white dark:bg-gray-900 midnight:bg-gray-950 font-sans">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800/60 midnight:border-gray-800/60 flex-shrink-0 bg-white dark:bg-gray-900 midnight:bg-gray-950 z-10 sticky top-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                  Model Studio
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">
                  Manage, load and discover local AI models
                </p>
              </div>
            </div>
            <button
              onClick={() => { loadStatus(); loadModelList(); }}
              disabled={loadingStatus || loadingModels}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:text-gray-900 dark:hover:text-white midnight:hover:text-white transition-colors bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700"
            >
              <RefreshCw className={`w-4 h-4 ${(loadingStatus || loadingModels) ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto w-full">
          <div className="max-w-[1400px] mx-auto w-full px-8 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column (Primary) */}
              <div className="lg:col-span-2 space-y-8">
                
                {/* Active Server Banner */}
                <div className={`relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 ${bannerClass}`}>
                  {/* Decorative background blur */}
                  <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-white/20 dark:bg-black/20 blur-3xl rounded-full pointer-events-none" />
                  
                  <div className="relative z-10 flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 bg-white dark:bg-gray-900 midnight:bg-gray-900 rounded-xl shadow-sm border border-black/5 dark:border-white/5 midnight:border-white/5`}>
                        <Server className={`w-6 h-6 ${iconClass}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white midnight:text-white">Active Inference Server</h2>
                          <Badge color={statusColor}>{statusLabel}</Badge>
                        </div>
                        {serverStatus?.model ? (
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                            Running: <span className="text-gray-800 dark:text-gray-200 midnight:text-gray-100 font-semibold">{serverStatus.model}</span>
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            No model is currently loaded in memory.
                          </p>
                        )}
                        {serverStatus?.error && (
                          <p className="text-sm text-red-600 dark:text-red-400 mt-1">{serverStatus.error}</p>
                        )}
                      </div>
                    </div>
                    
                    {isRunning && (
                      <button
                        onClick={handleStop}
                        disabled={stopping || status === 'loading'}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-xl disabled:opacity-50 transition-all shadow-sm"
                      >
                        {stopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                        {stopping ? 'Stopping...' : 'Stop Server'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Local Library Grid */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Local Library</h2>
                    <Badge color="blue">{models.length} Models</Badge>
                  </div>
                  
                  {loadingModels ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[1, 2].map(i => (
                        <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800/50 midnight:bg-gray-800/50 rounded-2xl animate-pulse" />
                      ))}
                    </div>
                  ) : models.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-gray-200 dark:border-gray-800 midnight:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-900/50 midnight:bg-gray-900/50">
                      <div className="p-3 bg-white dark:bg-gray-800 midnight:bg-gray-800 rounded-full shadow-sm mb-3">
                        <Box className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">Your library is empty</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-1 max-w-sm text-center">
                        Use the discovery panel on the right to search HuggingFace and download GGUF models.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {models.map(m => {
                        const isLoaded = serverStatus?.model === m.filename && isRunning;
                        const isStarting = startingModel === m.filename;
                        const isDeleting = deletingModel === m.filename;
                        
                        return (
                          <div 
                            key={m.filename}
                            className={`group relative flex flex-col bg-white dark:bg-gray-800 midnight:bg-gray-900 border rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-sm
                              ${isLoaded ? 'border-gray-400 dark:border-gray-500 midnight:border-gray-600 ring-1 ring-gray-400/30 dark:ring-gray-500/30 midnight:ring-gray-500/20 shadow-sm' : 'border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-gray-700'}`}
                          >
                            <div className="p-5 flex-1">
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isLoaded ? 'bg-gray-700 text-white dark:bg-gray-600 midnight:bg-gray-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 midnight:bg-gray-800/50'}`}>
                                    <Cpu className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-white truncate" title={m.name || m.filename}>
                                      {m.name || m.filename}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 bg-gray-100 dark:bg-gray-900/50 midnight:bg-gray-800/50 px-2 py-0.5 rounded">
                                        {m.sizeFormatted}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                {isLoaded && (
                                  <span className="flex h-3 w-3 relative flex-shrink-0 mt-1">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50 midnight:border-gray-800/50 flex items-center justify-between gap-2">
                              {!isLoaded ? (
                                <button
                                  onClick={() => handleStart(m.filename)}
                                  disabled={isStarting || isRunning}
                                  className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-700 dark:text-gray-300 midnight:text-gray-400 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-lg hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-gray-100 midnight:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-gray-700 disabled:hover:border-gray-200"
                                >
                                  {isStarting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                                  {isStarting ? 'Starting...' : 'Load'}
                                </button>
                              ) : (
                                <button
                                  onClick={handleStop}
                                  disabled={stopping}
                                  className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 midnight:bg-gray-800 midnight:hover:bg-gray-700 rounded-lg transition-colors shadow-sm"
                                >
                                  {stopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                                  Active
                                </button>
                              )}
                              
                              <button
                                onClick={() => handleDelete(m.filename)}
                                disabled={isDeleting || isLoaded}
                                className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                                title="Delete model"
                              >
                                {isDeleting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column (Secondary / Management) */}
              <div className="space-y-6">
                <LocalModelsSection storage={storage} onRefresh={loadModelList} />
                <SystemInfoSection />
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelsPage;

