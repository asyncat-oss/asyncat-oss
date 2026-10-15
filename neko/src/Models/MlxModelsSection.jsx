// MlxModelsSection.jsx — the MLX runtime on Local models: installs mlx-lm
// when it is missing, and shows and stops the MLX model that is running.

import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Download, RefreshCw, Square } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import { Progress } from '../components/ui/Progress.jsx';
import { mlxApi, runtimeApi } from "../Settings/settingApi.js";

// ── Status dot ─────────────────────────────────────────────────────────────────
const StatusDot = ({ status }) => {
  const colors = {
    ready:   'bg-emerald-500',
    loading: 'bg-amber-500 animate-pulse',
    error:   'bg-red-500',
    idle:    'bg-fg-subtle/50',
  };
  return (
    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${colors[status] || colors.idle}`} />
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
      <div>
        <h3 className="text-[14px] font-semibold text-fg">MLX models</h3>
        <p className="mt-1 text-[13px] leading-5 text-fg-muted">
          MLX doesn&apos;t run on this computer. Asyncat runs MLX models on Apple Silicon, and on Linux with the CPU or an NVIDIA graphics card.
        </p>
      </div>
    );
  }

  // ── mlx_lm not installed ───────────────────────────────────────────────────
  if (!loading && serverStatus?.available && serverStatus?.mlxAvailable === false) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="text-[14px] font-semibold text-fg">MLX models</h3>
          <Notice tone="warning" className="mt-1">
            The MLX runtime (<code className="font-mono text-[11px]">mlx-lm</code>) isn&apos;t installed. Asyncat can install its own copy, kept apart from the rest of this computer.
          </Notice>
        </div>
        {installing && (
          <div className="space-y-1.5">
            <Progress value={Math.max(3, Math.min(100, installJob?.progress?.percent ?? 3))} label="Installing the MLX runtime" />
            <p className="text-[12px] text-fg-subtle">{installJob?.progress?.message || 'Getting the install ready…'}</p>
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Download} onClick={handleInstall} loading={installing}>
            {installing ? 'Installing…' : 'Install MLX runtime'}
          </Button>
          <Button variant="ghost" icon={RefreshCw} onClick={refresh} disabled={installing}>
            Check again
          </Button>
        </div>
      </div>
    );
  }

  const running = serverStatus?.status === 'ready';
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-[14px] font-semibold text-fg">MLX models</h3>
        {running && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
            <StatusDot status="ready" />
            Running
          </span>
        )}
      </div>

      {running && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-fg">{serverStatus.model || 'Unknown model'}</p>
            <p className="mt-0.5 select-all truncate font-mono text-[12px] text-fg-subtle">{serverStatus.modelPath}</p>
          </div>
          <Button variant="secondary" icon={Square} onClick={handleStop} loading={loadingAction}>
            Stop
          </Button>
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}
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
