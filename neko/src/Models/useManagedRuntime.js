// The managed engines (whisper.cpp, Piper, stable-diffusion.cpp, MLX) as the
// backend lists them, loaded once and shared by every card on the page.

import { useCallback, useEffect, useState } from 'react';
import { runtimeApi } from '../Settings/settingApi.js';

let listCache = null;
let listInflight = null;
const listeners = new Set();

function loadRuntimes({ fresh = false } = {}) {
  if (fresh) listCache = null;
  if (listCache) return Promise.resolve(listCache);
  if (!listInflight) {
    listInflight = runtimeApi.list()
      .then((res) => {
        listCache = Array.isArray(res?.runtimes) ? res.runtimes : [];
        for (const listener of listeners) listener(listCache);
        return listCache;
      })
      .catch(() => listCache || [])
      .finally(() => { listInflight = null; });
  }
  return listInflight;
}

export function useManagedRuntime(runtimeId) {
  const [runtime, setRuntime] = useState(() => listCache?.find((item) => item.id === runtimeId) || null);
  useEffect(() => {
    const update = (list) => setRuntime(list.find((item) => item.id === runtimeId) || null);
    listeners.add(update);
    loadRuntimes().then(update);
    return () => listeners.delete(update);
  }, [runtimeId]);
  const refresh = useCallback(() => loadRuntimes({ fresh: true }), []);
  return { runtime, refresh };
}

