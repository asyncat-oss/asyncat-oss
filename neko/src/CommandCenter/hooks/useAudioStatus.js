// useAudioStatus.js — whether the chat can listen (mic) and speak (read
// answers aloud), with the voice chosen in Models → Voice: on this computer
// (its engine starts when first used) or a cloud service.
import { useState, useEffect, useRef } from 'react';
import { mediaApi } from '../../Models/media/mediaApi.js';
import { subscribeAppEvent } from '../../services/appEvents.js';

const POLL_INTERVAL = 30_000;

export const useAudioStatus = () => {
  const [sttReady, setSttReady] = useState(false);
  const [ttsReady, setTtsReady] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const res = await mediaApi.voice.get();
        if (!mountedRef.current) return;
        setSttReady(Boolean(res.status?.stt?.ready));
        setTtsReady(Boolean(res.status?.tts?.ready));
      } catch {
        // Keep what we had; the next poll tries again.
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    const offSetup = subscribeAppEvent('media.setup', (event) => {
      const job = event?.data?.job;
      if (job?.kind === 'voice' && job.status !== 'running') poll();
    });
    // Choosing a voice elsewhere in the app.
    window.addEventListener('asyncat-voice-changed', poll);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
      offSetup();
      window.removeEventListener('asyncat-voice-changed', poll);
    };
  }, []);

  return { sttReady, ttsReady };
};

export default useAudioStatus;
