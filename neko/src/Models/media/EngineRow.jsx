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
import { ENGINE_NAMES, enginePlanText, engineSummary, stepProgressText, stepSizeText } from './mediaFormat.js';
import { useEngine } from './useEngine.js';

const REMOVE_TEXT = {
  whisper: 'Listening on this computer stops until you install it again. Your models stay.',
  piper: 'Speaking on this computer stops until you install it again. Your voices stay.',
  sd: 'Making images on this computer stops until you install it again. Your models stay.',
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
  const [plan, setPlan] = useState(null); // { loading, data, error } while the plan is open
  const name = ENGINE_NAMES[runtimeId] || runtimeId;
  const summary = engineSummary(runtimeId, engine.runtime, { bytes: engine.bytes, loaded, enginePath, job: engine.job });
  const canShow = Boolean(window.electronAPI?.shellShowInFolder && summary.path);

  const openPlan = async () => {
    setPlan({ loading: true, data: null, error: '' });
    try {
      setPlan({ loading: false, data: await engine.plan(), error: '' });
    } catch (err) {
      setPlan({ loading: false, data: null, error: errorDetail(err) });
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

  // A setup in progress, or one about to start, speaks for this row.
  if (step && (step.status || !step.done)) {
    const running = step.status === 'running';
    const percent = step.total ? (Number(step.downloaded) / Number(step.total)) * 100 : Number(step.progress) || 0;
    return (
      <PropertyRow
        label="Engine"
        data-engine-row={runtimeId}
        value={name}
        status={step.status ? stepProgressText(step) : stepSizeText(step)}
        open={running || Boolean(step.error)}
      >
        <div className="sm:pl-36">
          {running ? <Progress value={percent} label={`Installing ${name}`} /> : null}
          {step.error ? <p role="alert" className="text-[12px] leading-5 text-red-600 dark:text-red-400">{step.error}</p> : null}
        </div>
      </PropertyRow>
    );
  }

  const { state } = summary;
  const planText = plan?.data ? enginePlanText(runtimeId, plan.data, { installedVersion: engine.runtime?.managedInstalled ? engine.runtime.version : null }) : null;
  const bodyOpen = state === 'installing' || Boolean(plan) || Boolean(engine.error);

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
              <Button variant="ghost" size="sm" onClick={() => setPlan(null)}>Not now</Button>
              {planText?.newest ? (
                <ActionButton variant="ghost" size="sm" blocked={downloadBlocked} onClick={install}>Reinstall</ActionButton>
              ) : planText ? (
                <ActionButton variant="primary" size="sm" blocked={downloadBlocked} onClick={install}>Download and install</ActionButton>
              ) : null}
            </div>
          </div>
        ) : null}
        {engine.error && state !== 'installing' ? <p role="alert" className="text-[12px] leading-5 text-red-600 dark:text-red-400">{engine.error}</p> : null}
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
