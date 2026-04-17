// useLocalModelStatus.js — lightweight hook that polls the llama-server status
// Used by MessageInputV2 to know which model is loaded (for Think detection etc.)
import { useState, useEffect } from 'react';
import { llamaServerApi } from '../../Settings/settingApi.js';

// Models known to emit <think>...</think> blocks natively
const THINKING_PATTERNS = /qwq|deepseek.?r1|r1.?distill|qvq|thinking|reasoner|marco.?o1|sky.?t1/i;

export function modelSupportsThinking(modelFilename) {
  return THINKING_PATTERNS.test(modelFilename || '');
}

export function useLocalModelStatus() {
  const [localStatus, setLocalStatus] = useState({ status: 'idle', model: null, ctxSize: 8192 });

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const s = await llamaServerApi.getStatus();
        if (mounted) {
          setLocalStatus(s);
          // Persist last known model so "Start last model" button works after server stops
          if (s.status === 'ready' && s.model) {
            localStorage.setItem('asyncat-last-model', s.model);
          }
        }
      } catch { /* server not reachable — keep last known state */ }
    };

    poll();
    const id = setInterval(poll, 6000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return {
    ...localStatus,
    isReady:          localStatus.status === 'ready',
    supportsThinking: modelSupportsThinking(localStatus.model),
    ctxSize:          localStatus.ctxSize ?? 8192,
  };
}
