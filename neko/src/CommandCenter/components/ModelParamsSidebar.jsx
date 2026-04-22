// ModelParamsSidebar.jsx — Left sidebar for local model parameters and logs
import { useState, useCallback, useRef, useEffect } from 'react';
import { RefreshCw, X, RotateCcw, SlidersHorizontal, ScrollText, AlertTriangle } from 'lucide-react';
import { llamaServerApi } from '../../Settings/settingApi.js';
import { useModelConfig, DEFAULT_CONFIG } from '../hooks/useModelConfig.js';
import { useLocalModelStatus } from '../hooks/useLocalModelStatus.js';

function Slider({ label, value, min, max, step, onChange, format = v => v }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-[11px] font-mono text-gray-700 dark:text-gray-300 tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full accent-blue-500 cursor-pointer"
      />
    </div>
  );
}

const ModelParamsSidebar = ({ onClose }) => {
  const { config, setConfig, resetConfig } = useModelConfig();
  const localModel = useLocalModelStatus();
  const { status, model, recentLogs, ctxTrain } = localModel;

  const [activeTab, setActiveTab] = useState('params');
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState(null);
  const logsEndRef = useRef(null);

  const isReady   = status === 'ready';
  const isError   = status === 'error';
  const isLoading = status === 'loading';
  const isModified = JSON.stringify(config) !== JSON.stringify(DEFAULT_CONFIG);

  // Max context is model's training ctx, or a safe default if not yet known
  const ctxMax = ctxTrain || 131072;

  // Clamp ctx_size if it exceeds the model's actual training ctx
  useEffect(() => {
    if (ctxTrain && config.ctx_size > ctxTrain) {
      setConfig({ ctx_size: ctxTrain });
    }
  }, [ctxTrain]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (activeTab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [recentLogs, activeTab]);

  // Switch to logs automatically on error
  useEffect(() => {
    if (isError) setActiveTab('logs');
  }, [isError]);

  const handleRestart = useCallback(async () => {
    if (!model || isRestarting) return;
    setIsRestarting(true);
    setRestartError(null);
    try {
      await llamaServerApi.stop();
      await new Promise(r => setTimeout(r, 1000));
      await llamaServerApi.start(model, config.ctx_size);
      setActiveTab('params');
    } catch (err) {
      console.error('[ModelParamsSidebar] Restart failed:', err);
      setRestartError(err.message || 'Restart failed');
    } finally {
      setIsRestarting(false);
    }
  }, [model, config.ctx_size, isRestarting]);

  const statusColor = isReady   ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : isLoading ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : isError   ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    :             'bg-gray-100 dark:bg-gray-800 text-gray-500';

  const statusLabel = isReady ? 'Running' : isLoading ? 'Loading…' : isError ? 'Error' : status;

  return (
    <div className="flex flex-col h-full flex-shrink-0 w-52 border-r border-gray-200 dark:border-gray-800 midnight:border-slate-800 bg-gray-50 dark:bg-gray-900/60 midnight:bg-slate-950">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Local Model</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-0.5 rounded" title="Close">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Model info */}
      {model && (
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
          <p className="text-[11px] text-gray-700 dark:text-gray-300 truncate font-medium" title={model}>
            {model.replace(/\.(gguf|bin)$/i, '')}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor}`}>
              {statusLabel}
            </span>
            {ctxTrain && isReady && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                max {ctxTrain.toLocaleString()} ctx
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <button
          onClick={() => setActiveTab('params')}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
            activeTab === 'params'
              ? 'text-gray-800 dark:text-gray-200 border-b-2 border-blue-500 -mb-px'
              : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
          }`}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Params
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
            activeTab === 'logs'
              ? 'text-gray-800 dark:text-gray-200 border-b-2 border-blue-500 -mb-px'
              : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
          }`}
        >
          <ScrollText className="w-3 h-3" />
          Logs
          {isError && <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-0.5" />}
        </button>
      </div>

      {/* ── Params tab ── */}
      {activeTab === 'params' && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">

          {isError && (
            <div className="flex items-start gap-1.5 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-400">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>Model failed to load. Adjust context size or check logs, then retry.</span>
            </div>
          )}

          <Slider label="Temperature" value={config.temperature} min={0} max={2} step={0.05}
            format={v => v.toFixed(2)} onChange={v => setConfig({ temperature: v })} />
          <Slider label="Top P" value={config.top_p} min={0} max={1} step={0.01}
            format={v => v.toFixed(2)} onChange={v => setConfig({ top_p: v })} />
          <Slider label="Top K" value={config.top_k} min={1} max={200} step={1}
            format={v => String(Math.round(v))} onChange={v => setConfig({ top_k: Math.round(v) })} />
          <Slider label="Min P" value={config.min_p} min={0} max={0.5} step={0.01}
            format={v => v.toFixed(2)} onChange={v => setConfig({ min_p: v })} />
          <Slider label="Repeat Penalty" value={config.repeat_penalty} min={1.0} max={2.0} step={0.05}
            format={v => v.toFixed(2)} onChange={v => setConfig({ repeat_penalty: v })} />

          {/* Context size */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Context Size</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">restart needed</span>
              </div>
              <Slider
                label="Tokens"
                value={Math.min(config.ctx_size, ctxMax)}
                min={512}
                max={ctxMax}
                step={512}
                format={v => v.toLocaleString()}
                onChange={v => setConfig({ ctx_size: Math.round(v) })}
              />
              {ctxTrain && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                  Model max: {ctxTrain.toLocaleString()} tokens
                </p>
              )}
            </div>

            {restartError && (
              <p className="text-[10px] text-red-500 dark:text-red-400">{restartError}</p>
            )}

            {(isReady || isError) && model && (
              <button
                onClick={handleRestart}
                disabled={isRestarting}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-[11px] font-medium transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isRestarting ? 'animate-spin' : ''}`} />
                {isRestarting ? 'Restarting…' : isError ? 'Retry with these settings' : 'Apply & Restart'}
              </button>
            )}
          </div>

          {/* System prompt prefix */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">System Prompt Prefix</p>
            <textarea
              value={config.system_prompt_prefix}
              onChange={e => setConfig({ system_prompt_prefix: e.target.value })}
              placeholder="e.g. 'You are a Python expert.'"
              rows={3}
              className="w-full text-xs bg-white dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            />
          </div>

          {isModified && (
            <button
              onClick={resetConfig}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-1.5 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to defaults
            </button>
          )}

          <p className="text-[10px] text-gray-400 dark:text-gray-500 pb-2">
            Sampling params apply immediately. Context size applies after restart.
          </p>
        </div>
      )}

      {/* ── Logs tab ── */}
      {activeTab === 'logs' && (
        <div className="flex-1 overflow-y-auto p-2">
          {!recentLogs?.length ? (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center mt-4">No logs yet</p>
          ) : (
            <pre className="text-[10px] font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all leading-relaxed space-y-px">
              {recentLogs.map((line, i) => (
                <div
                  key={i}
                  className={
                    /error|fail|oom|out of memory|cudaMalloc/i.test(line)
                      ? 'text-red-600 dark:text-red-400 font-medium'
                      : /warn/i.test(line)
                        ? 'text-amber-600 dark:text-amber-400'
                        : /ready|loaded|success/i.test(line)
                          ? 'text-green-600 dark:text-green-400'
                          : ''
                  }
                >
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default ModelParamsSidebar;
