// MlxModelsSection.jsx — MLX local model browser for supported macOS/Linux systems
// Scans ~/.cache/huggingface/hub/ and other common locations for MLX
// .safetensors model directories and lets the user load them via mlx_lm.server.

import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Cpu,
  Download,
  Loader2,
  RefreshCw,
  AlertCircle,
  TriangleAlert,
  Square,
} from 'lucide-react';
import { mlxApi, runtimeApi } from "../Settings/settingApi.js";

// ── Format helpers ─────────────────────────────────────────────────────────────
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
const MlxModelsSection = ({ globalServerStatus, onMlxStatusChange, onMlxStopRequest, onMlxRuntimeChange }) => {
  const [serverStatus, setServerStatus] = useState(null); // { status, model, modelPath, mlxAvailable, available }
  const [loading, setLoading]   = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installJob, setInstallJob] = useState(null);
  const installCleanup = useRef(null);

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
  }, [onMlxStatusChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Load a model ───────────────────────────────────────────────────────────
  const handleInstall = async () => {
    setInstalling(true);
    setInstallJob(null);
    setError(null);
    try {
      const result = await runtimeApi.install('mlx');
      setInstallJob(result.job);
      installCleanup.current?.();
      installCleanup.current = runtimeApi.pollJob(
        result.job.id,
        setInstallJob,
        async (job) => {
          setInstallJob(job);
          setInstalling(false);
          installCleanup.current = null;
          await refresh();
          await onMlxRuntimeChange?.();
        },
        (job) => {
          setInstalling(false);
          installCleanup.current = null;
          setError(job?.error || 'Failed to install the MLX runtime');
        },
      );
    } catch (err) {
      setInstalling(false);
      setError(err.message || 'Failed to start the MLX runtime install');
    }
  };

  // ── Stop the server ────────────────────────────────────────────────────────
  const handleStop = async () => {
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
    return () => {
      installCleanup.current?.();
    };
  }, []);

  // ── Sync with global server status ─────────────────────────────────────────
  useEffect(() => {
    if (globalServerStatus?.status === 'idle' && serverStatus?.status !== 'idle') {
      setServerStatus(prev => prev ? { ...prev, status: 'idle', model: null, modelPath: null } : null);
      setLoadingAction(false);
    }
  }, [globalServerStatus?.status, serverStatus?.status]);

  // ── Unsupported platform — graceful empty state ───────────────────────────
  if (!loading && serverStatus && !serverStatus.available) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 p-6 text-center shadow-sm">
        <Cpu className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          MLX is not supported on this system
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Asyncat supports MLX LM on Apple Silicon and Linux (CPU or NVIDIA CUDA).
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
          MLX model support requires an isolated <code className="font-mono text-[11px] bg-amber-100 dark:bg-amber-900/40 px-1 rounded">mlx-lm</code> runtime. Asyncat can create and manage it for this user.
        </p>
        {installing && (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/30">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${Math.max(3, Math.min(100, installJob?.progress?.percent ?? 3))}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
              {installJob?.progress?.message || 'Preparing MLX installation…'}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
        >
          {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {installing ? 'Installing…' : 'Install managed MLX runtime'}
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={installing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 transition-colors disabled:opacity-50"
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

StatusDot.propTypes = {
  status: PropTypes.string,
};

MlxModelsSection.propTypes = {
  globalServerStatus: PropTypes.shape({ status: PropTypes.string }),
  onMlxStatusChange: PropTypes.func,
  onMlxStopRequest: PropTypes.func,
  onMlxRuntimeChange: PropTypes.func,
};

export default MlxModelsSection;
