// HardwareWidget.jsx — Compact hardware stats widget for the sidebar
// Shows CPU%, RAM, GPU% with live polling when expanded
// Only visible when the built-in llama.cpp server is running (ready or loading)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Cpu, Zap, Activity, ChevronDown, ChevronUp, Server, Loader2 } from 'lucide-react';
import { llamaServerApi, aiProviderApi } from '../Settings/settingApi.js';
import { tokenTracker } from '../CommandCenter/components/LocalModelStats.jsx';

const MiniBar = ({ value, color = 'bg-indigo-500', max = 100 }) => {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  const barColor = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : color;
  return (
    <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex-1">
      <div
        className={`h-full ${barColor} rounded-full transition-all duration-700`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

const HardwareWidget = () => {
  const [llamaStatus, setLlamaStatus] = useState({ status: 'idle', model: null });
  const [stats, setStats] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokensPerSec, setTokensPerSec] = useState(null);
  const intervalRef = useRef(null);
  const llamaPollRef = useRef(null);

  // Poll llama server status to know when to show/hide the widget
  useEffect(() => {
    llamaServerApi.getStatus().then(snap => setLlamaStatus(snap)).catch(() => {});

    llamaPollRef.current = setInterval(() => {
      llamaServerApi.getStatus().then(snap => setLlamaStatus(snap)).catch(() => {});
    }, 3000);

    return () => clearInterval(llamaPollRef.current);
  }, []);

  // Subscribe to token tracker for live tok/s
  useEffect(() => {
    const unsub = tokenTracker.subscribe(event => {
      if (event.type === 'start') setTokensPerSec(null);
      else if (event.type === 'token') setTokensPerSec(event.tokensPerSec);
      else if (event.type === 'end') setTokensPerSec(event.avgTps);
    });
    return unsub;
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await aiProviderApi.getStats();
      if (res.success) setStats(res);
    } catch { /* ignore */ }
  }, []);

  // Poll hardware stats — fast when expanded, slow when collapsed
  useEffect(() => {
    setLoading(true);
    fetchStats().finally(() => setLoading(false));
    intervalRef.current = setInterval(fetchStats, expanded ? 4000 : 15000);
    return () => clearInterval(intervalRef.current);
  }, [expanded, fetchStats]);

  const modelActive = llamaStatus.status === 'ready' || llamaStatus.status === 'loading';
  const cpu = stats?.hardware?.cpu;
  const ram = stats?.hardware?.ram;
  const gpu = stats?.hardware?.gpu?.[0];

  // Don't render until we have something to show
  if (!stats && !modelActive) return null;

  const modelShort = llamaStatus.model?.replace(/\.(gguf|bin)$/, '') || 'local';

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 midnight:border-gray-800">
      {/* Compact header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-gray-800 transition-colors text-left"
      >
        {llamaStatus.status === 'loading'
          ? <Loader2 className="w-3 h-3 text-indigo-500 flex-shrink-0 animate-spin" />
          : modelActive
            ? <Server className="w-3 h-3 text-green-500 flex-shrink-0" />
            : <Activity className="w-3 h-3 text-gray-400 flex-shrink-0" />
        }
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 midnight:text-gray-400 truncate flex-1">
          {llamaStatus.status === 'loading' ? 'Loading model…' : modelActive ? modelShort : 'Hardware'}
        </span>

        {/* Quick stats inline */}
        {!expanded && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {tokensPerSec !== null && (
              <span className="text-[10px] font-mono text-yellow-500">
                {tokensPerSec} t/s
              </span>
            )}
            {gpu && (
              <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
                GPU {gpu.utilizationPercent}%
              </span>
            )}
            {!gpu && ram && (
              <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
                {ram.usedGb}/{ram.totalGb}G
              </span>
            )}
          </div>
        )}

        {expanded
          ? <ChevronUp className="w-3 h-3 text-gray-400 flex-shrink-0" />
          : <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
        }
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2.5">
          {loading && !stats && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-1">
              Loading…
            </div>
          )}

          {/* CPU */}
          {cpu && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                  <Cpu className="w-2.5 h-2.5" />
                  <span className="truncate max-w-[100px]">{cpu.model?.split('@')[0]?.trim() || 'CPU'}</span>
                </div>
                <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{cpu.usagePercent}%</span>
              </div>
              <MiniBar value={cpu.usagePercent} color="bg-blue-500" />
            </div>
          )}

          {/* RAM */}
          {ram && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 dark:text-gray-400">RAM</span>
                <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                  {ram.usedGb}/{ram.totalGb} GB
                </span>
              </div>
              <MiniBar value={ram.usagePercent} color="bg-indigo-500" />
            </div>
          )}

          {/* GPU */}
          {gpu && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                  <Zap className="w-2.5 h-2.5 text-yellow-500" />
                  <span className="truncate max-w-[100px]">{gpu.name?.split(' ').slice(0, 2).join(' ') || 'GPU'}</span>
                </div>
                <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                  {gpu.utilizationPercent}%
                  {gpu.temperatureC ? ` · ${gpu.temperatureC}°` : ''}
                </span>
              </div>
              <MiniBar value={gpu.utilizationPercent} color="bg-yellow-500" />
              {gpu.vramTotalGb > 0 && (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between">
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

          {/* No GPU */}
          {stats && !gpu && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <Activity className="w-2.5 h-2.5" />
              Running on CPU
            </div>
          )}

          {/* Running model info */}
          {stats?.modelHardwareInfo && (
            <div className="pt-1 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500">
              <span className="font-medium text-gray-600 dark:text-gray-400">{stats.modelHardwareInfo.name}</span>
              {stats.modelHardwareInfo.sizeVram && <span className="ml-1">· {stats.modelHardwareInfo.sizeVram} VRAM</span>}
              {stats.modelHardwareInfo.gpuLayers && <span className="ml-1">· {stats.modelHardwareInfo.gpuLayers} GPU layers</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HardwareWidget;
