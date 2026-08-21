// Models/RuntimeSetupPanel.jsx — Shared local-runtime setup panel.
//
// Used in two places:
//   • Compact first-run runtime setup surfaces
//   • Settings → Runtime (full) — same controls, alongside the engine advisor
//
// What it does:
//   1. One-click install of the local chat engine (managed llama.cpp build).
//   2. One-click install of optional engines. Whisper and stable-diffusion.cpp
//      use compatible prebuilt assets; Piper and MLX use isolated Python venvs.
//   3. Surfaces remaining system tools (ffmpeg, C++ compiler) with copyable
//      package-manager commands.
//   4. Points users at the Models page, where the actual model weights are pulled.
import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Cpu, Mic, Volume2, Image as ImageIcon, Check, Loader2,
  Download, Copy, AlertCircle, Terminal, RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react';
import { installApi } from '../CommandCenter/api/installApi.js';
import { llamaServerApi, runtimeApi } from '../Settings/settingApi.js';

const PROFILE_LABELS = {
  cpu_safe: 'CPU',
  nvidia_gpu: 'NVIDIA CUDA',
  apple_metal: 'Apple Metal',
  amd_rocm: 'AMD ROCm',
  vulkan: 'Vulkan',
  intel_sycl: 'Intel (SYCL)',
};

// Map detected GPU vendor → managed-install profile (prebuilt download, never compiles).
const profileForGpu = (gpu) => {
  switch (gpu?.vendor) {
    case 'NVIDIA': return 'nvidia_gpu';
    case 'Apple':  return 'apple_metal';
    case 'AMD':    return 'amd_rocm';
    case 'Intel':  return 'vulkan';
    default:       return 'cpu_safe';
  }
};

// Optional engines: each maps a readiness check id → a managed-runtime install id.
const OPTIONAL_ENGINES = [
  { runtime: 'whisper', icon: Mic,       label: 'Speech-to-Text',   detail: 'Whisper',                 checkId: 'whisper-server', needs: ['ffmpeg'] },
  { runtime: 'piper',   icon: Volume2,   label: 'Text-to-Speech',   detail: 'Piper (piper-tts, GPL-3.0-or-later)', checkId: 'piper' },
  { runtime: 'sd',      icon: ImageIcon, label: 'Image Generation', detail: 'stable-diffusion.cpp',    checkId: 'sd' },
  { runtime: 'mlx',     icon: Cpu,       label: 'MLX LM',           detail: 'Apple Silicon or Linux',   checkId: 'mlx-lm' },
];

const StatusDot = ({ ok }) => (
  <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600 midnight:bg-slate-600'}`} />
);
StatusDot.propTypes = { ok: PropTypes.bool };

const ProgressBar = ({ percent, message }) => (
  <div className="mt-2">
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800">
      <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, percent))}%` }} />
    </div>
    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 midnight:text-slate-400">{message || 'Working…'}</p>
  </div>
);
ProgressBar.propTypes = { percent: PropTypes.number, message: PropTypes.string };

// ── One optional engine (Whisper / Piper / sd) with its own install lifecycle ──
const EngineRow = ({ engine, ready, managedRuntime, ffmpegMissing, onChanged }) => {
  const [installing, setInstalling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const cleanup = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cleanup.current?.(); };
  }, []);

  const isManaged = done || Boolean(managedRuntime?.managedInstalled);
  const isReady = isManaged || ready || Boolean(managedRuntime?.detected);
  const Icon = engine.icon;

  const handleInstall = async () => {
    setInstalling(true);
    setError('');
    setJob(null);
    try {
      const res = await runtimeApi.install(engine.runtime);
      setJob(res.job);
      cleanup.current?.();
      cleanup.current = runtimeApi.pollJob(
        res.job.id,
        (j) => mounted.current && setJob(j),
        async (j) => {
          if (!mounted.current) return;
          setJob(j); setInstalling(false); setDone(true); cleanup.current = null;
          await onChanged?.();
        },
        (j) => {
          if (!mounted.current) return;
          setInstalling(false); setError(j?.error || 'Install failed.'); cleanup.current = null;
        },
      );
    } catch (err) {
      setInstalling(false);
      setError(err.message || 'Could not start the install.');
    }
  };

  const handleRemove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setRemoving(true);
    setError('');
    try {
      await runtimeApi.remove(engine.runtime);
      setDone(false);
      setConfirmRemove(false);
      setJob(null);
      await onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not remove the managed runtime.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-800/30 midnight:border-slate-800 midnight:bg-slate-900/40">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">{engine.label}</span>
          <span className="truncate text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">{engine.detail}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {isReady && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Check className="h-3 w-3" /> {isManaged ? 'Managed' : 'External'}
            </span>
          )}
          <button
            type="button"
            onClick={handleInstall}
            disabled={installing || removing}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-200"
          >
            {installing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {installing ? 'Installing…' : (isManaged ? 'Update' : (isReady ? 'Install managed' : 'Install'))}
          </button>
          {isManaged && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={installing || removing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/20"
            >
              {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {removing ? 'Removing…' : (confirmRemove ? 'Confirm' : 'Remove')}
            </button>
          )}
        </div>
      </div>

      {isReady && ffmpegMissing && (
        <p className="mt-1.5 text-[10px] leading-4 text-amber-600 dark:text-amber-400">
          Whisper also needs <code className="font-mono">ffmpeg</code> for recording — install it with the command below.
        </p>
      )}

      {installing && <ProgressBar percent={job?.progress?.percent ?? 2} message={job?.progress?.message} />}

      {error && (
        <p className="mt-1.5 text-[10px] leading-4 text-amber-600 dark:text-amber-400">
          {error} Review the system-tool requirements below or configure a custom runtime path.
        </p>
      )}
    </div>
  );
};
EngineRow.propTypes = {
  engine: PropTypes.object.isRequired,
  ready: PropTypes.bool,
  managedRuntime: PropTypes.object,
  ffmpegMissing: PropTypes.bool,
  onChanged: PropTypes.func,
};

const RuntimeSetupPanel = ({ compact = false, showChatEngine = true, onReadyChange, onRuntimeInstalled }) => {
  const [readiness, setReadiness] = useState(null);
  const [engines, setEngines] = useState(null);
  const [managedRuntimes, setManagedRuntimes] = useState([]);
  const [runtimeRoot, setRuntimeRoot] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [installJob, setInstallJob] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [installDone, setInstallDone] = useState(false);
  const [copied, setCopied] = useState('');

  const installCleanup = useRef(null);
  const mounted = useRef(true);

  const engineInstalled = installDone || Boolean(engines?.current);
  const recommendedProfile = profileForGpu(readiness?.gpu);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [readinessRes, enginesRes, runtimesRes] = await Promise.allSettled([
        installApi.getReadiness(),
        llamaServerApi.getEngines(),
        runtimeApi.list(),
      ]);
      if (!mounted.current) return;
      if (readinessRes.status === 'fulfilled') setReadiness(readinessRes.value);
      else setLoadError(readinessRes.reason?.message || 'Could not read machine readiness.');
      if (enginesRes.status === 'fulfilled' && enginesRes.value?.success) setEngines(enginesRes.value);
      if (runtimesRes.status === 'fulfilled' && runtimesRes.value?.success) {
        setManagedRuntimes(runtimesRes.value.runtimes || []);
        setRuntimeRoot(runtimesRes.value.root || runtimesRes.value.runtimes?.[0]?.managedRoot || '');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; installCleanup.current?.(); };
  }, [load]);

  useEffect(() => { onReadyChange?.(engineInstalled); }, [engineInstalled, onReadyChange]);

  const handleInstallEngine = async () => {
    setInstalling(true);
    setInstallError('');
    setInstallJob(null);
    try {
      const res = await llamaServerApi.startInstallJob({ profile: recommendedProfile });
      setInstallJob(res.job);
      installCleanup.current?.();
      installCleanup.current = llamaServerApi.pollInstallJob(
        res.job.id,
        (j) => mounted.current && setInstallJob(j),
        async (j) => {
          if (!mounted.current) return;
          setInstallJob(j); setInstalling(false); setInstallDone(true); installCleanup.current = null;
          await load();
          await onRuntimeInstalled?.();
        },
        (j) => {
          if (!mounted.current) return;
          setInstalling(false); setInstallError(j?.error || 'Failed to install the local engine.'); installCleanup.current = null;
        },
      );
    } catch (err) {
      setInstalling(false);
      setInstallError(err.message || 'Failed to start the install.');
    }
  };

  const copyCommand = async (cmd, id) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(id);
      setTimeout(() => mounted.current && setCopied(''), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const checkById = (id) => (readiness?.checks || []).find(c => c.id === id) || null;
  const ffmpegMissing = !checkById('ffmpeg')?.ok;
  const installCommands = (readiness?.commands || []).filter(c => c.kind === 'packages' || c.kind === 'compiler' || c.kind === 'node');
  const runtimeById = new Map(managedRuntimes.map(runtime => [runtime.id, runtime]));
  const visibleOptionalEngines = OPTIONAL_ENGINES.filter(engine => runtimeById.get(engine.runtime)?.supported !== false);

  const cardCls = 'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-900/60';
  const llamaPct = installJob?.percent ?? installJob?.progress?.percent ?? (installing ? 2 : 0);
  const llamaMessage = installJob?.message ?? installJob?.progress?.message ?? 'Preparing download…';

  if (loading) {
    return (
      <div className="space-y-3">
        {['h-20', 'h-16', 'h-16'].map((h, i) => (
          <div key={i} className={`${h} animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800`} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-left">
      {/* ── Local chat engine (llama.cpp) ─────────────────────────────────── */}
      {showChatEngine && <div className={cardCls}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 midnight:border-slate-700 midnight:bg-slate-800">
              <Cpu className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Local chat engine</p>
              <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                {engineInstalled
                  ? 'llama.cpp is installed and ready to run GGUF models.'
                  : `Download a prebuilt llama.cpp build (${PROFILE_LABELS[recommendedProfile]}${readiness?.gpu ? ` · ${readiness.gpu.vendor} detected` : ''}).`}
              </p>
            </div>
          </div>
          {engineInstalled ? (
            <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Check className="h-3 w-3" /> Installed
            </span>
          ) : (
            <button
              type="button"
              onClick={handleInstallEngine}
              disabled={installing}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white midnight:bg-slate-100 midnight:text-slate-900"
            >
              {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {installing ? 'Installing…' : 'Install'}
            </button>
          )}
        </div>

        {(installing || installJob) && !engineInstalled && (
          <ProgressBar percent={llamaPct} message={llamaMessage} />
        )}

        {installError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/20">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[11px] leading-5 text-amber-700 dark:text-amber-300">
              {installError} You can also pick a build manually in Settings → Runtime, or use a cloud provider on the Models page.
            </p>
          </div>
        )}
      </div>}

      {/* ── Optional engines (Whisper / Piper / sd) ───────────────────────── */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Optional local engines</p>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" /> App-isolated
          </span>
        </div>
        <p className="mt-0.5 mb-3 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">
          Install voice, image, and MLX engines without modifying global Python packages. Updates are staged and verified before replacing the previous managed copy.
        </p>
        <div className="space-y-2">
          {visibleOptionalEngines.map((engine) => (
            <EngineRow
              key={engine.runtime}
              engine={engine}
              ready={Boolean(checkById(engine.checkId)?.ok)}
              managedRuntime={runtimeById.get(engine.runtime)}
              ffmpegMissing={engine.runtime === 'whisper' && ffmpegMissing}
              onChanged={async () => {
                await load();
                await onRuntimeInstalled?.();
              }}
            />
          ))}
        </div>

        {installCommands.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              System tools (ffmpeg, compilers) — install with your package manager
            </p>
            {installCommands.map((cmd, i) => (
              <div key={`${cmd.manager}-${i}`} className="rounded-lg border border-gray-200 bg-gray-950 p-2.5 dark:border-gray-700 midnight:border-slate-700">
                <div className="mb-1 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    <Terminal className="h-3 w-3" /> {cmd.manager}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyCommand(cmd.command, `${cmd.manager}-${i}`)}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-400 transition-colors hover:text-gray-200"
                  >
                    {copied === `${cmd.manager}-${i}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === `${cmd.manager}-${i}` ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <code className="block whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-gray-200">{cmd.command}</code>
              </div>
            ))}
          </div>
        )}

        {!compact && runtimeRoot && (
          <p className="mt-3 break-all font-mono text-[10px] leading-4 text-gray-400 dark:text-gray-500 midnight:text-slate-500">
            Managed runtime root: {runtimeRoot}
          </p>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] leading-5 text-gray-400 dark:text-gray-500 midnight:text-slate-500">
          {compact
            ? 'You can skip this — download models and pick providers any time on the Models page.'
            : 'Download model weights and pick cloud or local providers on the Models page.'}
        </p>
        {!compact && (
          <button
            type="button"
            onClick={load}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 midnight:border-slate-700"
          >
            <RefreshCw className="h-3 w-3" /> Recheck
          </button>
        )}
      </div>

      {loadError && <p className="text-[11px] text-amber-600 dark:text-amber-400">{loadError}</p>}
    </div>
  );
};

RuntimeSetupPanel.propTypes = {
  compact: PropTypes.bool,
  showChatEngine: PropTypes.bool,
  onReadyChange: PropTypes.func,
  onRuntimeInstalled: PropTypes.func,
};

export default RuntimeSetupPanel;
