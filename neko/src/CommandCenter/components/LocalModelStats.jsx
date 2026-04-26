// LocalModelStats.jsx — Live stats bar shown in chat when using the built-in llama.cpp server
// Shows: model name, tokens/sec (rolling), time-to-first-token, GPU%, RAM
// Only renders when the built-in server is ready or loading.

import { useState, useEffect, useRef, useCallback } from 'react';
import { Cpu, Zap, Clock, Activity, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { aiProviderApi, llamaServerApi } from '../../Settings/settingApi.js';

// ── Token speed tracker ───────────────────────────────────────────────────────
// Called externally by the streaming handler to feed token timestamps.
// We expose a singleton so the CommandCenter can push events without prop drilling.

const tokenTracker = {
  _listeners: new Set(),
  _timestamps: [],
  _firstTokenAt: null,
  _streamStartAt: null,

  startStream() {
    this._timestamps = [];
    this._firstTokenAt = null;
    this._streamStartAt = Date.now();
    this._emit({ type: 'start' });
  },

  recordToken(count = 1) {
    const now = Date.now();
    if (!this._firstTokenAt) {
      this._firstTokenAt = now;
      this._emit({ type: 'first_token', ttft: now - (this._streamStartAt || now) });
    }
    for (let i = 0; i < count; i++) this._timestamps.push(now);

    // Rolling window: last 2 seconds
    const cutoff = now - 2000;
    this._timestamps = this._timestamps.filter(t => t >= cutoff);
    const tokensPerSec = this._timestamps.length / 2;
    this._emit({ type: 'token', tokensPerSec: Math.round(tokensPerSec) });
  },

  endStream() {
    const now = Date.now();
    const totalMs = now - (this._streamStartAt || now);
    const totalTokens = this._timestamps.length;
    const avgTps = totalMs > 0 ? Math.round((totalTokens / totalMs) * 1000) : 0;
    this._emit({ type: 'end', totalMs, totalTokens, avgTps });
  },

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },

  _emit(event) {
    this._listeners.forEach(fn => fn(event));
  },
};

// eslint-disable-next-line react-refresh/only-export-components
export { tokenTracker };

// ── Component ─────────────────────────────────────────────────────────────────

const LocalModelStats = ({ isStreaming }) => {
  const [llamaStatus, setLlamaStatus] = useState({ status: 'idle', model: null });
  const [tokensPerSec, setTokensPerSec] = useState(null);
  const [ttft, setTtft] = useState(null); // time to first token ms
  const [hwStats, setHwStats] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loadingHw, setLoadingHw] = useState(false);
  const hwIntervalRef = useRef(null);
  const llamaPollRef = useRef(null);

  // Poll llama server status to know when to show/hide
  useEffect(() => {
    llamaServerApi.getStatus().then(snap => setLlamaStatus(snap)).catch(() => {});

    llamaPollRef.current = setInterval(() => {
      llamaServerApi.getStatus().then(snap => setLlamaStatus(snap)).catch(() => {});
    }, 3000);

    return () => clearInterval(llamaPollRef.current);
  }, []);

  // Subscribe to token tracker events
  useEffect(() => {
    const unsub = tokenTracker.subscribe(event => {
      if (event.type === 'start') {
        setTokensPerSec(null);
        setTtft(null);
      } else if (event.type === 'first_token') {
        setTtft(event.ttft);
      } else if (event.type === 'token') {
        setTokensPerSec(event.tokensPerSec);
      } else if (event.type === 'end') {
        setTokensPerSec(event.avgTps);
      }
    });
    return unsub;
  }, []);

  // Poll hardware stats always (not just when expanded or model running)
  const fetchHwStats = useCallback(async () => {
    setLoadingHw(true);
    try {
      const res = await aiProviderApi.getStats();
      if (res.success) setHwStats(res);
    } catch { /* ignore */ }
    finally { setLoadingHw(false); }
  }, []);

  useEffect(() => {
    fetchHwStats();
    // Fast poll when expanded, slow poll otherwise
    const interval = expanded ? 5000 : 15000;
    hwIntervalRef.current = setInterval(fetchHwStats, interval);
    return () => clearInterval(hwIntervalRef.current);
  }, [expanded, fetchHwStats]);

  const gpu = hwStats?.hardware?.gpu?.[0];
  const ram = hwStats?.hardware?.ram;
  const modelActive = llamaStatus.status === 'ready' || llamaStatus.status === 'loading';

  // Built-in server loading state — show progress bar instead of stats
  if (llamaStatus.status === 'loading') {
    return (
      <div className="border-b border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/80 dark:bg-indigo-950/30 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 px-4 py-2 text-xs">
          <Loader2 className="w-3 h-3 text-indigo-500 animate-spin flex-shrink-0" />
          <span className="text-indigo-700 dark:text-indigo-300 font-medium">
            Loading {llamaStatus.model?.replace(/\.(gguf|bin)$/, '')}…
          </span>
          <span className="text-indigo-400 dark:text-indigo-500 text-xs">
            this may take a minute for large models
          </span>
        </div>
        <div className="h-0.5 bg-indigo-100 dark:bg-indigo-900/50 overflow-hidden">
          <div className="h-full bg-indigo-500"
            style={{ width: '40%', animation: 'move 1.5s ease-in-out infinite alternate' }} />
        </div>
      </div>
    );
  }

  // Don't render an empty bar while first load is in progress and no model is active
  if (!hwStats && !modelActive && llamaStatus.status !== 'error') return null;

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800 bg-gray-50/80 dark:bg-gray-900/80 midnight:bg-gray-950/80 backdrop-blur-sm">
      {/* ── Compact bar ── */}
      <div className="flex items-center gap-3 px-4 py-1.5 text-xs">

        {/* GPU quick stat — always visible when available */}
        {gpu && (
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <Activity className="w-3 h-3 text-green-500" />
            <span className="font-mono">GPU {gpu.utilizationPercent ?? '—'}%</span>
            {gpu.vramTotalGb > 0 && (
              <span className="font-mono text-gray-400 dark:text-gray-600">
                · {gpu.vramUsedGb}/{gpu.vramTotalGb}G
              </span>
            )}
          </div>
        )}

        {/* RAM quick stat */}
        {ram && (
          <>
            {gpu && <span className="text-gray-300 dark:text-gray-700">·</span>}
            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <Cpu className="w-3 h-3 text-blue-400" />
              <span className="font-mono">{ram.usedGb}/{ram.totalGb}G RAM</span>
            </div>
          </>
        )}

        {/* Model-specific stats — only when a model is active */}
        {modelActive && (
          <>
            {(gpu || ram) && <span className="text-gray-300 dark:text-gray-700">·</span>}
            {/* Tokens/sec */}
            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <Zap className="w-3 h-3 text-yellow-500" />
              {isStreaming && tokensPerSec !== null
                ? <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{tokensPerSec} tok/s</span>
                : <span className="text-gray-400 dark:text-gray-600">— tok/s</span>
              }
            </div>

            {/* TTFT */}
            {ttft !== null && (
              <>
                <span className="text-gray-300 dark:text-gray-700">·</span>
                <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span className="font-mono">{ttft < 1000 ? `${ttft}ms` : `${(ttft / 1000).toFixed(1)}s`} TTFT</span>
                </div>
              </>
            )}
          </>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="ml-auto flex items-center gap-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title={expanded ? 'Hide hardware stats' : 'Show hardware stats'}
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* ── Expanded hardware panel ── */}
      {expanded && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-3 text-xs border-t border-gray-100 dark:border-gray-800 pt-2">
          {/* CPU */}
          {hwStats?.hardware?.cpu && (
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-gray-700 dark:text-gray-300 font-medium truncate">
                  {hwStats.hardware.cpu.model?.split('@')[0]?.trim() || 'CPU'}
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                  {hwStats.hardware.cpu.cores} cores · {hwStats.hardware.cpu.usagePercent}% used
                </div>
              </div>
            </div>
          )}

          {/* RAM */}
          {ram && (
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
                <div className="w-2.5 h-3 border border-gray-400 rounded-sm relative">
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-blue-400 rounded-sm transition-all"
                    style={{ height: `${ram.usagePercent}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="text-gray-700 dark:text-gray-300 font-medium">RAM</div>
                <div className="text-gray-500 dark:text-gray-400">
                  {ram.usedGb} / {ram.totalGb} GB ({ram.usagePercent}%)
                </div>
              </div>
            </div>
          )}

          {/* GPU */}
          {gpu && (
            <div className="flex items-center gap-2 col-span-2">
              <Zap className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-gray-700 dark:text-gray-300 font-medium truncate">{gpu.name}</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">
                    {gpu.utilizationPercent}% util
                    {gpu.temperatureC ? ` · ${gpu.temperatureC}°C` : ''}
                  </span>
                </div>
                {gpu.vramTotalGb > 0 && (
                  <div className="mt-1">
                    <div className="flex justify-between text-gray-500 dark:text-gray-400 mb-0.5">
                      <span>VRAM</span>
                      <span>{gpu.vramUsedGb} / {gpu.vramTotalGb} GB</span>
                    </div>
                    <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (gpu.vramUsedGb / gpu.vramTotalGb) > 0.85 ? 'bg-red-500' :
                          (gpu.vramUsedGb / gpu.vramTotalGb) > 0.6 ? 'bg-amber-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(100, (gpu.vramUsedGb / gpu.vramTotalGb) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Running model info */}
          {hwStats?.modelHardwareInfo && (
            <div className="col-span-2 flex items-center justify-between text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-800">
              <span>Loaded: <span className="text-gray-700 dark:text-gray-300 font-medium">{hwStats.modelHardwareInfo.name}</span></span>
              <div className="flex items-center gap-2">
                {hwStats.modelHardwareInfo.gpuLayers && <span>{hwStats.modelHardwareInfo.gpuLayers} GPU layers</span>}
                {hwStats.modelHardwareInfo.sizeVram && <span>VRAM: {hwStats.modelHardwareInfo.sizeVram}</span>}
              </div>
            </div>
          )}

          {!hwStats && loadingHw && (
            <div className="col-span-2 text-gray-400 dark:text-gray-600 text-center py-1">
              Loading hardware stats…
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LocalModelStats;
