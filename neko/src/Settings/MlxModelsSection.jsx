// MlxModelsSection.jsx — MLX local model browser for Apple Silicon
// Scans ~/.cache/huggingface/hub/ and other common locations for MLX
// .safetensors model directories and lets the user load them via mlx_lm.server.

import { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  RefreshCw,
  Play,
  Square,
  AlertCircle,
  Loader2,
  FolderOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  TriangleAlert,
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

// ── Individual model card ──────────────────────────────────────────────────────
const MlxModelCard = ({ model, serverStatus, onLoad, onStop, loading }) => {
  const isThisModel = serverStatus?.modelPath === model.realPath || serverStatus?.modelPath === model.path;
  const isRunning   = isThisModel && serverStatus?.status === 'ready';
  const isLoading   = isThisModel && serverStatus?.status === 'loading';
  const isError     = isThisModel && serverStatus?.status === 'error';
  const busy        = loading || isLoading;
  const [showPath, setShowPath] = useState(false);

  return (
    <div className={`rounded-2xl border transition-all duration-200 shadow-sm bg-white dark:bg-gray-900 midnight:bg-slate-950 ${
      isRunning  ? 'border-green-300 dark:border-green-700/60 ring-1 ring-green-200 dark:ring-green-900/40' :
      isLoading  ? 'border-amber-200 dark:border-amber-700/60' :
      isError    ? 'border-red-200 dark:border-red-700/60' :
                   'border-gray-200 dark:border-gray-700 midnight:border-slate-800'
    }`}>
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={isRunning ? 'ready' : isLoading ? 'loading' : isError ? 'error' : 'idle'} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100 truncate">
                {model.name}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {model.architecture && model.architecture !== 'unknown' && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 text-gray-500 dark:text-gray-400 font-mono">
                    {model.architecture}
                  </span>
                )}
                {model.quantization && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-mono">
                    {model.quantization}
                  </span>
                )}
                {model.contextLength && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {(model.contextLength / 1024).toFixed(0)}K ctx
                  </span>
                )}
                {model.sizeFormatted && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {model.sizeFormatted}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="flex-shrink-0">
            {isRunning ? (
              <button
                onClick={onStop}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors shadow-sm"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop
              </button>
            ) : (
              <button
                onClick={() => onLoad(model.path)}
                disabled={busy || Boolean(serverStatus?.status === 'loading')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 hover:bg-gray-700 dark:bg-gray-100 dark:hover:bg-gray-300 dark:text-gray-900 text-white disabled:opacity-50 transition-colors shadow-sm"
              >
                {isLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</>
                  : <><Play className="w-3.5 h-3.5 fill-current" /> Load</>
                }
              </button>
            )}
          </div>
        </div>

        {/* Status messages */}
        {isRunning && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Running on port 8766 — ready for chat
          </div>
        )}
        {isError && serverStatus?.error && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5" />
            {serverStatus.error}
          </div>
        )}

        {/* Path toggle */}
        <button
          onClick={() => setShowPath(v => !v)}
          className="mt-2 flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {showPath ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {showPath ? 'Hide path' : 'Show path'}
        </button>
        {showPath && (
          <div className="mt-1 text-[11px] font-mono text-gray-500 dark:text-gray-400 break-all bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 px-2 py-1.5 rounded-lg">
            {model.path}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
const MlxModelsSection = ({ onMlxStatusChange, onMlxStopRequest }) => {
  const [models, setModels] = useState([]);
  const [serverStatus, setServerStatus] = useState(null); // { status, model, modelPath, mlxAvailable, available }
  const [loading, setLoading]   = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState(null);
  const [stopCleanup, setStopCleanup] = useState(null);

  // ── Fetch status + models ──────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, modelsRes] = await Promise.all([
        mlxApi.getStatus(),
        mlxApi.listModels(),
      ]);
      setServerStatus(statusRes);
      if (statusRes.status !== 'idle') {
        onMlxStatusChange?.(statusRes);
      }
      setModels(modelsRes.models || []);
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
            <Sparkles className="w-4 h-4 text-purple-500" />
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
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {loading
              ? 'Scanning for models…'
              : models.length > 0
                ? `${models.length} model${models.length === 1 ? '' : 's'} found in your HuggingFace cache`
                : 'No MLX models found in your HuggingFace cache'}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Rescan
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800/50 animate-pulse" />
          ))}
        </div>
      )}

      {/* Model list */}
      {!loading && models.length > 0 && (
        <div className="space-y-3">
          {models.map(model => (
            <MlxModelCard
              key={model.realPath || model.path}
              model={model}
              serverStatus={serverStatus}
              onLoad={handleLoad}
              onStop={handleStop}
              loading={loadingAction}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && models.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 midnight:border-slate-800 p-8 text-center">
          <FolderOpen className="w-7 h-7 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            No MLX models found
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">
            Download an MLX model from HuggingFace using&nbsp;
            <code className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-1 rounded">
              huggingface-cli download
            </code>
            , then rescan.
          </p>
          <code className="block mt-3 text-[11px] font-mono text-left bg-gray-900 text-green-400 rounded-lg px-3 py-2 max-w-sm mx-auto whitespace-pre-wrap">
            pip install huggingface_hub{'\n'}
            huggingface-cli download mlx-community/Llama-3.2-3B-Instruct-4bit
          </code>
        </div>
      )}

      {/* Info note */}
      <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
        Scans <code className="font-mono">~/.cache/huggingface/hub/</code>, <code className="font-mono">~/mlx_models/</code>, and <code className="font-mono">~/models/</code> for directories containing <code className="font-mono">config.json</code> + <code className="font-mono">.safetensors</code> files.
      </p>
    </div>
  );
};

export default MlxModelsSection;
