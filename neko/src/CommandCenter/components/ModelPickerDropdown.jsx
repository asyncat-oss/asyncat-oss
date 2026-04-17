// ModelPickerDropdown.jsx — Model selector
// Trigger: minimal text-style. Dropdown: model list only.
// Parameters have moved to ModelParamsSidebar.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, HardDrive, Loader2, CheckCircle2,
  XCircle, CircleDot, StopCircle, Zap, AlertTriangle, Trash2, RefreshCw,
} from 'lucide-react';
import { localModelsApi, llamaServerApi } from '../../Settings/settingApi.js';
import { useModelConfig, DEFAULT_CONFIG } from '../hooks/useModelConfig.js';

const ModelPickerDropdown = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [serverStatus, setServerStatus] = useState({ status: 'idle', model: null, error: null, errorCode: null, recentLogs: [] });
  const [loadingModels, setLoadingModels] = useState(false);
  const [binaryFound, setBinaryFound] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [deletingModel, setDeletingModel] = useState(null);
  const { config } = useModelConfig();
  const stopPollRef = useRef(null);
  const dropdownRef = useRef(null);

  // ── Initial data load ─────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      await loadModels();
      await loadServerStatus();
      await checkBinary();
    };
    init();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const res = await localModelsApi.listModels();
      if (res.success) setModels(res.models || []);
    } catch { /* ignore */ }
    finally { setLoadingModels(false); }
  }, []);

  const loadServerStatus = useCallback(async () => {
    try {
      const snap = await llamaServerApi.getStatus();
      setServerStatus(snap);
      return snap;
    } catch {
      return { status: 'idle', model: null, error: null };
    }
  }, []);

  const checkBinary = useCallback(async () => {
    try {
      const res = await llamaServerApi.checkBinary();
      setBinaryFound(res.found);
    } catch {
      setBinaryFound(false);
    }
  }, []);

  // ── Start a model ─────────────────────────────────────────────────────────
  const handleSelect = useCallback(async (filename) => {
    setOpen(false);
    stopPollRef.current?.();
    setServerStatus({ status: 'loading', model: filename, error: null });

    try {
      await llamaServerApi.start(filename, config.ctx_size);
    } catch (err) {
      setServerStatus({ status: 'error', model: filename, error: err.message });
      return;
    }

    stopPollRef.current = llamaServerApi.pollStatus(
      snap => setServerStatus(snap),
      snap => setServerStatus(snap),
      snap => setServerStatus(snap),
    );
  }, [config.ctx_size]);

  // ── Stop the server ───────────────────────────────────────────────────────
  const handleStop = useCallback(async (e) => {
    e.stopPropagation();
    stopPollRef.current?.();
    try {
      await llamaServerApi.stop();
      setServerStatus({ status: 'idle', model: null, error: null });
    } catch (err) {
      console.error('Failed to stop server:', err);
    }
  }, []);

  const handleDeleteModel = useCallback(async (filename) => {
    setDeletingModel(filename);
    try {
      await localModelsApi.deleteModel(filename);
      setServerStatus({ status: 'idle', model: null, error: null, errorCode: null, recentLogs: [] });
      await loadModels();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeletingModel(null);
    }
  }, [loadModels]);

  useEffect(() => () => stopPollRef.current?.(), []);

  const { status, model: loadedModel, error, errorCode } = serverStatus;
  const hasModels = models.length > 0;
  const isModified = JSON.stringify(config) !== JSON.stringify(DEFAULT_CONFIG);
  const shortName = loadedModel?.replace(/\.(gguf|bin)$/, '') || '';

  // ── Trigger button ────────────────────────────────────────────────────────
  const renderTrigger = () => {
    if (status === 'loading') {
      return (
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onClick={() => { setOpen(v => !v); if (!open) { loadModels(); loadServerStatus(); } }}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
          <span className="animate-pulse">Loading…</span>
        </button>
      );
    }

    if (status === 'ready') {
      return (
        <button
          className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors group relative"
          onClick={() => { setOpen(v => !v); if (!open) { loadModels(); loadServerStatus(); } }}
          title={loadedModel}
        >
          <span className="font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300 max-w-[160px] truncate">
            {shortName}
          </span>
          {isModified && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Custom parameters active" />}
          <ChevronDown className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
          {!open && (
            <span
              role="button"
              onClick={handleStop}
              className="ml-0.5 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              title="Stop model server"
            >
              <StopCircle className="w-3 h-3" />
            </span>
          )}
        </button>
      );
    }

    if (status === 'error') {
      return (
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          onClick={() => { setOpen(v => !v); if (!open) { loadModels(); loadServerStatus(); } }}
          title={error}
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Error</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      );
    }

    // idle — no model running
    if (!hasModels && !loadingModels) {
      return (
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onClick={() => navigate('/settings/local-models')}
          title="Download a local model"
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>No local model</span>
        </button>
      );
    }

    return (
      <button
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        onClick={() => { setOpen(v => !v); if (!open) { loadModels(); loadServerStatus(); } }}
      >
        <HardDrive className="w-3.5 h-3.5" />
        <span>Select model</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {renderTrigger()}

      {/* ── Dropdown ── */}
      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 bg-white dark:bg-gray-900 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl shadow-xl overflow-hidden"
          style={{ width: '18rem' }}
        >
          {/* Binary warning */}
          {binaryFound === false && (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">llama-server not found</p>
                <p className="opacity-80 mt-0.5">
                  Install: <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">pip install llama-cpp-python[server]</code>
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && error && (
            <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium">
                  {errorCode === 'CORRUPTED' ? 'Corrupted file' :
                   errorCode === 'OOM'        ? 'Out of memory' :
                   errorCode === 'PORT'       ? 'Port conflict' :
                   errorCode === 'MISSING'    ? 'File missing' : 'Load error'}
                </p>
                {serverStatus.recentLogs?.length > 0 && (
                  <button onClick={() => setShowLogs(v => !v)} className="text-red-500 underline">
                    {showLogs ? 'hide' : 'show'} logs
                  </button>
                )}
              </div>
              <p className="opacity-80">{error.replace(/^[A-Z_]+:\s*/, '')}</p>
              {(errorCode === 'CORRUPTED' || errorCode === 'MISSING') && loadedModel && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteModel(loadedModel)}
                    disabled={deletingModel === loadedModel}
                    className="flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 text-red-700 dark:text-red-300 rounded font-medium disabled:opacity-50 transition-colors text-[11px]"
                  >
                    {deletingModel === loadedModel ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete file
                  </button>
                  <button onClick={() => { setOpen(false); navigate('/settings/local-models'); }} className="text-red-600 dark:text-red-400 underline text-[11px]">
                    Re-download →
                  </button>
                </div>
              )}
              {showLogs && serverStatus.recentLogs?.length > 0 && (
                <pre className="mt-2 p-2 bg-red-100 dark:bg-red-950/50 rounded text-[10px] font-mono overflow-x-auto max-h-24 overflow-y-auto">
                  {serverStatus.recentLogs.join('\n')}
                </pre>
              )}
            </div>
          )}

          {/* Model list */}
          <div className="max-h-64 overflow-y-auto">
            {loadingModels ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            ) : models.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                No models downloaded
              </div>
            ) : (
              models.map(m => {
                const isLoaded = loadedModel === m.filename && (status === 'ready' || status === 'loading');
                const isThisLoading = loadedModel === m.filename && status === 'loading';
                return (
                  <button
                    key={m.filename}
                    onClick={() => handleSelect(m.filename)}
                    disabled={status === 'loading'}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                      isLoaded ? 'bg-gray-50 dark:bg-gray-800/60 midnight:bg-slate-800/60' : 'hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {isThisLoading
                        ? <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                        : isLoaded
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          : <CircleDot className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${isLoaded ? 'text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                        {m.name}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <HardDrive className="w-2.5 h-2.5" />
                        {m.sizeFormatted}
                      </div>
                    </div>
                    {m.sizeGb && (
                      <div className="flex-shrink-0 flex items-center gap-0.5 text-xs text-gray-400 dark:text-gray-500">
                        <Zap className="w-2.5 h-2.5" />
                        <span>~{m.sizeGb.toFixed(1)}G</span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 flex items-center justify-between">
            <button
              onClick={() => { setOpen(false); navigate('/settings/local-models'); }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              + Download more
            </button>
            <button
              onClick={() => { setOpen(false); loadModels(); loadServerStatus(); }}
              className="text-xs text-gray-400 dark:text-gray-500 hover:underline"
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelPickerDropdown;
