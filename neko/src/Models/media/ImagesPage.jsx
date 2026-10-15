// Models → Images: one settings column. "How images are made" says where
// images are made and with what, and changes in place; the first run offers
// the model that suits the graphics card with one download button and its
// size; a setup shows its progress on the rows and carries on when the page
// closes; Try it makes one with what is chosen, and its heading counts the
// images made and opens them in Files; Model files lists the image models
// and other files here.

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Button from '../../components/ui/Button.jsx';
import { SettingsSection } from '../../components/ui/Rows.jsx';
import { errorDetail, useToast } from '../../components/toastContext.js';
import { useNetworkStatus } from '../../hooks/useNetworkStatus.js';
import { useManagedRuntime } from '../useManagedRuntime.js';
import AddFileDialog from './AddFileDialog.jsx';
import { ChooserScope } from './ChooserRow.jsx';
import { ChooserScopeContext } from './chooserScope.js';
import { downloadLabel } from './choosers/choices.js';
import { usePlan } from './choosers/usePlan.js';
import HuggingFaceDialog from './HuggingFaceDialog.jsx';
import ImagesGroup from './ImagesGroup.jsx';
import ModelFiles from './ModelFiles.jsx';
import { FirstRunAction, FirstRunIntro, OfflineNotice, StatusLines } from './SetupParts.jsx';
import TryImage, { ImagesMade } from './TryImage.jsx';
import { mediaApi } from './mediaApi.js';
import { baseName } from './mediaFormat.js';
import { notifyEnginesChanged, notifyImagesChanged, onEvents } from './notify.js';
import { useComfyStatus } from './useComfyStatus.js';
import { useDownloads } from './useDownloads.js';
import { useMediaSetup } from './useMediaSetup.js';
import { useModelFiles } from './useModelFiles.js';
import { downloadBlockedReason } from './voiceView.js';
import {
  cardIsSmall, failedImageRow, firstRunImagePick, firstRunSetupModel, imageRowSteps, imageRunsOnChange, imagesSetupOutcome, imagesStatusLines,
  imagesSwitchedText, isImagesFirstRun, setupEngineBlocked, setupModelName,
} from './imagesView.js';

const DONE_LINE_MS = 4000;

function ImagesSettings({ highlight, refreshKey }) {
  const toast = useToast();
  const scope = useContext(ChooserScopeContext);
  const { online } = useNetworkStatus();
  const offline = !online;
  const { status, catalog, job, error: loadError, loading, reload, setJob } = useMediaSetup('images');
  const files = useModelFiles('images');
  const { downloads, cancel: cancelDownload } = useDownloads('image', { job });
  const sdRuntime = useManagedRuntime('sd').runtime;
  const [draft, setDraft] = useState(null);
  const [pick, setPick] = useState(null);
  const [followedId, setFollowedId] = useState(null);
  const [quietId, setQuietId] = useState(null);
  const [starting, setStarting] = useState(false);
  const [planTry, setPlanTry] = useState(0);
  const [dialog, setDialog] = useState(null); // { type: 'hf' | 'file' }
  const [made, setMade] = useState(0);

  const provider = draft?.provider || status?.provider || 'local';
  const comfy = useComfyStatus(provider === 'comfyui');
  const running = job?.status === 'running';
  const firstRun = isImagesFirstRun(status, job);

  // A setup seen running here (started here, elsewhere, or before the page
  // opened) is followed: its outcome is said when it ends.
  useEffect(() => {
    if (running && job.id !== followedId) setFollowedId(job.id);
  }, [running, job?.id, followedId]);

  const outcome = imagesSetupOutcome(job, { followedId, quietId, status });
  // The model a finished setup brought and the engine it installed show everywhere.
  const finishedId = job && job.id === followedId && !running ? job.id : null;
  useEffect(() => {
    if (finishedId) notifyImagesChanged();
  }, [finishedId]);
  // "Images are set up" shows for a few seconds.
  const completedId = outcome === 'complete' ? job.id : null;
  useEffect(() => {
    if (!completedId) return undefined;
    setPick(null);
    const timer = setTimeout(() => setQuietId(completedId), DONE_LINE_MS);
    return () => clearTimeout(timer);
  }, [completedId]);

  // Settings change in other windows too: look again when this one gets focus.
  useEffect(() => onEvents(['focus'], () => reload()), [reload]);

  const setupModel = firstRun ? firstRunSetupModel({ status, catalog, pick, draft }) : null;
  // An engine installed meanwhile (with the system's package manager, say) is planned again.
  const plan = usePlan(
    setupModel ? `${setupModel}#${Boolean(status?.engine)}#${planTry}` : null,
    () => mediaApi.images.plan(setupModel).then((res) => res.plan),
  );
  const engineBlocked = setupEngineBlocked(plan.plan);
  const planRows = plan.plan ? imageRowSteps(plan.plan.steps) : null;
  const jobRows = running ? imageRowSteps(job.steps) : null;
  const failed = outcome === 'error' ? failedImageRow(job) : null;
  const downloadBlocked = downloadBlockedReason({ offline, running });

  // A setup speaks for the rows it changes: a chooser open there closes.
  const closeChooser = scope?.setOpenId;
  useEffect(() => {
    if (running) closeChooser?.(null);
  }, [running, closeChooser]);

  const follow = useCallback((started) => {
    if (!started?.id) return;
    setFollowedId(started.id);
    setJob(started);
  }, [setJob]);

  const startSetup = async (modelId) => {
    if (!modelId || starting) return;
    setStarting(true);
    try {
      const res = await mediaApi.images.setup(modelId);
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
    await mediaApi.images.choose(choice);
    if (message) toast.success(message);
    notifyImagesChanged();
    await reload();
  };

  // A first-run pick of a model already here is used at once; any other is
  // only remembered until the download.
  const pickModel = async (picked) => {
    if (picked?.path) {
      const name = picked.name || baseName(picked.path);
      try {
        await choose({ provider: 'local', model: picked.path }, `Images now use ${name}`);
        setPick(null);
      } catch (err) {
        toast.error(`Couldn't switch to ${name}`, { detail: errorDetail(err) });
      }
      return;
    }
    if (picked?.modelId) setPick(`catalog:${picked.modelId}`);
  };

  // A small graphics card: a service instead (waiting for its key if it has none).
  const switchToService = async () => {
    const change = imageRunsOnChange('openai', { saved: status?.provider, cloud: catalog?.cloud || {} });
    if (change.type === 'draft') {
      setDraft(change.draft);
      return;
    }
    if (change.type !== 'choose') return;
    try {
      await choose(change.choice, imagesSwitchedText('openai', catalog?.cloud || {}));
    } catch (err) {
      toast.error("Couldn't switch to OpenAI", { detail: errorDetail(err) });
    }
  };

  const planError = plan.error || (engineBlocked && !engineBlocked.unavailable ? 'engine' : null);
  const lines = imagesStatusLines({ status, loadError, job, outcome, firstRun, planError, draft });
  const actions = {
    reload,
    cancel: cancelSetup,
    retry: () => startSetup(job?.options?.modelId),
    setup: () => startSetup(job?.options?.modelId),
    plan: () => setPlanTry((count) => count + 1),
  };

  // The first run and the setup it starts: only what is being set up shows.
  const settingUp = firstRun || (running && !status?.ready);
  const library = files.library;
  const hasFiles = Boolean(library?.image?.length) || downloads.length > 0;
  const showFiles = Boolean(status) && (hasFiles || !settingUp);
  const filesHere = (library?.image || []).map((file) => file.filename || baseName(file.path));
  const reloadFiles = files.reload;
  const changed = useCallback(async () => {
    await Promise.all([reload(), reloadFiles()]);
  }, [reload, reloadFiles]);

  // The page's Refresh: settings, files, engines and ComfyUI (while it is chosen) again.
  const checkComfyRef = useRef(null);
  useEffect(() => { checkComfyRef.current = provider === 'comfyui' ? comfy.check : null; });
  useEffect(() => {
    if (!refreshKey) return;
    changed();
    notifyEnginesChanged();
    checkComfyRef.current?.();
  }, [refreshKey, changed]);

  const showGroup = Boolean(status) || loading;
  const small = firstRun && cardIsSmall(catalog);
  const top = offline || lines.length > 0 || firstRun;
  // Try it shows once images work, or once they did and need something again.
  const showTry = Boolean(status) && (status.ready || !settingUp);

  return (
    <div data-images-page className="space-y-8">
      {top ? (
        <div className="space-y-3">
          <OfflineNotice offline={offline} />
          <StatusLines lines={lines} actions={actions} />
          {firstRun ? (
            small ? (
              <FirstRunIntro>
                Your graphics card is small for these models. They work, slowly, or you can use a service.
                {draft ? null : <Button variant="ghost" size="xs" className="ml-1" onClick={switchToService}>Use a service</Button>}
              </FirstRunIntro>
            ) : (
              <FirstRunIntro>
                {/* Only the model on this computer downloads anything. */}
                {provider === 'local'
                  ? "Images aren't set up yet. This suits your graphics card; change it before you download."
                  : "Images aren't set up yet."}
              </FirstRunIntro>
            )
          ) : null}
        </div>
      ) : null}

      {showGroup ? (
        <ImagesGroup
          status={status}
          catalog={catalog}
          library={library}
          draft={draft}
          onDraft={setDraft}
          firstRun={firstRun}
          pick={firstRun && catalog ? firstRunImagePick({ status, catalog, pick }) : null}
          onPick={pickModel}
          plan={firstRun ? { steps: planRows, loading: plan.loading, error: plan.error || null } : null}
          setup={running && (jobRows.engine || jobRows.model) ? { steps: jobRows, name: setupModelName(catalog, job.options) } : null}
          failed={failed}
          running={running}
          downloadBlocked={downloadBlocked}
          unsupportedReason={sdRuntime?.unsupportedReason || null}
          comfy={comfy}
          onChoose={choose}
          onChanged={changed}
          onSetupStarted={follow}
          onOpenDialog={(type) => setDialog({ type })}
        />
      ) : null}

      {running ? (
        <FirstRunAction running />
      ) : firstRun && setupModel ? (
        <FirstRunAction
          label={downloadLabel(plan.plan, null, 'set up') || 'Set up'}
          loading={starting || plan.loading}
          blocked={offline ? "You're offline" : null}
          onStart={engineBlocked ? null : () => startSetup(setupModel)}
          notes={engineBlocked ? [engineBlocked.text] : []}
        />
      ) : null}

      {showTry ? (
        <SettingsSection title="Try it" aside={<ImagesMade refreshKey={`${refreshKey}:${made}`} />} data-images-try>
          <TryImage status={status} ready={Boolean(status.ready)} comfy={comfy.status} onMade={() => setMade((count) => count + 1)} />
        </SettingsSection>
      ) : null}

      {showFiles ? (
        <ModelFiles
          kind="images"
          status={status}
          catalog={catalog}
          library={library}
          downloads={downloads}
          onCancelDownload={cancelDownload}
          comfy={comfy.status}
          highlight={highlight}
          offline={offline}
          onChanged={changed}
        />
      ) : null}

      {dialog?.type === 'hf' ? (
        <HuggingFaceDialog open onClose={() => setDialog(null)} scopes={['images']} offline={offline} filesHere={filesHere} />
      ) : null}
      {dialog?.type === 'file' ? (
        <AddFileDialog open onClose={() => setDialog(null)} scope="images" onAdded={changed} />
      ) : null}
    </div>
  );
}

ImagesSettings.propTypes = { highlight: PropTypes.object, refreshKey: PropTypes.number };

/**
 *   <ImagesPage highlight={{ id: 'image-file-…', at: Date.now() }} refreshKey={count} />
 *
 * `highlight` flashes a row of Model files, for a search that jumps here; a
 * new `refreshKey` (the page's Refresh) loads everything again.
 */
export default function ImagesPage({ highlight = null, refreshKey = 0 }) {
  return (
    <ChooserScope>
      <ImagesSettings highlight={highlight} refreshKey={refreshKey} />
    </ChooserScope>
  );
}

ImagesPage.propTypes = { highlight: PropTypes.object, refreshKey: PropTypes.number };
