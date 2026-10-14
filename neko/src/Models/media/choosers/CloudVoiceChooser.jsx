// Speaking → Voice → Change, with a service: its voices (an ElevenLabs
// account's own ones too), each to hear first, which the service speaks
// with the saved key, and a search above long lists.

import { useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import RadioGroup from '../../../components/ui/RadioGroup.jsx';
import SearchField from '../../../components/ui/SearchField.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import { errorDetail, useToast } from '../../../components/toastContext.js';
import ActionButton from '../ActionButton.jsx';
import { ChooserFooter } from '../ChooserRow.jsx';
import { ChooserRowContext } from '../chooserScope.js';
import PlayButton from '../PlayButton.jsx';
import { mediaApi } from '../mediaApi.js';
import { notifyVoiceChanged } from '../notify.js';
import { usePlayer } from '../usePlayer.js';

const SEARCH_AFTER = 12;

/**
 *   <CloudVoiceChooser provider="openai" service={catalog.cloud.openai} value={status.tts.voice?.id} onChosen={reload} />
 *
 * `value` is the voice in use (or drafted). With `onPick` (the service isn't
 * in use yet) choosing only hands back { voice, name }.
 */
export default function CloudVoiceChooser({ provider, service, value = null, onPick, onChosen }) {
  const toast = useToast();
  const player = usePlayer();
  const { close } = useContext(ChooserRowContext);
  const fromAccount = Boolean(service?.tts?.voicesFromAccount && service?.hasKey);
  const [voices, setVoices] = useState(fromAccount ? null : service?.tts?.voices || []);
  const [selected, setSelected] = useState(value || service?.tts?.defaultVoice || null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!fromAccount) return undefined;
    let cancelled = false;
    mediaApi.voice.elevenLabsVoices()
      .then((res) => { if (!cancelled) setVoices(res?.voices?.length ? res.voices : service?.tts?.voices || []); })
      .catch((err) => {
        if (cancelled) return;
        setVoices(service?.tts?.voices || []);
        setError(`Couldn't load your ${service.title} voices: ${errorDetail(err)}`);
      });
    return () => { cancelled = true; };
  }, [fromAccount, service]);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = voices || [];
    return words.length ? list.filter((voice) => words.every((word) => `${voice.name} ${voice.note || ''}`.toLowerCase().includes(word))) : list;
  }, [voices, query]);
  const choice = (voices || []).find((voice) => voice.id === selected) || null;
  const blocked = service?.hasKey ? null : 'Add your key to hear voices.';

  const options = shown.map((voice) => ({
    value: voice.id,
    label: voice.name,
    // ElevenLabs says how a voice was made: "cloned", "generated"…
    aside: voice.note && voice.note !== 'premade' ? voice.note.charAt(0).toUpperCase() + voice.note.slice(1) : null,
    extra: (
      <PlayButton
        name={voice.name}
        playing={player.playing === voice.id}
        loading={player.loading === voice.id}
        blocked={blocked}
        onPlay={() => player.play(voice.id, () => mediaApi.voice.preview({ provider, voice: voice.id }))}
        onStop={player.stop}
      />
    ),
  }));

  const use = async () => {
    if (!choice || busy) return;
    player.stop();
    if (onPick) {
      onPick({ voice: choice.id, name: choice.name });
      close();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await mediaApi.voice.choose({ tts: { provider, voice: choice.id } });
      toast.success(`Speaking now uses ${choice.name}`);
      notifyVoiceChanged();
      await onChosen?.(res.status);
      close();
    } catch (err) {
      setError(`Couldn't switch to ${choice.name}: ${errorDetail(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const inUse = !onPick && choice?.id === value;
  return (
    <div data-cloud-voice-chooser={provider}>
      {(voices?.length || 0) > SEARCH_AFTER ? (
        <SearchField className="mb-2" size="sm" value={query} onChange={setQuery} placeholder={`Search ${service.title} voices`} />
      ) : null}
      {voices === null ? (
        <div className="space-y-2 rounded-xl border border-line p-3.5" aria-busy="true">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </div>
      ) : options.length ? (
        <RadioGroup value={selected} onChange={(next) => { setSelected(next); setError(''); }} label={`${service.title} voice`} options={options} maxHeight={320} />
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-fg-muted">No voices match.</p>
      )}
      <ChooserFooter
        note={service?.hasKey ? `Hearing a voice uses a little of your ${service.title} credit.` : null}
        error={error || player.error || null}
        primary={(
          <ActionButton variant="primary" size="sm" loading={busy} disabled={!choice || inUse} onClick={use}>
            {inUse ? 'In use' : `Use ${choice?.name || 'it'}`}
          </ActionButton>
        )}
      />
    </div>
  );
}

CloudVoiceChooser.propTypes = {
  provider: PropTypes.string.isRequired,
  service: PropTypes.shape({
    title: PropTypes.string,
    hasKey: PropTypes.bool,
    tts: PropTypes.object,
  }).isRequired,
  value: PropTypes.string,
  onPick: PropTypes.func,
  onChosen: PropTypes.func,
};
