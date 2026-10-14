// The one sound playing on the page. Every play button shares it, so a
// sound started anywhere stops the one playing elsewhere, and each caller
// (an "owner") sees only its own sound as playing, loading or failed.

/**
 *   const player = createPlayer();
 *   player.play(owner, 'lessac', () => fetchSoundUrl());
 *   player.snapshot()  // { owner, key, playing, loading, error, errorOwner }
 *   player.stop(owner) // stops it only if it is this owner's
 *
 * `createAudio` and `revoke` stand in for `new Audio(url)` and
 * URL.revokeObjectURL in tests.
 */
export function createPlayer({
  createAudio = (url) => new Audio(url),
  revoke = (url) => URL.revokeObjectURL(url),
} = {}) {
  let audio = null;
  let request = 0;
  let state = { owner: null, key: null, playing: false, loading: false, error: '', errorOwner: null };
  const listeners = new Set();

  const set = (next) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };
  const forget = (url) => {
    if (String(url || '').startsWith('blob:')) revoke(url);
  };
  const release = () => {
    if (audio) {
      audio.pause();
      forget(audio.src);
    }
    audio = null;
  };

  /** Stop whatever plays; a sound still loading never starts. */
  const stopAll = () => {
    request += 1;
    release();
    if (state.owner !== null) set({ owner: null, key: null, playing: false, loading: false });
  };

  /** Play `source` (a URL, or a function resolving to one) for `owner`, stopping any other sound first. */
  const play = async (owner, key, source) => {
    release();
    request += 1;
    const mine = request;
    set({ owner, key, playing: false, loading: true, error: '', errorOwner: null });
    try {
      const url = typeof source === 'function' ? await source() : source;
      // A newer play, or a stop, came first: this one doesn't start.
      if (mine !== request) {
        forget(url);
        return;
      }
      const sound = createAudio(url);
      audio = sound;
      sound.onended = () => {
        if (audio === sound) stopAll();
      };
      await sound.play();
      if (mine === request) set({ playing: true, loading: false });
    } catch (err) {
      if (mine !== request) return;
      release();
      const error = err?.name === 'AbortError' ? '' : err?.message || "Couldn't play it.";
      set({ owner: null, key: null, playing: false, loading: false, error, errorOwner: error ? owner : null });
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => state,
    play,
    /** Stop the sound if it is `owner`'s; another caller's keeps playing. */
    stop(owner) {
      if (state.owner === owner) stopAll();
    },
    stopAll,
  };
}

/** The page's player. */
export const player = createPlayer();
