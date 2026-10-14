// Listening → Model → Change: the catalog's listening models (with how big
// each is, or that it is already here), the other listening files on this
// computer, and "English only" for models that have an English file. A
// file that is here is used at once; one that isn't downloads first, with
// its size on the button.

import { useContext, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import Checkbox from '../../../components/ui/Checkbox.jsx';
import RadioGroup from '../../../components/ui/RadioGroup.jsx';
import { errorDetail, useToast } from '../../../components/toastContext.js';
import ActionButton from '../ActionButton.jsx';
import { ChooserFooter } from '../ChooserRow.jsx';
import { ChooserRowContext } from '../chooserScope.js';
import { mediaApi } from '../mediaApi.js';
import { sizeText, userLanguage } from '../mediaFormat.js';
import { notifyVoiceChanged } from '../notify.js';
import { downloadLabel, initialWhisperChoice, planBlocked, whisperChoices } from './choices.js';
import { usePlan } from './usePlan.js';

function startingChoice(catalog, status, draft, language) {
  if (draft?.path) return { value: `file:${draft.path}`, english: Boolean(draft.english) };
  if (draft?.whisper) return { value: `catalog:${draft.whisper}`, english: Boolean(draft.english) };
  return initialWhisperChoice(catalog, status, language);
}

/**
 *   <ChooserRow id="listening-model" label="Model" value="Base (English)">
 *     <WhisperChooser catalog={catalog} library={library} status={status}
 *       onChosen={reload} onSetupStarted={followJob} />
 *   </ChooserRow>
 *
 * With `onPick` (first run: nothing is set up yet) choosing only hands back
 * { whisper, english } or { path } and nothing downloads.
 */
export default function WhisperChooser({
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
  const { close } = useContext(ChooserRowContext);
  const language = userLanguage();
  const [start] = useState(() => startingChoice(catalog, status, draft, language));
  const [selected, setSelected] = useState(start.value);
  const [english, setEnglish] = useState(start.english);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { models, others } = useMemo(() => whisperChoices(catalog, library, { english }), [catalog, library, english]);
  const choice = [...models, ...others].find((option) => option.value === selected) || null;
  const currentPath = status?.stt?.provider === 'local' ? status.stt.model?.path : null;
  const needsDownload = Boolean(choice?.id && !choice.path);
  const plan = usePlan(
    !onPick && needsDownload ? `${choice.id}:${choice.english}` : null,
    () => mediaApi.voice.plan({ listen: true, speak: false, whisper: choice.id, english: choice.english, language }).then((res) => res.plan),
  );
  // An engine this download can't get: say so, and don't start what would fail at once.
  const blocked = planBlocked(plan.plan);

  const options = [
    ...models.map((model) => ({
      value: model.value,
      label: model.title,
      aside: model.recommended ? 'Recommended' : null,
      description: model.note,
      meta: model.path ? 'On this computer' : sizeText(model.bytes),
    })),
    ...others.map((file) => ({
      value: file.value,
      label: file.name,
      group: 'Other files on this computer',
      meta: file.missing ? 'File not found' : sizeText(file.bytes),
      disabled: !file.path,
    })),
  ];

  const use = async () => {
    if (!choice || busy) return;
    if (onPick) {
      onPick(choice.path && !choice.id ? { path: choice.path, name: choice.name } : { whisper: choice.id, english: choice.english, name: choice.name });
      close();
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (choice.path) {
        const res = await mediaApi.voice.choose({ stt: { provider: 'local', model: choice.path } });
        toast.success(`Listening now uses ${choice.name}`);
        notifyVoiceChanged();
        await onChosen?.(res.status);
      } else {
        const res = await mediaApi.voice.setup({ listen: true, speak: false, whisper: choice.id, english: choice.english, language });
        await onSetupStarted?.(res.job);
      }
      close();
    } catch (err) {
      setError(`Couldn't switch to ${choice.name}: ${errorDetail(err)}`);
    } finally {
      setBusy(false);
    }
  };

  let primary;
  if (onPick || choice?.path) {
    const inUse = !onPick && choice?.path === currentPath;
    primary = (
      <ActionButton variant="primary" size="sm" loading={busy} disabled={!choice || inUse} onClick={use}>
        {inUse ? 'In use' : `Use ${choice?.name || 'it'}`}
      </ActionButton>
    );
  } else {
    primary = (
      <ActionButton variant="primary" size="sm" loading={busy || plan.loading} blocked={downloadBlocked || blocked?.button || null} disabled={!choice} onClick={use}>
        {downloadLabel(plan.plan, choice?.bytes) || `Use ${choice?.name || 'it'}`}
      </ActionButton>
    );
  }

  return (
    <div data-whisper-chooser>
      <RadioGroup value={selected} onChange={(value) => { setSelected(value); setError(''); }} label="Listening model" options={options} maxHeight={320} />
      {choice?.hasEnglish ? (
        <Checkbox className="mt-3" checked={english} onChange={setEnglish} label="English only (a little more accurate)" />
      ) : null}
      <ChooserFooter
        primary={primary}
        error={error || (plan.error ? `Couldn't check the download size: ${plan.error}` : blocked?.detail || null)}
        onAddFromHuggingFace={onAddFromHuggingFace}
        onAddFile={onAddFile}
      />
    </div>
  );
}

WhisperChooser.propTypes = {
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
