// The "Engine" row: which copy of whisper.cpp, Piper or stable-diffusion.cpp
// runs (Asyncat's, with its version, build and size, or one found on this
// computer), installing or updating it with the size shown first, freeing
// its memory, showing it in its folder, and removing Asyncat's copy.

import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { MoreHorizontal } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import IconButton from '../../components/ui/IconButton.jsx';
import { Menu, MenuItem, MenuSeparator } from '../../components/ui/Menu.jsx';
import { DownloadLine, Progress } from '../../components/ui/Progress.jsx';
import { PropertyRow } from '../../components/ui/Rows.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import { useConfirm } from '../../components/confirmContext.js';
import { errorDetail, useToast } from '../../components/toastContext.js';
import ActionButton from './ActionButton.jsx';
import { ENGINE_NAMES, buildWords, enginePlanText, engineSummary, noDownloadText, stepErrorText, stepProgressText, stepSizeText } from './mediaFormat.js';
import { useEngine } from './useEngine.js';

const REMOVE_TEXT = {
  whisper: 'Listening on this computer stops until you install it again. Your models stay.',
  piper: 'Speaking on this computer stops until you install it again. Your voices stay.',
  sd: 'Making images on this computer stops until you install it again. Your models stay.',
};

const ENV_KEYS = { whisper: 'WHISPER_BINARY_PATH', piper: 'PIPER_BINARY_PATH', sd: 'IMAGEGEN_BINARY_PATH' };

/**
 * No ready-made download for this computer: a calm note on installing it
 * another way, with the setting for one kept elsewhere under Details.
 */
function NoDownloadNote({ runtimeId, platform, onCheckAgain = null, checking = false }) {
  return (
    <div className="space-y-1.5" data-engine-no-download>
      <p className="text-[13px] leading-5 text-fg-muted">{noDownloadText(runtimeId, platform)}</p>
      <details className="text-[12px] leading-5 text-fg-subtle">
        <summary className="w-fit cursor-pointer rounded outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40">Details</summary>
        <p className="mt-1">
          Installed it somewhere Asyncat doesn&apos;t look? Point the <code className="font-mono">{ENV_KEYS[runtimeId]}</code> setting at it.
        </p>
      </details>
      {onCheckAgain ? (
        <div className="-ml-3">
          <Button variant="ghost" size="sm" loading={checking} onClick={onCheckAgain}>Check again</Button>
        </div>
      ) : null}
    </div>
  );
}

NoDownloadNote.propTypes = {
  runtimeId: PropTypes.string.isRequired,
  platform: PropTypes.string,
  onCheckAgain: PropTypes.func,
  checking: PropTypes.bool,
};

function MetaLine({ parts }) {
  if (!parts?.length) return null;
  return <span className="ml-2 text-[12px] tabular-nums text-fg-subtle">{parts.join(' · ')}</span>;
}

MetaLine.propTypes = { parts: PropTypes.arrayOf(PropTypes.node) };

/**
 *   <EngineRow runtimeId="whisper" loaded={status.stt.running === 'ready'}
 *     enginePath={status.stt.enginePath} onChanged={reload} />
 *
 * While a setup runs or is planned, pass its `step` for this engine (a plan
 * step with its size, or a running job's step) and the row shows that
 * instead of its own controls. `downloadBlocked` ("You're offline", "One
 * download at a time.") disables installing and says why.
 */
export default function EngineRow({ runtimeId, loaded = false, enginePath = null, step = null, downloadBlocked = null, onChanged, highlight }) {
  const toast = useToast();
  const confirm = useConfirm();
  const engine = useEngine(runtimeId, { onChanged });
  const menuRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [plan, setPlan] = useState(null); // { loading, data, error, unavailable } while the plan is open
  const [checking, setChecking] = useState(false);
  const name = ENGINE_NAMES[runtimeId] || runtimeId;
  const summary = engineSummary(runtimeId, engine.runtime, { bytes: engine.bytes, loaded, enginePath, job: engine.job });
  const canShow = Boolean(window.electronAPI?.shellShowInFolder && summary.path);

  const openPlan = async () => {
    setPlan({ loading: true, data: null, error: '' });
    try {
      setPlan({ loading: false, data: await engine.plan(), error: '' });
    } catch (err) {
      setPlan({ loading: false, data: null, error: errorDetail(err), unavailable: Boolean(err?.data?.unavailable), platform: err?.data?.platform || null });
    }
  };

  // After installing it another way: look for the engine again.
  const checkAgain = async () => {
    setChecking(true);
    try {
      await engine.refresh();
      await onChanged?.();
      setPlan(null);
    } finally {
      setChecking(false);
    }
  };

  const install = async () => {
    setPlan(null);
    try {
      await engine.install();
    } catch (err) {
      toast.error(`Couldn't install ${name}`, { detail: errorDetail(err) });
    }
  };

  const cancel = async () => {
    try {
      await engine.cancel();
    } catch (err) {
      toast.error("Couldn't cancel the install", { detail: errorDetail(err) });
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: `Remove ${name}?`, message: REMOVE_TEXT[runtimeId], confirmLabel: 'Remove', destructive: true });
    if (!ok) return;
    try {
      await engine.remove();
    } catch (err) {
      toast.error(`Couldn't remove ${name}`, { detail: errorDetail(err) });
    }
  };

  const freeMemory = async () => {
    try {
      await engine.freeMemory();
    } catch (err) {
      toast.error("Couldn't free the memory", { detail: errorDetail(err) });
    }
  };

  // A setup in progress, or one about to start, speaks for this row. A
  // planned step still `loading` its size shows a bar where the size goes.
  if (step && (step.status || !step.done)) {
    const running = step.status === 'running';
    const percent = step.total ? (Number(step.downloaded) / Number(step.total)) * 100 : Number(step.progress) || 0;
    return (
      <PropertyRow
        label="Engine"
        data-engine-row={runtimeId}
        data-engine-state={step.status ? 'setup' : 'planned'}
        value={<span className="block truncate">{name}<MetaLine parts={[buildWords(step.capability)].filter(Boolean)} /></span>}
        status={step.status ? stepProgressText(step) : step.loading ? <Skeleton className="h-3 w-12" /> : stepSizeText(step)}
        open={running || Boolean(step.error)}
      >
        <div className="sm:pl-36">
          {running ? <Progress value={percent} label={`Installing ${name}`} /> : null}
          {step.error && step.unavailable && !step.status ? (
            <NoDownloadNote runtimeId={runtimeId} platform={engine.runtime?.platform} />
          ) : step.error ? (
            <p role="alert" className="text-[12px] leading-5 text-red-600 dark:text-red-400">{stepErrorText(step.error)}</p>
          ) : null}
        </div>
      </PropertyRow>
    );
  }

  const { state } = summary;
  const planText = plan?.data ? enginePlanText(runtimeId, plan.data, {
    installedVersion: engine.runtime?.managedInstalled ? engine.runtime.version : null,
    working: state === 'managed' || state === 'external',
  }) : null;
  const bodyOpen = state === 'installing' || state === 'nodownload' || Boolean(plan) || Boolean(engine.error);

  const value = state === 'loading' ? <Skeleton className="h-4 w-40" /> : state === 'external' ? (
    <span className="block min-w-0">
      <span className="block truncate">{summary.value}<MetaLine parts={summary.meta} /></span>
      <span className="block truncate font-mono text-[11px] text-fg-subtle" title={summary.path}>{summary.path}</span>
    </span>
  ) : (
    <span className="block truncate">{summary.value}<MetaLine parts={summary.meta} /></span>
  );

  let control = null;
  if (state === 'missing' && !plan) {
    control = <ActionButton size="sm" blocked={downloadBlocked} onClick={openPlan}>Install</ActionButton>;
  } else if (state === 'nodownload') {
    control = null;
  } else if (state === 'managed' || state === 'external') {
    control = (
      <>
        <IconButton
          ref={menuRef}
          icon={MoreHorizontal}
          label={`${name} options`}
          size="sm"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        />
        <Menu anchorRef={menuRef} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom-end" width={220} label={`${name} options`}>
          <MenuItem
            label={state === 'managed' ? 'Check for update…' : "Install Asyncat's copy…"}
            disabled={Boolean(downloadBlocked)}
            hint={downloadBlocked || undefined}
            onSelect={openPlan}
          />
          {loaded && runtimeId !== 'sd' ? <MenuItem label="Free memory" onSelect={freeMemory} /> : null}
          {canShow ? <MenuItem label="Show in folder" onSelect={() => window.electronAPI.shellShowInFolder(summary.path)} /> : null}
          {state === 'managed' ? (
            <>
              <MenuSeparator />
              <MenuItem label="Remove Asyncat's copy" danger onSelect={remove} />
            </>
          ) : null}
        </Menu>
      </>
    );
  }

  return (
    <PropertyRow
      label="Engine"
      highlight={highlight}
      data-engine-row={runtimeId}
      data-engine-state={state}
      value={value}
      control={control}
      open={bodyOpen}
    >
      <div className="space-y-2 sm:pl-36">
        {state === 'nodownload' && !plan ? (
          <NoDownloadNote runtimeId={runtimeId} platform={engine.runtime?.platform} onCheckAgain={checkAgain} checking={checking} />
        ) : null}
        {state === 'installing' ? (
          <DownloadLine
            label="Installing"
            bytes={Number(engine.job?.progress?.downloadedBytes) || undefined}
            total={Number(engine.job?.progress?.totalBytes) || undefined}
            percent={Number(engine.job?.progress?.percent) || 0}
            onCancel={cancel}
          />
        ) : null}
        {plan ? (
          <div className="space-y-2" data-engine-plan>
            {plan.loading ? (
              <>
                <Skeleton className="h-4 w-64 max-w-full" />
                <Skeleton className="h-3 w-80 max-w-full" />
              </>
            ) : plan.unavailable ? (
              <NoDownloadNote runtimeId={runtimeId} platform={plan.platform || engine.runtime?.platform} />
            ) : plan.error ? (
              <p className="text-[12px] leading-5 text-red-600 dark:text-red-400">Couldn&apos;t check for a download: {plan.error}</p>
            ) : planText.newest ? (
              <p className="text-[13px] text-fg">You have the newest version.</p>
            ) : (
              <div>
                <p className="text-[13px] text-fg">{planText.line}</p>
                <p className="text-[12px] leading-5 text-fg-subtle">{planText.detail}</p>
              </div>
            )}
            <div className="-ml-3 flex flex-wrap items-center gap-2">
              {plan.unavailable ? (
                <Button variant="ghost" size="sm" loading={checking} onClick={checkAgain}>Check again</Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setPlan(null)}>Not now</Button>
              )}
              {planText?.newest ? (
                <ActionButton variant="ghost" size="sm" blocked={downloadBlocked} onClick={install}>Reinstall</ActionButton>
              ) : planText ? (
                <ActionButton variant="primary" size="sm" blocked={downloadBlocked} onClick={install}>Download and install</ActionButton>
              ) : null}
            </div>
          </div>
        ) : null}
        {engine.error && state !== 'installing' ? <p role="alert" className="text-[12px] leading-5 text-red-600 dark:text-red-400">{stepErrorText(engine.error)}</p> : null}
      </div>
    </PropertyRow>
  );
}

EngineRow.propTypes = {
  runtimeId: PropTypes.oneOf(['whisper', 'piper', 'sd']).isRequired,
  loaded: PropTypes.bool,
  enginePath: PropTypes.string,
  step: PropTypes.object,
  downloadBlocked: PropTypes.string,
  onChanged: PropTypes.func,
  highlight: PropTypes.any,
};
