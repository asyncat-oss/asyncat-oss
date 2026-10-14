// Speaking → Try it: hear the chosen voice read a sentence, the default one
// or your own (up to 300 characters). Playing never changes the voice.

import { useState } from 'react';
import PropTypes from 'prop-types';
import { Play, Square } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { mediaApi } from './mediaApi.js';
import { usePlayer } from './usePlayer.js';

export const PREVIEW_TEXT = 'Hello! This is how I sound when I read your answers aloud.';
const MAX_LENGTH = 300;

/**
 *   <PropertyRow label="Try it" value={<SpeakTest tts={status.tts} />} />
 *
 * `tts` is the speaking status: its provider and the voice in use (a path on
 * this computer, a voice id with a service).
 */
export default function SpeakTest({ tts = null }) {
  const player = usePlayer();
  const [text, setText] = useState('');
  const playing = player.playing === 'speak';
  const voice = tts?.provider === 'local' ? tts?.voice?.path : tts?.voice?.id;

  const play = (event) => {
    event?.preventDefault();
    if (playing) {
      player.stop();
      return;
    }
    const sentence = text.trim() || PREVIEW_TEXT;
    player.play('speak', () => mediaApi.voice.preview({ provider: tts?.provider || 'local', voice, text: sentence }));
  };

  return (
    <div className="min-w-0 space-y-1.5" data-speak-test>
      <form className="flex min-w-0 items-center gap-2" onSubmit={play}>
        <Input
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_LENGTH))}
          maxLength={MAX_LENGTH}
          placeholder={PREVIEW_TEXT}
          aria-label="Words to hear"
          className="h-8 min-w-0 flex-1"
        />
        <Button type="submit" size="sm" icon={playing ? Square : Play} loading={player.loading === 'speak'}>
          {playing ? 'Stop' : 'Play'}
        </Button>
      </form>
      {player.error ? <p role="alert" className="text-[12px] leading-5 text-red-600 dark:text-red-400">{player.error}</p> : null}
    </div>
  );
}

SpeakTest.propTypes = {
  tts: PropTypes.shape({
    provider: PropTypes.string,
    voice: PropTypes.shape({ path: PropTypes.string, id: PropTypes.string }),
  }),
};
