// Whether the ComfyUI the user runs answers, and with which checkpoints,
// samplers and schedulers: asked while ComfyUI is chosen (or being chosen)
// on Models → Images, again on "Check again" and when the window comes back
// into focus.

import { useCallback, useEffect, useRef, useState } from 'react';
import { visualModelsApi } from '../../Settings/settingApi.js';
import { onEvents } from './notify.js';

/**
 *   const comfy = useComfyStatus(provider === 'comfyui');
 *   comfy.status    // { found, baseUrl, checkpoints, samplers, schedulers, error }, or null before the first answer
 *   comfy.checking  // asking now
 *   await comfy.check()  // ask again; resolves to the new status
 */
export function useComfyStatus(active) {
  const [state, setState] = useState({ status: null, checking: false });
  const requestRef = useRef(0);

  const check = useCallback(async () => {
    requestRef.current += 1;
    const request = requestRef.current;
    setState((current) => ({ ...current, checking: true }));
    let status;
    try {
      const res = await visualModelsApi.comfyui.getStatus();
      status = {
        found: Boolean(res?.found),
        baseUrl: res?.baseUrl || null,
        checkpoints: res?.checkpoints || [],
        samplers: res?.samplers || [],
        schedulers: res?.schedulers || [],
        error: res?.error || null,
      };
    } catch (err) {
      status = { found: false, baseUrl: null, checkpoints: [], samplers: [], schedulers: [], error: err.message || "Couldn't reach ComfyUI." };
    }
    // Only the last question's answer counts.
    if (request === requestRef.current) setState({ status, checking: false });
    return status;
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    check();
    return onEvents(['focus'], () => { check(); });
  }, [active, check]);

  return { ...state, check };
}

export default useComfyStatus;
