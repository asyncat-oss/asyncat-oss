// What listens, speaks and makes images right now (GET /media/voice and
// /media/images), for summaries outside Models → Voice and Images. Looks
// again when those settings change, when a setup ends, and on focus.

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeAppEvent } from '../../services/appEvents.js';
import { mediaApi } from './mediaApi.js';
import { IMAGE_EVENTS, VOICE_EVENTS, onEvents } from './notify.js';

/**
 *   const { voice, images } = useMediaStatus(refreshKey);
 *
 * Each is null while it loads, { status, catalog } once it has, and
 * { error } when it couldn't. A new `refreshKey` loads both again.
 */
export function useMediaStatus(refreshKey = 0) {
  const [voice, setVoice] = useState(null);
  const [images, setImages] = useState(null);
  const requests = useRef({ voice: 0, images: 0 });

  const load = useCallback(async (kind) => {
    requests.current[kind] += 1;
    const request = requests.current[kind];
    const set = kind === 'voice' ? setVoice : setImages;
    try {
      const res = await (kind === 'voice' ? mediaApi.voice.get() : mediaApi.images.get());
      if (request === requests.current[kind]) set({ status: res.status, catalog: res.catalog });
    } catch (err) {
      if (request === requests.current[kind]) set({ error: err.message || "Couldn't check." });
    }
  }, []);

  const loadVoice = useCallback(() => load('voice'), [load]);
  const loadImages = useCallback(() => load('images'), [load]);

  useEffect(() => {
    loadVoice();
    loadImages();
  }, [loadVoice, loadImages, refreshKey]);

  useEffect(() => {
    const offVoice = onEvents([...VOICE_EVENTS, 'focus'], loadVoice);
    const offImages = onEvents([...IMAGE_EVENTS, 'focus'], loadImages);
    // A setup that ends anywhere (another window, say) changes what is ready.
    const offSetup = subscribeAppEvent('media.setup', (event) => {
      const job = event?.data?.job;
      if (!job || job.status === 'running') return;
      if (job.kind === 'voice') loadVoice();
      else loadImages();
    });
    const current = requests.current;
    return () => {
      offVoice();
      offImages();
      offSetup();
      // A reply that lands after this hook is gone is ignored.
      current.voice += 1;
      current.images += 1;
    };
  }, [loadVoice, loadImages]);

  return { voice, images };
}

export default useMediaStatus;
