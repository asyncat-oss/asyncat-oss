// Models → Voice: one settings column. Listening and Speaking each say
// where they run and what they use, and change in place; the first run
// offers what suits this computer with one download button and its size;
// a setup shows its progress on the rows and carries on when the page
// closes; and Model files lists every listening model and voice here.

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { errorDetail, useToast } from '../../components/toastContext.js';
import { useNetworkStatus } from '../../hooks/useNetworkStatus.js';
import { useManagedRuntime } from '../useManagedRuntime.js';
import AddFileDialog from './AddFileDialog.jsx';
import { ChooserScope } from './ChooserRow.jsx';
import { ChooserScopeContext } from './chooserScope.js';
import { downloadLabel } from './choosers/choices.js';
import { usePlan } from './choosers/usePlan.js';
import HuggingFaceDialog from './HuggingFaceDialog.jsx';
import ModelFiles from './ModelFiles.jsx';
import { FirstRunAction, FirstRunIntro, OfflineNotice, StatusLines } from './SetupParts.jsx';
import VoiceGroup from './VoiceGroup.jsx';
import { mediaApi } from './mediaApi.js';
import { baseName, userLanguage } from './mediaFormat.js';
import { notifyEnginesChanged, notifyVoiceChanged, onEvents } from './notify.js';
import { useDownloads } from './useDownloads.js';
import { useMediaSetup } from './useMediaSetup.js';
import { useModelFiles } from './useModelFiles.js';
import {
  downloadBlockedReason, failedRow, firstRunAction, firstRunOptions, firstRunPicks, isFirstRun, leftOutText, rowSteps, setupNames, setupOutcome,
  voiceStatusLines,
} from './voiceView.js';

const DONE_LINE_MS = 4000;
const NO_DRAFTS = { stt: null, tts: null };

// Each group's own rows of a plan or a setup: { engine, file }. A setup's
// step that found its file or engine already here leaves its row as it is.
function groupSteps(rows, kind) {
  if (!rows) return null;
  const shown = (step) => (step && step.status !== 'skipped' ? step : null);
  const steps = kind === 'stt'
    ? { engine: shown(rows.sttEngine), file: shown(rows.sttModel) }
    : { engine: shown(rows.ttsEngine), file: shown(rows.ttsVoice) };
  return steps.engine || steps.file ? steps : null;
}

function VoiceSettings({ highlight, refreshKey }) {
  const toast = useToast();
  const scope = useContext(ChooserScopeContext);
  const { online } = useNetworkStatus();
  const offline = !online;
  const { status, catalog, job, error: loadError, loading, reload, setJob } = useMediaSetup('voice');
  const files = useModelFiles('voice');
  const { downloads, cancel: cancelDownload } = useDownloads('audio/', { job });
  const whisperRuntime = useManagedRuntime('whisper').runtime;
  const piperRuntime = useManagedRuntime('piper').runtime;
  const language = useMemo(() => userLanguage(), []);
  const [drafts, setDrafts] = useState(NO_DRAFTS);
  const [picks, setPicks] = useState(NO_DRAFTS);
  const [followedId, setFollowedId] = useState(null);
  const [quietId, setQuietId] = useState(null);
  const [starting, setStarting] = useState(false);
  const [planTry, setPlanTry] = useState(0);
  const [dialog, setDialog] = useState(null); // { type: 'hf' | 'file', scope }

  const running = job?.status === 'running';
  const firstRun = isFirstRun(status, job);

  // A setup seen running here (started here, elsewhere, or before the page
  // opened) is followed: its outcome is said when it ends.
  useEffect(() => {
    if (running && job.id !== followedId) setFollowedId(job.id);
  }, [running, job?.id, followedId]);

  const outcome = setupOutcome(job, { followedId, quietId, status });
  // The files a finished setup brought and the engines it installed show everywhere.
  const finishedId = job && job.id === followedId && !running ? job.id : null;
  useEffect(() => {
    if (finishedId) notifyVoiceChanged();
  }, [finishedId]);
  // "Voice is set up" (or the part set up) shows for a few seconds.
  const completedId = outcome === 'complete' ? job.id : null;
  useEffect(() => {
    if (!completedId) return undefined;
    setPicks(NO_DRAFTS);
    const timer = setTimeout(() => setQuietId(completedId), DONE_LINE_MS);
    return () => clearTimeout(timer);
  }, [completedId]);

  // Settings change in other windows too: look again when this one gets focus.
  useEffect(() => onEvents(['focus'], () => reload()), [reload]);

  const options = useMemo(
    () => (firstRun ? firstRunOptions({ status, catalog, picks, drafts, language }) : null),
    [firstRun, status, catalog, picks, drafts, language],
  );
  // An engine installed meanwhile (with the system's package manager, say) is planned again.
  const enginesHere = `${Boolean(status?.stt?.engine)}${Boolean(status?.tts?.engine)}`;
  const plan = usePlan(
    options ? `${JSON.stringify(options)}#${enginesHere}#${planTry}` : null,
    () => mediaApi.voice.plan(options).then((res) => res.plan),
  );
  // A part whose engine can't be downloaded is left out of the download.
  const action = firstRunAction(options, plan.plan);
  const leftOut = action?.leftOut || [];
  const engineUnchecked = leftOut.some((item) => !item.unavailable);
  // "Download about 126 MB and set up speaking" when listening is left out.
  const setUpWhat = action?.part ? `set up ${action.part}` : 'set up';
  const actionLabel = downloadLabel(plan.plan ? action : null, null, setUpWhat) || (action?.part ? `Set up ${action.part}` : 'Set up');
  const planRows = plan.plan ? rowSteps(plan.plan.steps) : null;
  const jobRows = running ? rowSteps(job.steps) : null;
  const failed = outcome === 'error' ? failedRow(job) : null;
  const names = running ? setupNames(catalog, job.options) : null;
  const shownPicks = firstRun ? firstRunPicks({ status, catalog, picks, language }) : null;
  const downloadBlocked = downloadBlockedReason({ offline, running });

  // A setup speaks for the rows it changes: a chooser open there closes.
  const closeChooser = scope?.setOpenId;
  useEffect(() => {
    if (running) closeChooser?.(null);
  }, [running, closeChooser]);

  // A part with nothing to use opens its chooser, once (not while a setup
  // that stopped asks to be tried again).
  const openedRef = useRef(new Set());
  useEffect(() => {
    if (!status || !catalog || firstRun || running || outcome || !scope || scope.openId) return;
    const wants = [
      ['stt', 'stt-model', status.stt.provider === 'local' && !status.stt.model],
      ['tts', 'tts-voice', status.tts.provider === 'local' && !status.tts.voice],
    ].find(([kind, , missing]) => missing && !drafts[kind] && !openedRef.current.has(kind));
    if (!wants) return;
    openedRef.current.add(wants[0]);
    scope.setOpenId(wants[1]);
  }, [status, catalog, firstRun, running, outcome, scope, drafts]);

  const follow = useCallback((started) => {
    if (!started?.id) return;
    setFollowedId(started.id);
    setJob(started);
  }, [setJob]);

  const startSetup = async (setupOptions) => {
    if (!setupOptions || starting) return;
    setStarting(true);
    try {
      const res = await mediaApi.voice.setup(setupOptions);
      follow(res.job);
    } catch (err) {
      toast.error("Couldn't start the setup", { detail: errorDetail(err) });
      // One already running (from another window, say) shows up instead.
      reload();
    } finally {
      setStarting(false);
    }
  };

  const cancelSetup = async () => {
    if (!job?.id) return;
    try {
      const res = await mediaApi.setup.cancel(job.id);
      if (res?.job) setJob(res.job);
    } catch (err) {
      toast.error("Couldn't cancel the setup", { detail: errorDetail(err) });
    }
  };

  const choose = async (choice, message) => {
    await mediaApi.voice.choose(choice);
    if (message) toast.success(message);
    notifyVoiceChanged();
    await reload();
  };

  // A first-run pick of a file already here is used at once; any other is
  // only remembered until the download.
  const pickFor = (kind) => async (picked) => {
    if (picked?.path) {
      try {
        await choose(
          kind === 'stt' ? { stt: { provider: 'local', model: picked.path } } : { tts: { provider: 'local', voice: picked.path } },
          `${kind === 'stt' ? 'Listening' : 'Speaking'} now uses ${picked.name || baseName(picked.path)}`,
        );
        setPicks((current) => ({ ...current, [kind]: null }));
      } catch (err) {
        toast.error(`Couldn't switch to ${picked.name || baseName(picked.path)}`, { detail: errorDetail(err) });
      }
      return;
    }
    setPicks((current) => ({
      ...current,
      [kind]: kind === 'stt' ? { value: `catalog:${picked.whisper}`, english: Boolean(picked.english) } : { value: `catalog:${picked.voice}` },
    }));
  };

  const lines = voiceStatusLines({ status, loadError, job, outcome, firstRun, planError: plan.error || (engineUnchecked ? 'engine' : null), drafts });
  const actions = {
    reload,
    cancel: cancelSetup,
    retry: () => startSetup(job?.options),
    setup: () => startSetup(job?.options),
    plan: () => setPlanTry((count) => count + 1),
  };

  const library = files.library;
  const hasFiles = Boolean(library?.whisper?.length || library?.tts?.length) || downloads.length > 0;
  // Hidden only while the first run, and the setup it starts, have nothing on disk yet.
  const settingUp = firstRun || (running && !status?.setUp);
  const showFiles = Boolean(status) && (hasFiles || !settingUp);
  const filesHere = [...(library?.whisper || []), ...(library?.tts || [])].map((file) => file.filename || baseName(file.path));
  const openDialog = (type, dialogScope) => setDialog({ type, scope: dialogScope });
  const reloadFiles = files.reload;
  const changed = useCallback(async () => {
    await Promise.all([reload(), reloadFiles()]);
  }, [reload, reloadFiles]);

  // The page's Refresh: settings, files and engines again.
  useEffect(() => {
    if (!refreshKey) return;
    changed();
    notifyEnginesChanged();
  }, [refreshKey, changed]);

  const group = (kind) => (
    <VoiceGroup
      kind={kind}
      status={status}
      catalog={catalog}
      library={library}
      draft={drafts[kind]}
      onDraft={(draft) => setDrafts((current) => ({ ...current, [kind]: draft }))}
      firstRun={firstRun}
      pick={shownPicks?.[kind] || null}
      onPick={pickFor(kind)}
      plan={firstRun ? { steps: groupSteps(planRows, kind), loading: plan.loading, error: plan.error || null } : null}
      setup={running && groupSteps(jobRows, kind) ? {
        steps: groupSteps(jobRows, kind),
        name: kind === 'stt' ? names?.model : names?.voice,
        language: kind === 'tts' ? names?.language : null,
      } : null}
      failed={failed && failed.row.startsWith(kind) ? { row: /Engine$/.test(failed.row) ? 'engine' : 'file', step: failed.step } : null}
      running={running && Boolean(job.options?.[kind === 'stt' ? 'listen' : 'speak'])}
      downloadBlocked={downloadBlocked}
      unsupportedReason={(kind === 'stt' ? whisperRuntime : piperRuntime)?.unsupportedReason || null}
      onChoose={choose}
      onChanged={changed}
      onSetupStarted={follow}
      onOpenDialog={openDialog}
    />
  );

  const showGroups = Boolean(status) || loading;
  const top = offline || lines.length > 0 || firstRun;

  return (
    <div data-voice-page className="mx-auto max-w-3xl space-y-8">
      {top ? (
        <div className="space-y-3">
          <OfflineNotice offline={offline} />
          <StatusLines lines={lines} actions={actions} />
          {firstRun ? <FirstRunIntro>Voice isn&apos;t set up yet. These suit this computer; change anything before you download.</FirstRunIntro> : null}
        </div>
      ) : null}

      {showGroups ? (
        <>
          {group('stt')}
          {group('tts')}
        </>
      ) : null}

      {running ? (
        <FirstRunAction running />
      ) : firstRun && action ? (
        <FirstRunAction
          label={actionLabel}
          loading={starting || plan.loading}
          blocked={offline ? "You're offline" : null}
          onStart={action.options ? () => startSetup(action.options) : null}
          notes={leftOut.map((item) => leftOutText(item, { alone: !action.options }))}
        />
      ) : null}

      {showFiles ? (
        <ModelFiles
          kind="voice"
          status={status}
          catalog={catalog}
          library={library}
          downloads={downloads}
          onCancelDownload={cancelDownload}
          highlight={highlight}
          offline={offline}
          onChanged={changed}
        />
      ) : null}

      {dialog?.type === 'hf' ? (
        <HuggingFaceDialog open onClose={() => setDialog(null)} scopes={[dialog.scope]} offline={offline} filesHere={filesHere} />
      ) : null}
      {dialog?.type === 'file' ? (
        <AddFileDialog open onClose={() => setDialog(null)} scope={dialog.scope} onAdded={changed} />
      ) : null}
    </div>
  );
}

VoiceSettings.propTypes = { highlight: PropTypes.object, refreshKey: PropTypes.number };

/**
 *   <VoicePage highlight={{ id: 'voice-file-whisper-…', at: Date.now() }} refreshKey={count} />
 *
 * `highlight` flashes a row of Model files, for a search that jumps here; a
 * new `refreshKey` (the page's Refresh) loads everything again.
 */
export default function VoicePage({ highlight = null, refreshKey = 0 }) {
  return (
    <ChooserScope>
      <VoiceSettings highlight={highlight} refreshKey={refreshKey} />
    </ChooserScope>
  );
}

VoicePage.propTypes = { highlight: PropTypes.object, refreshKey: PropTypes.number };
