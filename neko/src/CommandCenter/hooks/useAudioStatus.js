// useAudioStatus.js — polls Whisper STT and Piper TTS status for conditional UI display
import { useState, useEffect, useRef } from 'react';
import { audioApi } from '../../Settings/settingApi.js';

const POLL_INTERVAL = 10_000; // 10s

export const useAudioStatus = () => {
  const [sttReady, setSttReady] = useState(false);
  const [ttsReady, setTtsReady] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const poll = async () => {
      if (!mountedRef.current) return;
      try {
        const [wStatus, tStatus] = await Promise.all([
          audioApi.whisper.getStatus().catch(() => ({ status: 'idle' })),
          audioApi.tts.getStatus().catch(() => ({ status: 'idle' })),
        ]);
        if (!mountedRef.current) return;
        setSttReady(wStatus.status === 'ready');
        setTtsReady(tStatus.status === 'ready');
      } catch {
        // Ignore errors silently
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  return { sttReady, ttsReady };
};

export default useAudioStatus;
