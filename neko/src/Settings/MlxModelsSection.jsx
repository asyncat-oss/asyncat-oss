// MlxModelsSection.jsx — MLX local model browser for Apple Silicon
// Scans ~/.cache/huggingface/hub/ and other common locations for MLX
// .safetensors model directories and lets the user load them via mlx_lm.server.

import { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  RefreshCw,
  AlertCircle,
  TriangleAlert,
  Square,
} from 'lucide-react';
import { mlxApi } from './settingApi.js';

// ── Format helpers ─────────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (!bytes) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
};

// ── Status badge ───────────────────────────────────────────────────────────────
const StatusDot = ({ status }) => {
  const colors = {
    ready:   'bg-green-400',
    loading: 'bg-amber-400 animate-pulse',
    error:   'bg-red-400',
    idle:    'bg-gray-300 dark:bg-gray-600',
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[status] || colors.idle}`} />
  );
};



// ── Main component ─────────────────────────────────────────────────────────────
const MlxModelsSection = ({ globalServerStatus, onMlxStatusChange, onMlxStopRequest }) => {
  const [serverStatus, setServerStatus] = useState(null); // { status, model, modelPath, mlxAvailable, available }
  const [loading, setLoading]   = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState(null);
  const [stopCleanup, setStopCleanup] = useState(null);

  // ── Fetch status ───────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusRes = await mlxApi.getStatus();
      setServerStatus(statusRes);
      if (statusRes.status !== 'idle') {
        onMlxStatusChange?.(statusRes);
      }
    } catch (err) {
      setError(err.message || 'Failed to load MLX data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Load a model ───────────────────────────────────────────────────────────
  const handleLoad = async (modelPath) => {
    setLoadingAction(true);
    setError(null);
    try {
      await mlxApi.start(modelPath);
      // Poll status until ready or error
      const cleanup = mlxApi.pollStatus(
        (snap) => { setServerStatus(prev => ({ ...prev, ...snap })); onMlxStatusChange?.(snap); },
        (snap) => { setServerStatus(prev => ({ ...prev, ...snap })); onMlxStatusChange?.(snap); setLoadingAction(false); },
        (snap) => { setServerStatus(prev => ({ ...prev, ...snap })); onMlxStatusChange?.(snap); setLoadingAction(false); setError(snap.error || 'Failed to load model'); },
      );
      setStopCleanup(() => cleanup);
    } catch (err) {
      setError(err.message || 'Failed to start MLX server');
      setLoadingAction(false);
    }
  };

  // ── Stop the server ────────────────────────────────────────────────────────
  const handleStop = async () => {
    stopCleanup?.();
    setLoadingAction(true);
    setError(null);
    try {
      await mlxApi.stop();
      setServerStatus(prev => ({ ...prev, status: 'idle', model: null, modelPath: null }));
      onMlxStopRequest?.();
    } catch (err) {
      setError(err.message || 'Failed to stop MLX server');
    } finally {
      setLoadingAction(false);
    }
  };

  // ── Cleanup polling on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => stopCleanup?.();
  }, [stopCleanup]);

  // ── Sync with global server status ─────────────────────────────────────────
  useEffect(() => {
    if (globalServerStatus?.status === 'idle' && serverStatus?.status !== 'idle') {
      setServerStatus(prev => prev ? { ...prev, status: 'idle', model: null, modelPath: null } : null);
      stopCleanup?.();
      setLoadingAction(false);
    }
  }, [globalServerStatus?.status, serverStatus?.status, stopCleanup]);

  // ── Not Apple Silicon — graceful empty state ───────────────────────────────
  if (!loading && serverStatus && !serverStatus.available) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 p-6 text-center shadow-sm">
        <Cpu className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          MLX requires Apple Silicon
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          This machine is not running macOS on arm64.
        </p>
      </div>
    );
  }

  // ── mlx_lm not installed ───────────────────────────────────────────────────
  if (!loading && serverStatus?.available && serverStatus?.mlxAvailable === false) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-700/50 bg-amber-50/60 dark:bg-amber-900/10 midnight:bg-amber-950/10 p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <TriangleAlert className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            mlx-lm is not installed
          </p>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-400 leading-5">
          MLX model support requires the <code className="font-mono text-[11px] bg-amber-100 dark:bg-amber-900/40 px-1 rounded">mlx-lm</code> Python package.
          Install it in your terminal:
        </p>
        <code className="block text-xs font-mono bg-gray-900 text-green-400 rounded-lg px-3 py-2">
          pip install mlx-lm
        </code>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-slate-200">
              MLX Models
            </h3>
            {serverStatus?.status === 'ready' && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">
                <StatusDot status="ready" />
                Active
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Active Model Info */}
      {serverStatus?.status === 'ready' && (
        <div className="mt-4 p-5 rounded-2xl bg-gray-50/50 dark:bg-gray-800/40 midnight:bg-slate-900/40 border border-gray-200 dark:border-gray-700 midnight:border-slate-800 transition-all shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5 font-bold">
                Running Model
              </div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {serverStatus.model || 'Unknown Model'}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 font-mono truncate bg-gray-100/50 dark:bg-gray-900/30 px-2 py-1 rounded select-all">
                {serverStatus.modelPath}
              </div>
            </div>
            <button
              onClick={handleStop}
              disabled={loadingAction}
              className="w-full sm:w-auto flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Server
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}


    </div>
  );
};

export default MlxModelsSection;
