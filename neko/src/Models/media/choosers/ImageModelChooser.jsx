// How images are made → Model → Change, on this computer: the catalog's
// image models with their size and how they suit the graphics card, and the
// other image models on this computer (never a LoRA or VAE). A model that
// is here is used at once; one that isn't downloads first, with its size on
// the button.

import { useContext, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import RadioGroup from '../../../components/ui/RadioGroup.jsx';
import { errorDetail, useToast } from '../../../components/toastContext.js';
import ActionButton from '../ActionButton.jsx';
import { ChooserFooter } from '../ChooserRow.jsx';
import { ChooserRowContext } from '../chooserScope.js';
import { mediaApi } from '../mediaApi.js';
import { FIT, sizeText } from '../mediaFormat.js';
import { notifyImagesChanged } from '../notify.js';
import { downloadLabel, imageChoices, initialImageChoice, planBlocked } from './choices.js';
import { usePlan } from './usePlan.js';

function startingChoice(catalog, status, draft) {
  if (draft?.path) return `file:${draft.path}`;
  if (draft?.modelId) return `catalog:${draft.modelId}`;
  return initialImageChoice(catalog, status);
}

/**
 *   <ChooserRow id="image-model" label="Model" value="Stable Diffusion 1.5" meta={['1.8 GB']}>
 *     <ImageModelChooser catalog={catalog} library={library} status={status} onChosen={reload} onSetupStarted={followJob} />
 *   </ChooserRow>
 *
 * With `onPick` (first run) choosing only hands back { modelId } or { path }.
 */
export default function ImageModelChooser({
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
  const [selected, setSelected] = useState(() => startingChoice(catalog, status, draft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { models, others } = useMemo(() => imageChoices(catalog, library), [catalog, library]);
  const choice = [...models, ...others].find((option) => option.value === selected) || null;
  const currentPath = status?.provider === 'local' ? status.model?.path : null;
  const needsDownload = Boolean(choice?.id && !choice.path);
  const plan = usePlan(
    !onPick && needsDownload ? choice.id : null,
    () => mediaApi.images.plan(choice.id).then((res) => res.plan),
  );
  // An engine this download can't get: say so, and don't start what would fail at once.
  const blocked = planBlocked(plan.plan);

  const options = [
    ...models.map((model) => {
      const fit = FIT[model.fit] || FIT.unknown;
      return {
        value: model.value,
        label: model.name,
        aside: model.recommended ? 'Recommended' : null,
        description: (
          <>
            {model.note}
            <span className={`block ${fit.className}`}>{fit.label}</span>
          </>
        ),
        meta: model.path ? 'On this computer' : sizeText(model.bytes),
      };
    }),
    ...others.map((file) => ({
      value: file.value,
      label: file.name,
      group: 'Other image models on this computer',
      description: file.missing ? 'File not found' : null,
      meta: sizeText(file.bytes),
      disabled: !file.path,
    })),
  ];

  const use = async () => {
    if (!choice || busy) return;
    if (onPick) {
      onPick(choice.id ? { modelId: choice.id, name: choice.name } : { path: choice.path, name: choice.name });
      close();
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (choice.path) {
        const res = await mediaApi.images.choose({ provider: 'local', model: choice.path });
        toast.success(`Images now use ${choice.name}`);
        notifyImagesChanged();
        await onChosen?.(res.status);
      } else {
        const res = await mediaApi.images.setup(choice.id);
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
    <div data-image-model-chooser>
      <RadioGroup value={selected} onChange={(value) => { setSelected(value); setError(''); }} label="Image model" options={options} maxHeight={360} />
      <ChooserFooter
        primary={primary}
        error={error || (plan.error ? `Couldn't check the download size: ${plan.error}` : blocked?.detail || null)}
        onAddFromHuggingFace={onAddFromHuggingFace}
        onAddFile={onAddFile}
      />
    </div>
  );
}

ImageModelChooser.propTypes = {
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
