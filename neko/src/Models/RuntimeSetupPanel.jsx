// Models/RuntimeSetupPanel.jsx — Shared local-runtime setup panel.
//
// Used in two places:
//   • WelcomePage onboarding (compact) — first-run "set up the local engines" step
//   • Settings → Runtime (full) — same controls, alongside the engine advisor
//
// Responsibilities:
//   1. One-click install of the local chat engine (managed llama.cpp build) using
//      the background install-job API, with live progress.
//   2. Surface the system tools the optional cpps need (ffmpeg for Whisper,
//      whisper-server, piper, C++ compiler) with readiness status and a copyable
//      package-manager command for whatever is missing — the app cannot install
//      system binaries itself.
//   3. Point users at the Models page, where the actual model weights are pulled.
import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Cpu, Mic, Volume2, Image as ImageIcon, Check, Loader2,
  Download, Copy, AlertCircle, Terminal, RefreshCw,
} from 'lucide-react';
import { installApi } from '../CommandCenter/api/installApi.js';
import { llamaServerApi } from '../Settings/settingApi.js';

const PROFILE_LABELS = {
  cpu_safe: 'CPU',
  nvidia_gpu: 'NVIDIA CUDA',
  apple_metal: 'Apple Metal',
  amd_rocm: 'AMD ROCm',
};

// Map detected GPU vendor → managed-install profile. The install job downloads a
// prebuilt release asset for the profile (it never compiles), so this is safe to
// run during onboarding.
const profileForGpu = (gpu) => {
  switch (gpu?.vendor) {
    case 'NVIDIA': return 'nvidia_gpu';
    case 'Apple':  return 'apple_metal';
    case 'AMD':    return 'amd_rocm';
    default:       return 'cpu_safe';
  }
};

// Which readiness checks back each optional capability (the "cpps").
const CAPABILITY_TOOLS = [
  { key: 'stt',   icon: Mic,       label: 'Speech-to-Text', detail: 'Whisper', checks: ['whisper-server', 'ffmpeg'] },
  { key: 'tts',   icon: Volume2,   label: 'Text-to-Speech', detail: 'Piper',   checks: ['piper'] },
  { key: 'image', icon: ImageIcon, label: 'Image Generation', detail: 'stable-diffusion.cpp / ComfyUI', checks: ['cxx-compiler'] },
];

const StatusDot = ({ ok }) => (
  <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600 midnight:bg-slate-600'}`} />
);
StatusDot.propTypes = { ok: PropTypes.bool };

const RuntimeSetupPanel = ({ compact = false, onReadyChange }) => {
  const [readiness, setReadiness] = useState(null);
  const [engines, setEngines] = useState(null);
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
    setLoading(true);
    setLoadError('');
    try {
      const [readinessRes, enginesRes] = await Promise.allSettled([
        installApi.getReadiness(),
        llamaServerApi.getEngines(),
      ]);
      if (!mounted.current) return;
      if (readinessRes.status === 'fulfilled') setReadiness(readinessRes.value);
      else setLoadError(readinessRes.reason?.message || 'Could not read machine readiness.');
      if (enginesRes.status === 'fulfilled' && enginesRes.value?.success) setEngines(enginesRes.value);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      installCleanup.current?.();
    };
  }, [load]);

  useEffect(() => {
    onReadyChange?.(engineInstalled);
  }, [engineInstalled, onReadyChange]);

  const handleInstallEngine = async () => {
    setInstalling(true);
    setInstallError('');
    setInstallJob(null);
    try {
      const res = await llamaServerApi.startInstallJob({ profile: recommendedProfile });
      const job = res.job;
      setInstallJob(job);
      installCleanup.current?.();
      installCleanup.current = llamaServerApi.pollInstallJob(
        job.id,
        (j) => mounted.current && setInstallJob(j),
        async (j) => {
          if (!mounted.current) return;
          setInstallJob(j);
          setInstalling(false);
          setInstallDone(true);
          installCleanup.current = null;
          await load();
        },
        (j) => {
          if (!mounted.current) return;
          setInstalling(false);
          setInstallError(j?.error || 'Failed to install the local engine.');
          installCleanup.current = null;
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

  // Readiness check lookup by id.
  const checkById = (id) => (readiness?.checks || []).find(c => c.id === id) || null;
  const capabilityReady = (tool) => tool.checks.every(id => checkById(id)?.ok);

  // Package-manager commands for whatever is still missing.
  const installCommands = (readiness?.commands || []).filter(c => c.kind === 'packages' || c.kind === 'compiler' || c.kind === 'node');

  const cardCls = 'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-900/60';
  const progressPct = installJob?.progress?.percent ?? (installing ? 2 : 0);

  if (loading) {
    return (
      <div className="space-y-3">
        {['h-20', 'h-16', 'h-16'].map(h => (
          <div key={h} className={`${h} animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800`} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-left">
      {/* ── Local chat engine ─────────────────────────────────────────────── */}
      <div className={cardCls}>
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
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800">
              <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min(100, Math.max(2, progressPct))}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              {installJob?.progress?.message || 'Preparing download…'}
            </p>
          </div>
        )}

        {installError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-900/60 dark:bg-amber-950/20">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-[11px] leading-5 text-amber-700 dark:text-amber-300">
              {installError} You can also pick a build manually in Settings → Runtime, or use a cloud provider on the Models page.
            </p>
          </div>
        )}
      </div>

      {/* ── Optional capability tools (the cpps) ──────────────────────────── */}
      <div className={cardCls}>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Optional local engines</p>
        <p className="mt-0.5 mb-3 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">
          Voice and image need a few system tools. Anything missing can be installed with your package manager below.
        </p>
        <div className="space-y-2">
          {CAPABILITY_TOOLS.map((tool) => {
            const ready = capabilityReady(tool);
            const Icon = tool.icon;
            return (
              <div key={tool.key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 dark:border-gray-800 dark:bg-gray-800/30 midnight:border-slate-800 midnight:bg-slate-900/40">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">{tool.label}</span>
                  <span className="truncate text-[10px] text-gray-400 dark:text-gray-500 midnight:text-slate-500">{tool.detail}</span>
                </div>
                <span className="flex flex-shrink-0 items-center gap-1.5">
                  <StatusDot ok={ready} />
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 midnight:text-slate-500">
                    {ready ? 'Ready' : 'Needs tools'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {installCommands.length > 0 && (
          <div className="mt-3 space-y-2">
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

      {loadError && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">{loadError}</p>
      )}
    </div>
  );
};

RuntimeSetupPanel.propTypes = {
  compact: PropTypes.bool,
  onReadyChange: PropTypes.func,
};

export default RuntimeSetupPanel;
