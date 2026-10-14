// A small play button for hearing a voice: Play, Stop while it plays, and a
// spinner while the sound loads. Its tooltip says what it does, or why it
// can't.

import PropTypes from 'prop-types';
import { Play, Square } from 'lucide-react';
import IconButton from '../../components/ui/IconButton.jsx';

/**
 *   <PlayButton name="Lessac" playing={player.playing === id} loading={player.loading === id}
 *     onPlay={() => player.play(id, url)} onStop={player.stop} />
 *
 * `blocked` disables it with that reason as the tooltip ("Add your key to
 * hear voices.").
 */
export default function PlayButton({ name, playing = false, loading = false, onPlay, onStop, blocked = null }) {
  const label = playing ? 'Stop' : blocked || `Hear ${name}`;
  return (
    <IconButton
      icon={playing ? Square : Play}
      label={label}
      size="sm"
      loading={loading}
      disabled={Boolean(blocked)}
      aria-pressed={playing}
      data-play={name}
      onClick={(event) => {
        // Inside a choice list: playing a voice never chooses it.
        event.preventDefault();
        event.stopPropagation();
        if (playing) onStop();
        else onPlay();
      }}
    />
  );
}

PlayButton.propTypes = {
  name: PropTypes.string.isRequired,
  playing: PropTypes.bool,
  loading: PropTypes.bool,
  onPlay: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
  blocked: PropTypes.string,
};
