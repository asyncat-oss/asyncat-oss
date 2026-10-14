// Models → Images → "How images are made": where images are made (this
// computer, a ComfyUI the user runs, or a service), the key of a service,
// the model (chosen in place), the engine and graphics card here, ComfyUI's
// address, status and checkpoint, and, for a change not in use yet, what
// still is with Cancel.

import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import Select from '../../components/ui/Select.jsx';
import { PropertyRow, RowGroup, SettingsSection } from '../../components/ui/Rows.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { formatBytes } from '../../components/ui/progressFormat.js';
import { errorDetail } from '../../components/toastContext.js';
import { configApi } from '../../Settings/settingApi.js';
import ActionButton from './ActionButton.jsx';
import ChooserRow from './ChooserRow.jsx';
import ImageModelChooser from './choosers/ImageModelChooser.jsx';
import DraftFooter from './DraftFooter.jsx';
import EngineRow from './EngineRow.jsx';
import KeyRow from './KeyRow.jsx';
import RunsOnRow from './RunsOnRow.jsx';
import { LoadingRows, PlannedSize, StepRow, ValueWithError } from './SetupParts.jsx';
import { FIT, gpuLine, stepErrorText } from './mediaFormat.js';
import { providerLabel } from './providers.js';
import {
  COMFYUI_ADDRESS, IMAGES_TITLE, checkpointLabel, cleanComfyAddress, comfyStatusText, imageDraftChoice, imageInUse, imageRunsOnChange,
  imagesHint, imagesSwitchedText, pickedImage, serviceModel, serviceModelName,
} from './imagesView.js';

const ERROR_TEXT = 'text-[12px] leading-5 text-red-600 dark:text-red-400';
const WARNING_TEXT = 'text-amber-700 dark:text-amber-400';

const withError = (text, error) => (error ? <ValueWithError error={error}>{text}</ValueWithError> : text);

// What went wrong on a row, under its value.
function RowError({ children }) {
  return <p role="alert" className={`-mt-1.5 sm:pl-36 ${ERROR_TEXT}`}>{children}</p>;
}

RowError.propTypes = { children: PropTypes.node };

// The first run's model: its name, "Recommended", and how it suits the
// graphics card (or what went wrong when a setup stopped on it).
function FirstRunModel({ picked, error = null }) {
  const fit = picked.id ? FIT[picked.fit] || FIT.unknown : null;
  return (
    <span className="block min-w-0">
      <span className="block truncate">
        {picked.name}
        {picked.recommended ? <span className="ml-2 text-[12px] text-fg-subtle">Recommended</span> : null}
      </span>
      {error ? (
        <span role="alert" className={`block whitespace-normal ${ERROR_TEXT}`}>{stepErrorText(error)}</span>
      ) : fit ? (
        <span className={`block text-[12px] leading-5 ${fit.className}`} data-fit={picked.fit}>{fit.label}</span>
      ) : null}
    </span>
  );
}

FirstRunModel.propTypes = { picked: PropTypes.object.isRequired, error: PropTypes.string };

// A service's model: a Select when it has a few (OpenAI), else its name.
function ServiceModelRow({ provider, service, draft, saved, onDraft, onChoose }) {
  const [error, setError] = useState('');
  const models = service.models || [];
  const model = serviceModel(service, { draft, saved });

  const change = async (next) => {
    setError('');
    if (draft) {
      onDraft({ ...draft, model: next });
      return;
    }
    try {
      await onChoose({ provider, model: next }, `Images now use ${serviceModelName(service, next)}`);
    } catch (err) {
      setError(`Couldn't switch to ${serviceModelName(service, next)}: ${errorDetail(err)}`);
    }
  };

  return (
    <PropertyRow
      label="Model"
      data-service-model={provider}
      value={models.length > 1 ? (
        <span className={draft ? 'opacity-70' : ''}>
          <Select
            variant="inline"
            value={model}
            onChange={change}
            options={models.map((item) => ({ value: item.id, label: item.name, description: item.note || undefined }))}
            menuWidth={280}
            aria-label={`${service.title} image model`}
          />
        </span>
      ) : <span className={draft ? 'text-fg-muted' : ''}>{serviceModelName(service, model)}</span>}
      open={Boolean(error)}
    >
      <RowError>{error}</RowError>
    </PropertyRow>
  );
}

ServiceModelRow.propTypes = {
  provider: PropTypes.string.isRequired,
  service: PropTypes.object.isRequired,
  draft: PropTypes.object,
  saved: PropTypes.string,
  onDraft: PropTypes.func.isRequired,
  onChoose: PropTypes.func.isRequired,
};

// ComfyUI's rows: its address (changed in place), whether it answers, and
// the checkpoint it draws with. There is no Engine row: the user runs it.
function ComfyRows({ status, comfy, draft, onDraft, onChoose, fallback = null, disabled = false }) {
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [checkpointError, setCheckpointError] = useState('');
  const info = comfy.status;
  const shownAddress = info?.baseUrl || COMFYUI_ADDRESS;
  const line = comfy.checking && !info ? null : comfyStatusText(info, { fallback });
  const checkpoints = info?.found ? info.checkpoints || [] : [];
  const checkpoint = draft?.model || (checkpoints.includes(status.checkpoint) ? status.checkpoint : checkpoints[0]) || null;

  const startEdit = () => {
    setAddress(shownAddress);
    setAddressError('');
    setEditing(true);
  };
  const stopEdit = () => {
    setEditing(false);
    setAddressError('');
  };

  const saveAddress = async (event) => {
    event?.preventDefault();
    const cleaned = cleanComfyAddress(address);
    if (cleaned.error) {
      setAddressError(cleaned.error);
      return;
    }
    setSaving(true);
    try {
      await configApi.updateConfig('COMFYUI_BASE_URL', cleaned.value);
      stopEdit();
      await comfy.check();
    } catch (err) {
      setAddressError(`Couldn't save the address: ${errorDetail(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const changeCheckpoint = async (name) => {
    setCheckpointError('');
    if (draft) {
      onDraft({ ...draft, model: name });
      return;
    }
    try {
      await onChoose({ provider: 'comfyui', model: name }, `Images now use ${checkpointLabel(name)}`);
    } catch (err) {
      setCheckpointError(`Couldn't switch to ${checkpointLabel(name)}: ${errorDetail(err)}`);
    }
  };

  let checkpointRow = null;
  if (checkpoints.length) {
    checkpointRow = (
      <PropertyRow
        label="Checkpoint"
        data-comfy-checkpoint
        value={(
          <span className={draft ? 'opacity-70' : ''}>
            <Select
              variant="inline"
              value={checkpoint}
              onChange={changeCheckpoint}
              options={checkpoints.map((name) => ({ value: name, label: checkpointLabel(name) }))}
              disabled={disabled}
              menuWidth={260}
              aria-label="ComfyUI checkpoint"
            />
          </span>
        )}
        open={Boolean(checkpointError)}
      >
        <RowError>{checkpointError}</RowError>
      </PropertyRow>
    );
  } else if (info?.found) {
    checkpointRow = <PropertyRow label="Checkpoint" data-comfy-checkpoint value={<span className="text-fg-muted">None in ComfyUI yet</span>} />;
  } else if (status.checkpoint && !draft) {
    // Saved, and used again once ComfyUI answers.
    checkpointRow = <PropertyRow label="Checkpoint" data-comfy-checkpoint value={<span className="text-fg-muted">{checkpointLabel(status.checkpoint)}</span>} />;
  }

  return (
    <>
      <PropertyRow
        label="Address"
        data-comfy-address
        value={editing ? (
          // On a phone the field takes the line and its buttons go under it.
          <form className="flex min-w-0 flex-wrap items-center gap-2" onSubmit={saveAddress}>
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  stopEdit();
                }
              }}
              placeholder={COMFYUI_ADDRESS}
              aria-label="ComfyUI address"
              autoComplete="off"
              spellCheck={false}
              className="h-8 min-w-0 flex-1 basis-full sm:basis-0"
              // Edit was just pressed: the field is what comes next.
              autoFocus
            />
            <div className="ml-auto flex items-center gap-2">
              <Button type="submit" size="sm" loading={saving}>Save</Button>
              <Button variant="ghost" size="sm" onClick={stopEdit}>Cancel</Button>
            </div>
          </form>
        ) : shownAddress}
        control={editing ? null : <Button variant="ghost" size="sm" disabled={disabled} onClick={startEdit}>Edit</Button>}
        open={Boolean(addressError)}
      >
        <RowError>{addressError}</RowError>
      </PropertyRow>
      <PropertyRow
        label="Status"
        data-comfy-status={info ? (info.found ? 'connected' : 'down') : 'checking'}
        value={line ? (
          <span className={`block whitespace-normal ${line.tone === 'warning' ? WARNING_TEXT : ''}`}>{line.text}</span>
        ) : <Skeleton className="h-4 w-40" />}
        control={<Button variant="ghost" size="sm" loading={comfy.checking} onClick={() => comfy.check()}>Check again</Button>}
      />
      {checkpointRow}
    </>
  );
}

ComfyRows.propTypes = {
  status: PropTypes.object.isRequired,
  comfy: PropTypes.shape({ status: PropTypes.object, checking: PropTypes.bool, check: PropTypes.func.isRequired }).isRequired,
  draft: PropTypes.object,
  onDraft: PropTypes.func.isRequired,
  onChoose: PropTypes.func.isRequired,
  fallback: PropTypes.string,
  disabled: PropTypes.bool,
};

/**
 *   <ImagesGroup status={status} catalog={catalog} library={library} comfy={comfy}
 *     draft={draft} onDraft={setDraft} onChoose={choose} onChanged={reload} … />
 *
 * `firstRun` shows the pick (`pick`, 'catalog:…' or 'file:…', changed
 * through `onPick`) and the sizes of `plan` ({ steps: { engine, model },
 * loading, error }) instead of what is in use. `setup` ({ steps: { engine,
 * model }, name }) is a setup running now; `failed` ({ row: 'engine' |
 * 'model', step }) is where the last one stopped. `comfy` is
 * useComfyStatus(). `onChoose(choice, toast)` saves a choice;
 * `onOpenDialog('hf' | 'file', 'images')` opens Add from Hugging Face or
 * Add a file.
 */
export default function ImagesGroup({
  status,
  catalog,
  library,
  draft = null,
  onDraft,
  firstRun = false,
  pick = null,
  onPick,
  plan = null,
  setup = null,
  failed = null,
  running = false,
  downloadBlocked = null,
  unsupportedReason = null,
  comfy,
  onChoose,
  onChanged,
  onSetupStarted,
  onOpenDialog,
}) {
  const [runsOnError, setRunsOnError] = useState('');
  // The last Runs on choice wins when an earlier one is still being checked.
  const switchRef = useRef(0);

  if (!status || !catalog) {
    return (
      <SettingsSection title={IMAGES_TITLE} hint={imagesHint('local')} data-images-group>
        <LoadingRows count={4} />
      </SettingsSection>
    );
  }

  const cloud = catalog.cloud || {};
  const provider = draft?.provider || status.provider || 'local';
  const service = provider !== 'local' && provider !== 'comfyui' ? cloud[provider] || null : null;
  const addFrom = {
    onAddFromHuggingFace: () => onOpenDialog?.('hf', 'images'),
    onAddFile: () => onOpenDialog?.('file', 'images'),
  };

  const changeRunsOn = async (value) => {
    setRunsOnError('');
    switchRef.current += 1;
    const mine = switchRef.current;
    let comfyFound = false;
    if (value === 'comfyui' && value !== status.provider) {
      // ComfyUI's rows show while it is asked whether it answers.
      onDraft({ provider: 'comfyui', model: null });
      comfyFound = Boolean((await comfy.check())?.found);
      if (mine !== switchRef.current) return;
    }
    const change = imageRunsOnChange(value, { saved: status.provider, cloud, comfyFound });
    if (change.type !== 'choose') {
      onDraft(change.type === 'draft' ? change.draft : null);
      return;
    }
    try {
      await onChoose(change.choice, imagesSwitchedText(value, cloud));
    } catch (err) {
      setRunsOnError(`Couldn't switch to ${providerLabel(value, cloud)}: ${errorDetail(err)}`);
    } finally {
      if (mine === switchRef.current) onDraft(null);
    }
  };

  // The drafted service or ComfyUI is used now (its key is saved, or it answers).
  const applyDraft = async () => {
    try {
      await onChoose(imageDraftChoice(draft), imagesSwitchedText(draft.provider, cloud));
      onDraft(null);
    } catch (err) {
      throw new Error(`Couldn't switch to ${providerLabel(draft.provider, cloud)}: ${errorDetail(err)}`);
    }
  };

  const rows = [
    <RunsOnRow
      key="runs-on"
      kind="image"
      value={provider}
      cloud={cloud}
      unsupportedReason={unsupportedReason}
      onChange={changeRunsOn}
      disabled={running}
      error={runsOnError || null}
    />,
  ];

  if (service) {
    rows.push(
      <KeyRow
        key="key"
        service={provider}
        title={service.title}
        keyName={service.keyName}
        hasKey={Boolean(service.hasKey)}
        tab="images"
        draft={Boolean(draft)}
        onSaved={draft ? applyDraft : onChanged}
        onRemoved={onChanged}
      />,
      <ServiceModelRow
        key="model"
        provider={provider}
        service={service}
        draft={draft}
        saved={!draft && typeof status.model === 'string' ? status.model : null}
        onDraft={onDraft}
        onChoose={onChoose}
      />,
    );
  } else if (provider === 'comfyui') {
    // A ComfyUI that is chosen but down leaves images to the model here, if there is one.
    const fallback = !draft && status.engine && status.model ? imageInUse({ ...status, provider: 'local' }, catalog, library)?.name : null;
    rows.push(
      <ComfyRows key="comfy" status={status} comfy={comfy} draft={draft} onDraft={onDraft} onChoose={onChoose} fallback={fallback} disabled={running} />,
    );
  } else {
    // The model: downloading, picked for the first run, or in use.
    const modelStep = setup?.steps?.model || null;
    const failedModel = failed?.row === 'model' ? failed.step.error : null;
    const chooser = (props) => (
      <ImageModelChooser catalog={catalog} library={library} status={status} downloadBlocked={downloadBlocked} {...addFrom} {...props} />
    );
    if (modelStep) {
      rows.push(<StepRow key="model" label="Model" name={setup.name || 'Image model'} step={modelStep} />);
    } else if (firstRun) {
      const picked = pickedImage(catalog, library, pick);
      rows.push(
        <ChooserRow
          key="model"
          id="image-model"
          label="Model"
          value={<FirstRunModel picked={picked} error={failedModel} />}
          status={<PlannedSize path={picked.path} step={plan?.steps?.model} plan={plan} bytes={picked.bytes} />}
        >
          {chooser({ draft: picked.id ? { modelId: picked.id } : { path: picked.path }, onPick })}
        </ChooserRow>,
      );
    } else {
      const inUse = imageInUse(status, catalog, library);
      let meta = null;
      if (!failedModel && inUse?.bytes) meta = formatBytes(inUse.bytes);
      // Images work without a model here while ComfyUI answers.
      else if (!failedModel && !inUse && status.comfyui) meta = 'ComfyUI is used instead';
      rows.push(
        <ChooserRow key="model" id="image-model" label="Model" value={withError(inUse ? inUse.name : 'No model yet', failedModel)} meta={meta}>
          {chooser({ onChosen: onChanged, onSetupStarted })}
        </ChooserRow>,
      );
    }

    // The engine: installing in a setup, where the last setup stopped, its
    // planned size on the first run, or as it is.
    let engineStep = setup?.steps?.engine || (failed?.row === 'engine' ? failed.step : null);
    if (!engineStep && firstRun && !status.engine) {
      engineStep = plan?.steps?.engine || (plan?.loading ? { done: false, loading: true } : plan?.error ? { done: false, bytes: null } : null);
    }
    rows.push(
      <EngineRow
        key="engine"
        runtimeId="sd"
        enginePath={status.enginePath || null}
        step={engineStep}
        downloadBlocked={downloadBlocked}
        onChanged={onChanged}
      />,
      // A long card name wraps rather than losing its memory size on a phone.
      <PropertyRow key="gpu" label="Graphics card" value={<span className="block">{gpuLine(status.gpu ?? catalog.gpu)}</span>} data-gpu-row />,
    );
  }

  if (draft) {
    let primary = null;
    if (service?.hasKey) {
      // A key saved meanwhile (in another window, say) leaves only using it.
      primary = <Button variant="primary" size="sm" onClick={() => applyDraft().catch((err) => setRunsOnError(err.message))}>Use {service.title}</Button>;
    } else if (provider === 'comfyui') {
      primary = (
        <ActionButton
          variant="primary"
          size="sm"
          blocked={comfy.status?.found ? null : "ComfyUI isn't answering yet"}
          onClick={() => applyDraft().catch((err) => setRunsOnError(err.message))}
        >
          Use ComfyUI
        </ActionButton>
      );
    }
    rows.push(
      <DraftFooter key="draft" current={providerLabel(status.provider, cloud)} onCancel={() => { onDraft(null); setRunsOnError(''); }} primary={primary} />,
    );
  }

  return (
    <SettingsSection title={IMAGES_TITLE} hint={imagesHint(provider, cloud)} data-images-group>
      <RowGroup>{rows}</RowGroup>
    </SettingsSection>
  );
}

ImagesGroup.propTypes = {
  status: PropTypes.object,
  catalog: PropTypes.object,
  library: PropTypes.object,
  draft: PropTypes.object,
  onDraft: PropTypes.func.isRequired,
  firstRun: PropTypes.bool,
  pick: PropTypes.string,
  onPick: PropTypes.func,
  plan: PropTypes.shape({ steps: PropTypes.object, loading: PropTypes.bool, error: PropTypes.string }),
  setup: PropTypes.shape({ steps: PropTypes.object, name: PropTypes.string }),
  failed: PropTypes.shape({ row: PropTypes.string, step: PropTypes.object }),
  running: PropTypes.bool,
  downloadBlocked: PropTypes.string,
  unsupportedReason: PropTypes.string,
  comfy: PropTypes.shape({ status: PropTypes.object, checking: PropTypes.bool, check: PropTypes.func.isRequired }).isRequired,
  onChoose: PropTypes.func.isRequired,
  onChanged: PropTypes.func,
  onSetupStarted: PropTypes.func,
  onOpenDialog: PropTypes.func,
};
