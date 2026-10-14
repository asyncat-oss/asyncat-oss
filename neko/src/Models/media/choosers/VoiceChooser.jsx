// Speaking → Voice → Change, on this computer: Piper's voices grouped by
// language (the user's first), each one to hear before choosing it, and the
// other voices on this computer. A voice that is here is used at once; one
// that isn't downloads first, with its size on the button.

import { useContext, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import RadioGroup from '../../../components/ui/RadioGroup.jsx';
import { errorDetail, useToast } from '../../../components/toastContext.js';
import ActionButton from '../ActionButton.jsx';
import { ChooserFooter } from '../ChooserRow.jsx';
import { ChooserRowContext } from '../chooserScope.js';
import PlayButton from '../PlayButton.jsx';
import { mediaApi, mediaUrl } from '../mediaApi.js';
import { sizeText, userLanguage } from '../mediaFormat.js';
import { notifyVoiceChanged } from '../notify.js';
import { usePlayer } from '../usePlayer.js';
import { downloadLabel, initialVoiceChoice, planBlocked, voiceChoices } from './choices.js';
import { usePlan } from './usePlan.js';

function startingChoice(catalog, status, draft, language) {
  if (draft?.path) return `file:${draft.path}`;
  if (draft?.voice) return `catalog:${draft.voice}`;
  return initialVoiceChoice(catalog, status, language);
}

/**
 *   <ChooserRow id="speaking-voice" label="Voice" value="Lessac" meta={['English (US)']}>
 *     <VoiceChooser catalog={catalog} library={library} status={status} onChosen={reload} onSetupStarted={followJob} />
 *   </ChooserRow>
 *
 * Hearing a voice never chooses it. With `onPick` (first run) choosing only
 * hands back { voice } or { path }.
 */
export default function VoiceChooser({
  catalog,
  library,
  status,
  draft = null,
  onPick,
  onChosen,
  onSetupStarted,
  downloadBlocked = null,
  onAddFromHuggingFace,
  onAddFile,
}) {
  const toast = useToast();
  const player = usePlayer();
  const { close } = useContext(ChooserRowContext);
  const language = userLanguage();
  const [selected, setSelected] = useState(() => startingChoice(catalog, status, draft, language));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { voices, others } = useMemo(() => voiceChoices(catalog, library, language), [catalog, library, language]);
  const choice = [...voices, ...others].find((option) => option.value === selected) || null;
  const currentPath = status?.tts?.provider === 'local' ? status.tts.voice?.path : null;
  const needsDownload = Boolean(choice?.id && !choice.path);
  const plan = usePlan(
    !onPick && needsDownload ? choice.id : null,
    () => mediaApi.voice.plan({ listen: false, speak: true, voice: choice.id, language }).then((res) => res.plan),
  );
  // An engine this download can't get: say so, and don't start what would fail at once.
  const blocked = planBlocked(plan.plan);

  const hear = (option) => (option.path
    ? () => mediaApi.voice.preview({ provider: 'local', voice: option.path })
    : mediaUrl(mediaApi.voice.sampleUrl(option.id)));

  const playButton = (option) => (
    <PlayButton
      name={option.name}
      playing={player.playing === option.value}
      loading={player.loading === option.value}
      onPlay={() => player.play(option.value, hear(option))}
      onStop={player.stop}
    />
  );

  const options = [
    ...voices.map((voice) => ({
      value: voice.value,
      label: voice.name,
      group: voice.group,
      aside: voice.recommended ? 'Recommended' : null,
      description: voice.note,
      meta: voice.path ? 'On this computer' : sizeText(voice.bytes),
      extra: playButton(voice),
    })),
    ...others.map((file) => ({
      value: file.value,
      label: file.name,
      group: 'Other voices on this computer',
      description: file.missing ? 'File not found' : file.incomplete ? 'Missing its settings file' : null,
      meta: sizeText(file.bytes),
      disabled: !file.path,
      extra: file.path ? playButton(file) : null,
    })),
  ];

  const use = async () => {
    if (!choice || busy) return;
    player.stop();
    if (onPick) {
      onPick(choice.id ? { voice: choice.id, name: choice.name } : { path: choice.path, name: choice.name });
      close();
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (choice.path) {
        const res = await mediaApi.voice.choose({ tts: { provider: 'local', voice: choice.path } });
        toast.success(`Speaking now uses ${choice.name}`);
        notifyVoiceChanged();
        await onChosen?.(res.status);
      } else {
        const res = await mediaApi.voice.setup({ listen: false, speak: true, voice: choice.id, language });
        await onSetupStarted?.(res.job);
      }
      close();
    } catch (err) {
      setError(`Couldn't switch to ${choice.name}: ${errorDetail(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const inUse = !onPick && Boolean(choice?.path) && choice.path === currentPath;
  const primary = onPick || choice?.path ? (
    <ActionButton variant="primary" size="sm" loading={busy} disabled={!choice || inUse} onClick={use}>
      {inUse ? 'In use' : `Use ${choice?.name || 'it'}`}
    </ActionButton>
  ) : (
    <ActionButton variant="primary" size="sm" loading={busy || plan.loading} blocked={downloadBlocked || blocked?.button || null} disabled={!choice} onClick={use}>
      {downloadLabel(plan.plan, choice?.bytes) || `Use ${choice?.name || 'it'}`}
    </ActionButton>
  );

  return (
    <div data-voice-chooser>
      <RadioGroup value={selected} onChange={(value) => { setSelected(value); setError(''); }} label="Voice" options={options} maxHeight={320} />
      <ChooserFooter
        primary={primary}
        note={player.error ? null : "Voices you haven't downloaded play a short sample from Hugging Face (about 80 KB, kept after the first play)."}
        error={error || player.error || (plan.error ? `Couldn't check the download size: ${plan.error}` : blocked?.detail || null)}
        onAddFromHuggingFace={onAddFromHuggingFace}
        onAddFile={onAddFile}
      />
    </div>
  );
}

VoiceChooser.propTypes = {
  catalog: PropTypes.object.isRequired,
  library: PropTypes.object,
  status: PropTypes.object,
  draft: PropTypes.object,
  onPick: PropTypes.func,
  onChosen: PropTypes.func,
  onSetupStarted: PropTypes.func,
  downloadBlocked: PropTypes.string,
  onAddFromHuggingFace: PropTypes.func,
  onAddFile: PropTypes.func,
};
