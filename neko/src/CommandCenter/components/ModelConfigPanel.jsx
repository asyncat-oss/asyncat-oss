// ModelConfigPanel.jsx — slide-in configuration panel for local model parameters
// Temperature, Top-P, Top-K, Min-P, Repeat Penalty, System Prompt Prefix
import React, { useRef, useEffect } from 'react';
import { X, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { DEFAULT_CONFIG } from '../hooks/useModelConfig.js';

// Generic labeled slider row
function Slider({ label, hint, value, min, max, step, onChange, format = v => v }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-gray-300">
          {label}
        </label>
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400 midnight:text-gray-400 tabular-nums">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full accent-blue-500 cursor-pointer"
      />
      {hint && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-gray-500">{hint}</p>
      )}
    </div>
  );
}

export default function ModelConfigPanel({ config, setConfig, resetConfig, onClose, modelName }) {
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const isModified = JSON.stringify(config) !== JSON.stringify(DEFAULT_CONFIG);

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full right-0 mb-2 w-80 bg-white dark:bg-gray-800 midnight:bg-slate-800 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden"
      style={{ animation: 'slideUp 0.15s ease-out' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 midnight:border-slate-700">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-200">
            Model Config
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isModified && (
            <button
              onClick={resetConfig}
              title="Reset to defaults"
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 midnight:hover:text-gray-300 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Current model */}
      {modelName && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/40 midnight:bg-slate-900/40 border-b border-gray-100 dark:border-gray-700 midnight:border-slate-700">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-0.5">Active model</p>
          <p className="text-xs text-gray-700 dark:text-gray-300 midnight:text-gray-300 font-mono truncate">
            {modelName.replace(/\.(gguf|bin)$/, '')}
          </p>
        </div>
      )}

      {/* Sliders */}
      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">

        {/* Sampling */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 midnight:text-gray-500 mb-3">Sampling</p>
          <div className="space-y-4">
            <Slider
              label="Temperature"
              hint="Higher = more creative, lower = more focused"
              value={config.temperature}
              min={0} max={2} step={0.05}
              format={v => v.toFixed(2)}
              onChange={v => setConfig({ temperature: v })}
            />
            <Slider
              label="Top P"
              hint="Nucleus sampling — 0.9 keeps top 90% of probability mass"
              value={config.top_p}
              min={0} max={1} step={0.01}
              format={v => v.toFixed(2)}
              onChange={v => setConfig({ top_p: v })}
            />
            <Slider
              label="Top K"
              hint="Sample from top K tokens only"
              value={config.top_k}
              min={1} max={200} step={1}
              format={v => String(Math.round(v))}
              onChange={v => setConfig({ top_k: Math.round(v) })}
            />
            <Slider
              label="Min P"
              hint="Minimum probability relative to the top token"
              value={config.min_p}
              min={0} max={0.5} step={0.01}
              format={v => v.toFixed(2)}
              onChange={v => setConfig({ min_p: v })}
            />
            <Slider
              label="Repetition Penalty"
              hint="Discourages repeating the same words"
              value={config.repeat_penalty}
              min={1.0} max={2.0} step={0.05}
              format={v => v.toFixed(2)}
              onChange={v => setConfig({ repeat_penalty: v })}
            />
          </div>
        </div>

        {/* System prompt prefix */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 midnight:text-gray-500 mb-2">System Prompt</p>
          <textarea
            value={config.system_prompt_prefix}
            onChange={e => setConfig({ system_prompt_prefix: e.target.value })}
            placeholder="Optional prefix added before the system prompt (e.g. 'You are a Python expert.')"
            rows={3}
            className="w-full text-xs bg-gray-50 dark:bg-gray-900/50 midnight:bg-slate-900/50 border border-gray-200 dark:border-gray-700 midnight:border-slate-700 rounded-lg px-3 py-2 text-gray-700 dark:text-gray-300 midnight:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 midnight:border-slate-700 bg-gray-50/50 dark:bg-gray-900/20 midnight:bg-slate-900/20">
        <p className="text-[10px] text-gray-400 dark:text-gray-500 midnight:text-gray-500">
          Changes apply to the next message. Stored locally in your browser.
        </p>
      </div>
    </div>
  );
}
