// useModelConfig.js — persisted local model context settings
import { useState, useCallback } from 'react';

export const DEFAULT_MODEL_CONTEXT_CONFIG = {
  ctx_size: 32768,
};

const STORAGE_KEY = 'asyncat_model_config';

function normalizeCtxSize(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 512 ? Math.floor(n) : DEFAULT_MODEL_CONTEXT_CONFIG.ctx_size;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MODEL_CONTEXT_CONFIG };

    const parsed = JSON.parse(raw);
    return {
      ctx_size: normalizeCtxSize(parsed?.ctx_size),
    };
  } catch {
    return { ...DEFAULT_MODEL_CONTEXT_CONFIG };
  }
}

function save(cfg) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ctx_size: normalizeCtxSize(cfg?.ctx_size),
    }));
  } catch {
    // localStorage can be unavailable in private/embedded contexts.
  }
}

export function useModelConfig() {
  const [config, setConfigState] = useState(load);

  const setConfig = useCallback((patch) => {
    setConfigState(prev => {
      const next = {
        ctx_size: normalizeCtxSize(patch?.ctx_size ?? prev.ctx_size),
      };
      save(next);
      return next;
    });
  }, []);

  return { config, setConfig };
}
