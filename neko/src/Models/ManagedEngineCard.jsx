// Models/ManagedEngineCard.jsx — install, update or remove one engine that
// Asyncat manages (whisper.cpp, Piper, stable-diffusion.cpp), right where it
// is used. The download size is shown first and nothing downloads until the
// user agrees; the install shows progress and can be cancelled.

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Download, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import { runtimeApi } from '../Settings/settingApi.js';
import { downloadProgressText } from './engineProgress.js';
import { useManagedRuntime } from './useManagedRuntime.js';

const ProgressBar = ({ percent, message, detail }) => (
  <div className="mt-3">
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
      <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, percent || 0))}%` }} />
    </div>
    <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-fg-subtle">
      <p className="min-w-0 truncate">{message || 'Working…'}</p>
      {detail ? <span className="shrink-0 tabular-nums">{detail}</span> : null}
    </div>
  </div>
);

ProgressBar.propTypes = { percent: PropTypes.number, message: PropTypes.string, detail: PropTypes.string };

export default function ManagedEngineCard({ runtimeId, name, purpose, icon: Icon, onChanged, compact = false }) {
  const { runtime, refresh } = useManagedRuntime(runtimeId);
  const [plan, setPlan] = useState(null); // shown while asking to download
  const [planning, setPlanning] = useState(false);
  const [job, setJob] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const stopPolling = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopPolling.current?.(); };
  }, []);

  const managed = Boolean(runtime?.managedInstalled);
  const ready = Boolean(runtime?.detected);

  const askToInstall = async () => {
    setPlanning(true);
    setError('');
    setNotice('');
    try {
      const res = await runtimeApi.plan(runtimeId);
      if (mounted.current) setPlan(res.plan);
    } catch (err) {
      if (mounted.current) setError(`Couldn't find a download for this computer: ${err.message}`);
    } finally {
      if (mounted.current) setPlanning(false);
    }
  };

  const install = async () => {
    setPlan(null);
    setInstalling(true);
    setError('');
    setNotice('');
    setJob(null);
    try {
      const res = await runtimeApi.install(runtimeId);
      setJob(res.job);
      stopPolling.current?.();
      stopPolling.current = runtimeApi.pollJob(
        res.job.id,
        (next) => mounted.current && setJob(next),
        async (next) => {
          stopPolling.current = null;
          if (!mounted.current) return;
          setJob(next);
          setInstalling(false);
          setNotice(`${name} is installed${next?.result?.version ? ` (${next.result.version})` : ''}.`);
          await refresh();
          await onChanged?.();
        },
        (next) => {
          stopPolling.current = null;
          if (!mounted.current) return;
          setInstalling(false);
          if (next?.status === 'cancelled') setNotice('Install cancelled. What you had installed is unchanged.');
          else setError(next?.error || 'The install failed.');
        },
      );
    } catch (err) {
      setInstalling(false);
      setError(err.message || "Couldn't start the install.");
    }
  };

  const cancel = async () => {
    if (!job?.id) return;
    try {
      await runtimeApi.cancelJob(job.id);
    } catch (err) {
      setError(err.message || "Couldn't cancel the install.");
    }
  };

  const remove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setRemoving(true);
    setError('');
    try {
      await runtimeApi.remove(runtimeId);
      setConfirmRemove(false);
      setNotice(`Asyncat's copy of ${name} was removed.`);
      await refresh();
      await onChanged?.();
    } catch (err) {
      setError(err.message || "Couldn't remove it.");
    } finally {
      setRemoving(false);
    }
  };

  if (runtime && runtime.supported === false) {
    return (
      <div className="rounded-xl border border-line bg-surface p-3 text-[12px] text-fg-muted">
        {name}: {runtime.unsupportedReason || 'not available on this computer.'}
      </div>
    );
  }

  const status = installing
    ? 'Installing…'
    : managed
      ? `Installed${runtime?.version ? ` · ${runtime.version}` : ''}${runtime?.capability ? ` · ${runtime.capability.toUpperCase().replace('_SAFE', '')}` : ''}`
      : ready
        ? 'Found on this computer'
        : 'Not installed';

  return (
    <div className={`rounded-xl border border-line bg-surface ${compact ? 'p-3' : 'p-4'}`} data-engine-card={runtimeId}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-fg-muted">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="text-[13px] font-medium text-fg">{name}</p>
            <span className={`inline-flex items-center gap-1 text-[11px] ${ready ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg-subtle'}`}>
              {ready && !installing ? <Check className="h-3 w-3" /> : null}
              {status}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] leading-5 text-fg-muted">{purpose}</p>
          {!managed && ready && runtime?.configuredPath ? (
            <p className="mt-0.5 truncate font-mono text-[11px] text-fg-subtle" title={runtime.configuredPath}>{runtime.configuredPath}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!installing && !plan && (
            <Button
              size="xs"
              variant={ready ? 'secondary' : 'primary'}
              icon={managed ? RefreshCw : Download}
              loading={planning}
              onClick={askToInstall}
              disabled={removing}
            >
              {managed ? 'Update' : ready ? 'Install Asyncat\'s copy' : 'Install'}
            </Button>
          )}
          {installing && job?.id ? <Button size="xs" onClick={cancel}>Cancel</Button> : null}
          {managed && !installing && !plan ? (
            <Button size="xs" variant="danger" icon={Trash2} loading={removing} onClick={remove}>
              {confirmRemove ? 'Confirm' : 'Remove'}
            </Button>
          ) : null}
        </div>
      </div>

      {plan && (
        <div className="mt-3 rounded-lg border border-line bg-canvas px-3 py-2.5" role="group" aria-label={`Download ${name}`}>
          <p className="text-[12px] leading-5 text-fg">
            Download {plan.estimated ? 'about ' : ''}<strong>{plan.downloadSize}</strong>
            {plan.version ? <> · {plan.version}</> : null}
            {plan.capabilityLabel ? <> · {plan.capabilityLabel} build</> : null}
          </p>
          <p className="text-[11px] leading-5 text-fg-subtle">
            {plan.assetName || (plan.packages ? `Python packages: ${plan.packages.join(', ')}` : '')}
            {plan.license ? ` · ${plan.license}` : ''}
          </p>
          <div className="mt-2 flex gap-1.5">
            <Button size="xs" variant="primary" icon={Download} onClick={install}>Download and install</Button>
            <Button size="xs" variant="ghost" onClick={() => setPlan(null)}>Not now</Button>
          </div>
        </div>
      )}

      {installing && (
        <ProgressBar
          percent={job?.progress?.percent ?? job?.percent ?? 2}
          message={job?.progress?.message || job?.message}
          detail={downloadProgressText(job?.progress)}
        />
      )}

      {error ? (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-5 text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {notice && !error ? <p className="mt-2 text-[12px] leading-5 text-fg-muted">{notice}</p> : null}
    </div>
  );
}

ManagedEngineCard.propTypes = {
  runtimeId: PropTypes.oneOf(['whisper', 'piper', 'sd', 'mlx']).isRequired,
  name: PropTypes.string.isRequired,
  purpose: PropTypes.string.isRequired,
  icon: PropTypes.elementType,
  onChanged: PropTypes.func,
  compact: PropTypes.bool,
};
