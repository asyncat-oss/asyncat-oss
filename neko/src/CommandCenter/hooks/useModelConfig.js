// useModelConfig.js — per-session model parameter config, persisted in localStorage
import { useState, useCallback } from 'react';

export const DEFAULT_CONFIG = {
  temperature:     0.7,
  top_p:           0.9,
  top_k:           40,
  min_p:           0.05,
  repeat_penalty:  1.1,
  ctx_size:        32768,
  system_prompt_prefix: '',  // injected before the main system prompt
};

const STORAGE_KEY = 'asyncat_model_config';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function save(cfg) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
}

export function useModelConfig() {
  const [config, setConfigState] = useState(load);

  const setConfig = useCallback((patch) => {
    setConfigState(prev => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    const defaults = { ...DEFAULT_CONFIG };
    save(defaults);
    setConfigState(defaults);
  }, []);

  return { config, setConfig, resetConfig };
}
