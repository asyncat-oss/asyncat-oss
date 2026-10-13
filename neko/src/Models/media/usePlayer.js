import { useCallback, useEffect, useRef, useState } from 'react';

/** One sound at a time: play(key, url or () => Promise<url>), stop(). */
export function usePlayer() {
  const audioRef = useRef(null);
  const requestRef = useRef(0);
  const [playing, setPlaying] = useState(null);
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
    }
    audioRef.current = null;
    setPlaying(null);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(async (key, source) => {
    stop();
    // A newer play wins; what the older one ran into doesn't count.
    requestRef.current += 1;
    const request = requestRef.current;
    setError('');
    setLoading(key);
    try {
      const url = typeof source === 'function' ? await source() : source;
      if (request !== requestRef.current) return;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { if (audioRef.current === audio) stop(); };
      await audio.play();
      if (request === requestRef.current) setPlaying(key);
    } catch (err) {
      if (request !== requestRef.current || err?.name === 'AbortError') return;
      setError(err.message || "Couldn't play it.");
      stop();
    } finally {
      if (request === requestRef.current) setLoading(null);
    }
  }, [stop]);

  return { playing, loading, error, play, stop };
}
