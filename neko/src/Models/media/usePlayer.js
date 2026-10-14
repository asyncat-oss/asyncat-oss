// Play buttons on the Voice page: one sound at a time across the whole
// page. Starting a sound here stops one playing in any other component,
// whose button goes back to Play.

import { useCallback, useEffect, useId, useSyncExternalStore } from 'react';
import { player } from './player.js';

/**
 *   const sound = usePlayer();
 *   sound.play('lessac', () => mediaApi.voice.preview(…)); sound.stop();
 *   sound.playing === 'lessac', sound.loading, sound.error
 *
 * `playing`, `loading` and `error` are this caller's own: the key it played
 * while that sound plays or loads, and why it couldn't play.
 */
export function usePlayer() {
  const owner = useId();
  const state = useSyncExternalStore(player.subscribe, player.snapshot);
  const mine = state.owner === owner;

  const play = useCallback((key, source) => player.play(owner, key, source), [owner]);
  const stop = useCallback(() => player.stop(owner), [owner]);

  // A sound stops when the button that started it goes away.
  useEffect(() => () => player.stop(owner), [owner]);

  return {
    playing: mine && state.playing ? state.key : null,
    loading: mine && state.loading ? state.key : null,
    error: state.errorOwner === owner ? state.error : '',
    play,
    stop,
  };
}
