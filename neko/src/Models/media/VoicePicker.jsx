// Pick a voice and hear it first: Piper voices (a short sample from the
// voice's own repo, or the voice itself once it is on this computer) or a
// cloud service's voices (spoken by the service).

import PropTypes from 'prop-types';
import { Check, Loader2, Play, Square } from 'lucide-react';
import { formatBytes } from '../engineProgress.js';
import { mediaApi, mediaUrl } from './mediaApi.js';
import { userLanguage, voicesByLanguage } from './mediaFormat.js';
import { usePlayer } from './usePlayer.js';

function PlayButton({ active, loading, onPlay, onStop, label }) {
  return (
    <button
      type="button"
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (active) onStop(); else onPlay(); }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:bg-hover hover:text-fg"
      aria-label={active ? `Stop ${label}` : `Hear ${label}`}
      title={active ? 'Stop' : 'Hear it'}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : active ? <Square className="h-3 w-3" /> : <Play className="h-3.5 w-3.5" />}
    </button>
  );
}

PlayButton.propTypes = { active: PropTypes.bool, loading: PropTypes.bool, onPlay: PropTypes.func.isRequired, onStop: PropTypes.func.isRequired, label: PropTypes.string };

/** Piper voices to download, grouped by language, with samples. */
export function LocalVoicePicker({ voices, value, onChange }) {
  const player = usePlayer();
  const groups = voicesByLanguage(voices, userLanguage());
  const hear = (voice) => (voice.installed
    ? () => mediaApi.voice.preview({ provider: 'local', voice: voice.id })
    : mediaUrl(mediaApi.voice.sampleUrl(voice.id)));
  return (
    <div>
      <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-line p-2" role="radiogroup" aria-label="Voice" data-voice-picker>
        {groups.map((group) => (
          <div key={group.language}>
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{group.language}</p>
            {group.voices.map((voice) => (
              <label key={voice.id} className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 ${value === voice.id ? 'bg-selected' : 'hover:bg-hover'}`}>
                <input type="radio" name="piper-voice" className="h-4 w-4 accent-[var(--as-accent)]" checked={value === voice.id} onChange={() => onChange(voice.id)} />
                <span className="min-w-0 flex-1">
                  <span className="text-[13px] text-fg">{voice.name}</span>
                  {voice.recommended ? <span className="ml-1.5 text-[11px] text-accent">Recommended</span> : null}
                  <span className="block text-[11px] text-fg-subtle">
                    {voice.installed ? 'On this computer' : formatBytes(voice.bytes)}{voice.note ? ` · ${voice.note}` : ''}
                  </span>
                </span>
                {voice.installed ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : null}
                <PlayButton
                  label={voice.name}
                  active={player.playing === voice.id}
                  loading={player.loading === voice.id}
                  onPlay={() => player.play(voice.id, hear(voice))}
                  onStop={player.stop}
                />
              </label>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-fg-subtle">
        {player.error || 'Samples of voices you haven\'t downloaded come from the voice\'s page (about 80 KB each).'}
      </p>
    </div>
  );
}

LocalVoicePicker.propTypes = { voices: PropTypes.array.isRequired, value: PropTypes.string, onChange: PropTypes.func.isRequired };

/** A cloud service's voices; hearing one uses a little of your credit there. */
export function CloudVoicePicker({ provider, voices, value, onChange, canPreview }) {
  const player = usePlayer();
  return (
    <div>
      <div className="grid max-h-60 gap-1 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-2" role="radiogroup" aria-label="Voice">
        {voices.map((voice) => (
          <label key={voice.id} className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 ${value === voice.id ? 'bg-selected' : 'hover:bg-hover'}`}>
            <input type="radio" name={`${provider}-voice`} className="h-4 w-4 accent-[var(--as-accent)]" checked={value === voice.id} onChange={() => onChange(voice.id)} />
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{voice.name}</span>
            {canPreview ? (
              <PlayButton
                label={voice.name}
                active={player.playing === voice.id}
                loading={player.loading === voice.id}
                onPlay={() => player.play(voice.id, () => mediaApi.voice.preview({ provider, voice: voice.id }))}
                onStop={player.stop}
              />
            ) : null}
          </label>
        ))}
      </div>
      {player.error ? <p className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">{player.error}</p> : null}
    </div>
  );
}

CloudVoicePicker.propTypes = {
  provider: PropTypes.string.isRequired,
  voices: PropTypes.array.isRequired,
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  canPreview: PropTypes.bool,
};
