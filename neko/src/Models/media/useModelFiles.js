// The model files on this computer for Models → Voice (whisper models and
// Piper voices) or Models → Images (image models, LoRAs, VAEs…), reloaded
// when another screen adds, deletes or downloads one, and when the window
// comes back into focus.

import { useCallback, useEffect, useRef, useState } from 'react';
import { audioApi, visualModelsApi } from '../../Settings/settingApi.js';
import { onEvents } from './notify.js';

const EVENTS = {
  voice: ['asyncat-audio-models-updated'],
  images: ['asyncat-visual-models-updated'],
};

/**
 *   const { library, loading, error, reload } = useModelFiles('voice');
 *
 * `library` is GET /audio/models ({ whisper, tts }) for 'voice' and
 * GET /visual/models ({ image, vision }) for 'images'; null until loaded.
 */
export function useModelFiles(kind) {
  const [state, setState] = useState({ library: null, loading: true, error: null });
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    requestRef.current += 1;
    const request = requestRef.current;
    try {
      const res = await (kind === 'voice' ? audioApi.listModels() : visualModelsApi.listModels());
      if (request !== requestRef.current) return;
      setState({ library: res, loading: false, error: null });
    } catch (err) {
      if (request !== requestRef.current) return;
      setState((current) => ({ ...current, loading: false, error: err.message || "Couldn't list the model files." }));
    }
  }, [kind]);

  useEffect(() => {
    reload();
    const off = onEvents([...(EVENTS[kind] || []), 'focus'], () => reload());
    return () => {
      off();
      // A reply that lands after this hook is gone is ignored.
      requestRef.current += 1;
    };
  }, [kind, reload]);

  return { ...state, reload };
}

export default useModelFiles;
