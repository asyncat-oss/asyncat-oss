// One group of Models → Voice, Listening or Speaking: where it runs, the key
// of a service, the model or voice (chosen in place), the engine on this
// computer, a way to try it, and, for a service picked whose key isn't
// saved yet, what is still in use with Cancel.

import { useState } from 'react';
import PropTypes from 'prop-types';
import Button from '../../components/ui/Button.jsx';
import Select from '../../components/ui/Select.jsx';
import { PropertyRow, RowGroup, SettingsSection } from '../../components/ui/Rows.jsx';
import { formatBytes } from '../../components/ui/progressFormat.js';
import { errorDetail } from '../../components/toastContext.js';
import ChooserRow from './ChooserRow.jsx';
import CloudVoiceChooser from './choosers/CloudVoiceChooser.jsx';
import VoiceChooser from './choosers/VoiceChooser.jsx';
import WhisperChooser from './choosers/WhisperChooser.jsx';
import DraftFooter from './DraftFooter.jsx';
import EngineRow from './EngineRow.jsx';
import KeyRow from './KeyRow.jsx';
import MicTest from './MicTest.jsx';
import PlayButton from './PlayButton.jsx';
import RunsOnRow from './RunsOnRow.jsx';
import { LoadingRows, PlannedSize, StepRow, ValueWithError } from './SetupParts.jsx';
import SpeakTest from './SpeakTest.jsx';
import { mediaApi, mediaUrl } from './mediaApi.js';
import { listeningModelName, providerLabel } from './providers.js';
import { usePlayer } from './usePlayer.js';
import {
  GROUP_TITLES, draftChoice, groupHint, listeningInUse, pickedVoice, pickedWhisper, runsOnChange, switchedText, voiceInUse,
} from './voiceView.js';

const ERROR_TEXT = 'text-[12px] leading-5 text-red-600 dark:text-red-400';

const withError = (text, error) => (error ? <ValueWithError error={error}>{text}</ValueWithError> : text);

const pickDraft = {
  stt: (pick) => (String(pick?.value || '').startsWith('file:') ? { path: pick.value.slice(5) } : { whisper: String(pick?.value || '').replace(/^catalog:/, ''), english: Boolean(pick?.english) }),
  tts: (pick) => (String(pick?.value || '').startsWith('file:') ? { path: pick.value.slice(5) } : { voice: String(pick?.value || '').replace(/^catalog:/, '') }),
};

/**
 *   <VoiceGroup kind="stt" status={status} catalog={catalog} library={library}
 *     draft={drafts.stt} onDraft={…} onChoose={choose} onChanged={reload} … />
 *
 * `firstRun` shows the pick (`pick`, changed through `onPick`) and the
 * sizes of `plan` ({ steps: { engine, file }, loading, error }) instead of
 * what is in use. `setup` ({ steps: { engine, file }, name, language }) is
 * a setup running for this group; `failed` ({ row: 'engine' | 'file',
 * step }) is where the last one stopped; `running` says a setup is changing
 * this group now. `onChoose(choice, toast)` saves a
 * choice; `onOpenDialog('hf' | 'file', scope)` opens Add from Hugging Face
 * or Add a file.
 */
export default function VoiceGroup({
  kind,
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
  onChoose,
  onChanged,
  onSetupStarted,
  onOpenDialog,
}) {
  const player = usePlayer();
  const [runsOnError, setRunsOnError] = useState('');
  const [modelError, setModelError] = useState('');
  const title = GROUP_TITLES[kind];
  const listening = kind === 'stt';
  const saved = status?.[kind] || null;
  const cloud = catalog?.cloud || {};
  const provider = draft?.provider || saved?.provider || 'local';
  const service = provider !== 'local' && provider !== 'off' ? cloud[provider] || null : null;
  const scope = listening ? 'listening' : 'speaking';
  const addFrom = {
    onAddFromHuggingFace: () => onOpenDialog?.('hf', scope),
    onAddFile: () => onOpenDialog?.('file', scope),
  };

  if (!saved || !catalog) {
    return (
      <SettingsSection title={title} hint={groupHint(kind, 'local')} data-voice-group={kind}>
        <LoadingRows />
      </SettingsSection>
    );
  }

  const changeRunsOn = async (value) => {
    setRunsOnError('');
    setModelError('');
    const change = runsOnChange(kind, value, { saved: saved.provider, cloud });
    if (change.type !== 'choose') {
      onDraft(change.type === 'draft' ? change.draft : null);
      return;
    }
    onDraft(null);
    try {
      await onChoose(change.choice, switchedText(kind, value, cloud));
    } catch (err) {
      setRunsOnError(`Couldn't switch to ${providerLabel(value, cloud)}: ${errorDetail(err)}`);
    }
  };

  // "Save and use": the key is saved; now the drafted service is used.
  const saveDraft = async () => {
    try {
      await onChoose(draftChoice(kind, draft), switchedText(kind, draft.provider, cloud));
      onDraft(null);
    } catch (err) {
      throw new Error(`Couldn't switch to ${service?.title || draft.provider}: ${errorDetail(err)}`);
    }
  };

  const rows = [
    <RunsOnRow
      key="runs-on"
      kind={kind}
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
        tab="voice"
        draft={Boolean(draft)}
        onSaved={draft ? saveDraft : onChanged}
        onRemoved={onChanged}
      />,
    );
    if (listening) {
      const models = service.stt?.models || [];
      const model = (draft ? draft.model : saved.model) || service.stt?.defaultModel || models[0] || '';
      const changeModel = async (next) => {
        setModelError('');
        if (draft) {
          onDraft({ ...draft, model: next });
          return;
        }
        try {
          await onChoose({ stt: { provider, model: next } }, `Listening now uses ${listeningModelName(next)}`);
        } catch (err) {
          setModelError(`Couldn't switch to ${listeningModelName(next)}: ${errorDetail(err)}`);
        }
      };
      rows.push(
        <PropertyRow
          key="model"
          label="Model"
          data-service-model={provider}
          value={models.length > 1 ? (
            <span className={draft ? 'opacity-70' : ''}>
              <Select
                variant="inline"
                value={model}
                onChange={changeModel}
                options={models.map((id) => ({ value: id, label: listeningModelName(id) }))}
                aria-label={`${service.title} listening model`}
              />
            </span>
          ) : <span className={draft ? 'text-fg-muted' : ''}>{listeningModelName(model)}</span>}
          open={Boolean(modelError)}
        >
          <p role="alert" className={`-mt-1.5 sm:pl-36 ${ERROR_TEXT}`}>{modelError}</p>
        </PropertyRow>,
      );
    } else {
      const voiceId = draft ? draft.voice : saved.voice?.id;
      const listed = (service.tts?.voices || []).find((voice) => voice.id === voiceId);
      const voiceName = listed?.name || (draft ? draft.voiceName : saved.voice?.name) || voiceId || 'Default';
      rows.push(
        <ChooserRow
          key="voice"
          id="tts-voice"
          label="Voice"
          value={draft ? <span className="text-fg-muted">{voiceName}</span> : voiceName}
          status={!draft && service.hasKey && voiceId ? (
            <PlayButton
              name={voiceName}
              playing={player.playing === 'row'}
              loading={player.loading === 'row'}
              onPlay={() => player.play('row', () => mediaApi.voice.preview({ provider, voice: voiceId }))}
              onStop={player.stop}
            />
          ) : null}
        >
          <CloudVoiceChooser
            provider={provider}
            service={service}
            value={voiceId || null}
            onPick={draft ? (picked) => onDraft({ ...draft, voice: picked.voice, voiceName: picked.name }) : undefined}
            onChosen={onChanged}
          />
        </ChooserRow>,
      );
    }
  } else if (provider === 'local') {
    // The model or voice row: downloading, picked for the first run, or in use.
    const fileStep = setup?.steps?.file || null;
    const failedFile = failed?.row === 'file' ? failed.step.error : null;
    if (fileStep) {
      rows.push(
        <StepRow key="file" label={listening ? 'Model' : 'Voice'} name={setup.name || (listening ? 'Listening model' : 'Voice')} meta={listening ? null : [setup.language]} step={fileStep} />,
      );
    } else if (listening) {
      const chooser = (props) => (
        <WhisperChooser catalog={catalog} library={library} status={status} downloadBlocked={downloadBlocked} {...addFrom} {...props} />
      );
      if (firstRun) {
        const picked = pickedWhisper(catalog, library, pick);
        rows.push(
          <ChooserRow
            key="file"
            id="stt-model"
            label="Model"
            value={withError(picked.name, failedFile)}
            meta={!failedFile && picked.recommended ? 'Recommended' : null}
            status={<PlannedSize path={picked.path} step={plan?.steps?.file} plan={plan} bytes={picked.bytes} />}
          >
            {chooser({ draft: pickDraft.stt(pick), onPick })}
          </ChooserRow>,
        );
      } else {
        const inUse = listeningInUse(status, catalog, library);
        rows.push(
          <ChooserRow
            key="file"
            id="stt-model"
            label="Model"
            value={withError(inUse ? inUse.name : 'No model yet', failedFile)}
            meta={!failedFile && inUse?.bytes ? formatBytes(inUse.bytes) : null}
          >
            {chooser({ onChosen: onChanged, onSetupStarted })}
          </ChooserRow>,
        );
      }
    } else {
      const chooser = (props) => (
        <VoiceChooser catalog={catalog} library={library} status={status} downloadBlocked={downloadBlocked} {...addFrom} {...props} />
      );
      const playFor = (voice) => (voice?.path || voice?.id ? (
        <PlayButton
          name={voice.name}
          playing={player.playing === 'row'}
          loading={player.loading === 'row'}
          onPlay={() => player.play('row', voice.path
            ? () => mediaApi.voice.preview({ provider: 'local', voice: voice.path })
            : mediaUrl(mediaApi.voice.sampleUrl(voice.id)))}
          onStop={player.stop}
        />
      ) : null);
      if (firstRun) {
        const picked = pickedVoice(catalog, library, pick);
        rows.push(
          <ChooserRow
            key="file"
            id="tts-voice"
            label="Voice"
            value={withError(picked.name, failedFile)}
            meta={failedFile ? null : [picked.language, picked.recommended ? 'Recommended' : null]}
            status={(
              <span className="flex items-center gap-3">
                {playFor(picked)}
                <PlannedSize path={picked.path} step={plan?.steps?.file} plan={plan} bytes={picked.bytes} />
              </span>
            )}
          >
            {chooser({ draft: pickDraft.tts(pick), onPick })}
          </ChooserRow>,
        );
      } else {
        const inUse = voiceInUse(status, catalog, library);
        rows.push(
          <ChooserRow
            key="file"
            id="tts-voice"
            label="Voice"
            value={withError(inUse ? inUse.name : 'No voice yet', failedFile)}
            meta={failedFile ? null : [inUse?.language, inUse?.bytes ? formatBytes(inUse.bytes) : null]}
            status={playFor(inUse)}
          >
            {chooser({ onChosen: onChanged, onSetupStarted })}
          </ChooserRow>,
        );
      }
    }

    // The engine: installing in a setup, where the last setup stopped, its
    // planned size on the first run (a bar while it is checked, "Size
    // unknown" when it can't be), or as it is.
    let engineStep = setup?.steps?.engine || (failed?.row === 'engine' ? failed.step : null);
    if (!engineStep && firstRun && !saved.engine) {
      engineStep = plan?.steps?.engine || (plan?.loading ? { done: false, loading: true } : plan?.error ? { done: false, bytes: null } : null);
    }
    rows.push(
      <EngineRow
        key="engine"
        runtimeId={listening ? 'whisper' : 'piper'}
        loaded={saved.running === 'ready'}
        enginePath={saved.enginePath || null}
        step={engineStep}
        downloadBlocked={downloadBlocked}
        onChanged={onChanged}
      />,
    );

    if (listening && !firstRun && !setup && status.ffmpeg === false) {
      rows.push(
        <PropertyRow key="ffmpeg" label="Audio files" value="ffmpeg isn't installed" open data-ffmpeg-row>
          <p className="-mt-1.5 text-[12px] leading-5 text-fg-subtle sm:pl-36">
            The mic works without it. Other audio files can&apos;t be transcribed until you install ffmpeg.
          </p>
        </PropertyRow>,
      );
    }
  }

  if (provider !== 'off' && saved.ready && !draft && !setup) {
    rows.push(
      <PropertyRow
        key="try"
        label="Try it"
        data-try-it={kind}
        value={listening ? <MicTest stt={saved} onDone={onChanged} /> : <SpeakTest tts={saved} />}
      />,
    );
  }

  if (draft) {
    // A key saved meanwhile (in another window, say) leaves only using it.
    const useNow = service?.hasKey ? (
      <Button variant="primary" size="sm" onClick={() => saveDraft().catch((err) => setRunsOnError(err.message))}>Use {service.title}</Button>
    ) : null;
    rows.push(
      <DraftFooter key="draft" current={providerLabel(saved.provider, cloud)} onCancel={() => { onDraft(null); setRunsOnError(''); }} primary={useNow} />,
    );
  }

  return (
    <SettingsSection title={title} hint={groupHint(kind, provider)} data-voice-group={kind}>
      <RowGroup>{rows}</RowGroup>
      {player.error ? <p role="alert" className={`mt-2 ${ERROR_TEXT}`}>{player.error}</p> : null}
    </SettingsSection>
  );
}

VoiceGroup.propTypes = {
  kind: PropTypes.oneOf(['stt', 'tts']).isRequired,
  status: PropTypes.object,
  catalog: PropTypes.object,
  library: PropTypes.object,
  draft: PropTypes.object,
  onDraft: PropTypes.func.isRequired,
  firstRun: PropTypes.bool,
  pick: PropTypes.object,
  onPick: PropTypes.func,
  plan: PropTypes.shape({ steps: PropTypes.object, loading: PropTypes.bool, error: PropTypes.string }),
  setup: PropTypes.shape({ steps: PropTypes.object, name: PropTypes.string, language: PropTypes.string }),
  failed: PropTypes.shape({ row: PropTypes.string, step: PropTypes.object }),
  running: PropTypes.bool,
  downloadBlocked: PropTypes.string,
  unsupportedReason: PropTypes.string,
  onChoose: PropTypes.func.isRequired,
  onChanged: PropTypes.func,
  onSetupStarted: PropTypes.func,
  onOpenDialog: PropTypes.func,
};
