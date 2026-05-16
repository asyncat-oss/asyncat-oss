import { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronUp, Cpu, Download, Eye, Image, MessageSquare,
  Mic, RefreshCw, RotateCcw, TerminalSquare, TriangleAlert, Volume2, Wrench, Zap,
} from 'lucide-react';
import { Badge } from './modelPageShared.jsx';

const INSTALL_PROFILE_LABELS = {
  cpu_safe: 'CPU-safe build',
  nvidia_gpu: 'NVIDIA CUDA build',
  apple_metal: 'Apple Metal build',
  amd_rocm: 'AMD ROCm build',
};

const capabilityBadgeColor = (hint) => {
  if (hint === 'nvidia') return 'green';
  if (hint === 'apple') return 'blue';
  if (hint === 'amd') return 'amber';
  return 'gray';
};

const hardwareSummary = (hardware) => {
  const gpu = hardware?.gpu;
  if (!gpu) return `${hardware?.platform || 'unknown'} / ${hardware?.arch || 'unknown'} / CPU-safe`;
  const vram = gpu.vramGb ? ` / ${gpu.vramGb} GB VRAM` : '';
  return `${hardware?.platform || 'unknown'} / ${hardware?.arch || 'unknown'} / ${gpu.vendor} ${gpu.name}${vram}`;
};

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(unit === 0 ? 0 : 1) : value.toFixed(2)} ${units[unit]}`;
};

const installStatusTone = (status) => {
  if (status === 'error') return 'red';
  if (status === 'complete') return 'green';
  if (status === 'queued' || status === 'running') return 'blue';
  return 'gray';
};

const readableRuntime = (candidate) => (
  candidate?.runtime === 'python' ? 'Python runtime' : 'Native binary'
);

const engineMessage = (engineData, recommendation, managedProfileAvailable) => {
  const gpu = engineData?.hardware?.gpu;
  if (!recommendation) return 'Asyncat checks the local runtimes that power downloaded models.';
  if (recommendation.state === 'current_ok' && !gpu) {
    return 'This machine looks CPU-only right now, so the current local chat engine is the right default.';
  }
  if (recommendation.state === 'current_ok') {
    return `The active chat engine already matches this ${gpu?.vendor || 'machine'} setup.`;
  }
  if (recommendation.state === 'recommended_available') {
    return 'A better local chat engine is already installed. Switching can improve local model loading.';
  }
  if (managedProfileAvailable) {
    return 'Asyncat can install a better local chat engine for this machine from the engine tools.';
  }
  return 'A better chat runtime may be available, but it needs to be installed outside Asyncat and added here.';
};

const EngineCard = ({ icon: Icon, title, value, detail, status = 'gray' }) => (
  <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 midnight:border-slate-700 midnight:bg-slate-900 midnight:text-slate-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">{title}</h4>
          <Badge color={status}>{value}</Badge>
        </div>
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">{detail}</p>
      </div>
    </div>
  </div>
);

const EngineRuntimeSection = ({
  engineData,
  engineCatalog,
  loadingCatalog = false,
  installJob,
  loading = false,
  switchingKey = null,
  installingKey = null,
  switchError = '',
  switchSuccess = '',
  installError = '',
  installSuccess = '',
  revertSelection = null,
  retryModel = null,
  pythonInstallJob = null,
  pythonBuildError = '',
  pythonBuildSuccess = '',
  onRescan,
  onSwitch,
  onInstall,
  onBuildGpuRuntime,
  onRefreshCatalog,
  installReadiness = null,
}) => {
  const [showTools, setShowTools] = useState(false);
  const [showDetected, setShowDetected] = useState(false);
  const [customRuntime, setCustomRuntime] = useState('binary');
  const [customPath, setCustomPath] = useState('');

  const recommendation = engineData?.recommendation || null;
  const current = engineData?.current || null;
  const candidates = engineData?.candidates || [];
  const releases = engineCatalog?.releases || [];
  const canRetry = Boolean(retryModel);
  const actionError = switchError || installError || pythonBuildError;
  const actionSuccess = switchSuccess || installSuccess || pythonBuildSuccess;

  const recommendationCandidate = candidates.find(candidate => candidate.id === recommendation?.recommendedCandidateId) || null;
  const installProfile = INSTALL_PROFILE_LABELS[recommendation?.recommendedInstallProfile]
    ? recommendation.recommendedInstallProfile
    : null;
  const managedProfileAvailable = Boolean(
    installProfile
    && releases.some(release => release.assets?.some(asset => (
      asset.compatible && asset.supportedProfiles?.includes(installProfile)
    )))
  );

  const bestManagedAsset = useMemo(() => {
    if (!installProfile) return null;
    for (const release of releases) {
      const asset = release.assets?.find(item => item.compatible && item.supportedProfiles?.includes(installProfile));
      if (asset) return { release, asset };
    }
    return null;
  }, [installProfile, releases]);

  const activeInstallJob = installJob || engineCatalog?.activeJob || null;
  const activeBuildJob = pythonInstallJob || null;
  const missingRuntimeTools = (installReadiness?.checks || [])
    .filter(check => ['python', 'ffmpeg', 'whisper-server', 'piper', 'cxx-compiler', 'unzip', 'tar'].includes(check.id) && !check.ok)
    .slice(0, 5);
  const installCommand = installReadiness?.commands?.[0]?.command || '';

  const primaryAction = useMemo(() => {
    if (recommendationCandidate && !recommendationCandidate.isCurrent) {
      return {
        key: `${recommendationCandidate.runtime}:${recommendationCandidate.path}`,
        label: 'Switch to Recommended',
        icon: Zap,
        onClick: () => onSwitch?.({
          runtime: recommendationCandidate.runtime,
          path: recommendationCandidate.path,
        }, false),
      };
    }
    if (bestManagedAsset) {
      return {
        key: `install:${installProfile}`,
        label: 'Install Recommended',
        icon: Download,
        onClick: () => onInstall?.({
          profile: installProfile,
          releaseTag: bestManagedAsset.release.tagName,
          assetName: bestManagedAsset.asset.name,
        }, false),
      };
    }
    return null;
  }, [bestManagedAsset, installProfile, onInstall, onSwitch, recommendationCandidate]);

  const submitCustom = (retry = false) => {
    const path = customPath.trim();
    if (!path) return;
    onSwitch?.({ runtime: customRuntime, path }, retry);
  };
  const PrimaryActionIcon = primaryAction?.icon;

  const localEngines = [
    {
      icon: MessageSquare,
      title: 'Chat and Agents',
      value: current?.capabilityLabel || 'Not set',
      status: current ? capabilityBadgeColor(current.capabilityHint) : 'gray',
      detail: current
        ? `${readableRuntime(current)} handles downloaded GGUF and MLX-style local chat models.`
        : 'Choose a provider profile or load a local LLM in Chat and Agent Models.',
    },
    {
      icon: Mic,
      title: 'Speech-to-Text',
      value: 'Whisper or API',
      status: 'blue',
      detail: 'Choose hosted STT providers or local Whisper models in the Speech-to-Text section.',
    },
    {
      icon: Volume2,
      title: 'Text-to-Speech',
      value: 'Piper or API',
      status: 'amber',
      detail: 'Choose hosted TTS providers or local Piper voices in the Text-to-Speech section.',
    },
    {
      icon: Eye,
      title: 'Vision',
      value: 'Local or API',
      status: 'green',
      detail: 'Use vision providers or local multimodal assets from the Vision section.',
    },
    {
      icon: Image,
      title: 'Image Generation',
      value: 'Local or API',
      status: 'blue',
      detail: 'Use image providers or local diffusion assets from Image Generation.',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-5 dark:border-gray-800 dark:bg-gray-900/50 midnight:border-slate-800 midnight:bg-slate-950/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 midnight:bg-slate-100 midnight:text-slate-900">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-100 midnight:text-slate-100">
                  {actionError ? 'Local engines need attention' : 'Local engine map'}
                </h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                  {hardwareSummary(engineData?.hardware)}
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300 midnight:text-slate-300">
              {engineMessage(engineData, recommendation, managedProfileAvailable)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {primaryAction && (
              <button
                onClick={primaryAction.onClick}
                disabled={Boolean(switchingKey) || Boolean(installingKey)}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 midnight:bg-slate-100 midnight:text-slate-900"
              >
                {PrimaryActionIcon && <PrimaryActionIcon className={`h-3.5 w-3.5 ${switchingKey === primaryAction.key || installingKey === primaryAction.key ? 'animate-spin' : ''}`} />}
                {primaryAction.label}
              </button>
            )}
            {primaryAction && canRetry && (
              <button
                onClick={() => {
                  if (recommendationCandidate && !recommendationCandidate.isCurrent) {
                    onSwitch?.({ runtime: recommendationCandidate.runtime, path: recommendationCandidate.path }, true);
                  } else if (bestManagedAsset) {
                    onInstall?.({
                      profile: installProfile,
                      releaseTag: bestManagedAsset.release.tagName,
                      assetName: bestManagedAsset.asset.name,
                    }, true);
                  }
                }}
                disabled={Boolean(switchingKey) || Boolean(installingKey)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-900"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Last Model
              </button>
            )}
            <button
              onClick={() => onRescan?.({ clearActions: true })}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Rescan
            </button>
            <button
              onClick={() => setShowTools(value => !value)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 midnight:border-slate-700 midnight:bg-slate-900"
            >
              <Wrench className="h-3.5 w-3.5" />
              Engine Tools
              {showTools ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {actionError && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
        {actionSuccess && (
          <div className="mt-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300">
            {actionSuccess}
          </div>
        )}
        {missingRuntimeTools.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            <div className="flex items-start gap-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">
                  Missing runtime tools: {missingRuntimeTools.map(item => item.id).join(', ')}
                </p>
                {installCommand && (
                  <p className="mt-1 truncate font-mono text-xs text-amber-700 dark:text-amber-300">
                    {installCommand}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {localEngines.map(engine => <EngineCard key={engine.title} {...engine} />)}
      </div>

      {(activeInstallJob || activeBuildJob) && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20 midnight:border-blue-900/40 midnight:bg-blue-950/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                {activeBuildJob ? 'Building local chat runtime' : 'Installing local chat runtime'}
              </p>
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                {activeBuildJob?.message || activeInstallJob?.message || activeBuildJob?.status || activeInstallJob?.status}
              </p>
            </div>
            <Badge color={installStatusTone(activeBuildJob?.status || activeInstallJob?.status)}>
              {activeBuildJob?.status || activeInstallJob?.status}
            </Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${Math.max(5, Math.min(100, activeBuildJob?.progress || activeInstallJob?.progress || 0))}%` }}
            />
          </div>
        </div>
      )}

      {showTools && (
        <div className="space-y-4 rounded-2xl border border-dashed border-gray-200 p-4 dark:border-gray-700 midnight:border-slate-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Engine Tools</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                This controls only local chat runtimes. Speech, vision, and image providers stay in their own sections.
              </p>
            </div>
            <button
              onClick={() => onRefreshCatalog?.(true)}
              disabled={loadingCatalog}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
              Refresh Install Options
            </button>
          </div>

          {bestManagedAsset && (
            <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
                      Install {INSTALL_PROFILE_LABELS[installProfile]}
                    </h4>
                    <Badge color="gray">{formatBytes(bestManagedAsset.asset.size)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                    {bestManagedAsset.release.tagName} / {bestManagedAsset.asset.name}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onInstall?.({
                      profile: installProfile,
                      releaseTag: bestManagedAsset.release.tagName,
                      assetName: bestManagedAsset.asset.name,
                    }, false)}
                    disabled={Boolean(installingKey)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Install
                  </button>
                  <button
                    onClick={() => onInstall?.({
                      profile: installProfile,
                      releaseTag: bestManagedAsset.release.tagName,
                      assetName: bestManagedAsset.asset.name,
                    }, true)}
                    disabled={!canRetry || Boolean(installingKey)}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Install and Retry
                  </button>
                </div>
              </div>
            </div>
          )}

          {installProfile && !bestManagedAsset && (
            <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
                    Build {INSTALL_PROFILE_LABELS[installProfile]}
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                    No matching managed download was found in the current catalog, but Asyncat can try building a Python runtime.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onBuildGpuRuntime?.(installProfile, false)}
                    disabled={Boolean(activeBuildJob)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <TerminalSquare className="h-3.5 w-3.5" />
                    Build
                  </button>
                  <button
                    onClick={() => onBuildGpuRuntime?.(installProfile, true)}
                    disabled={!canRetry || Boolean(activeBuildJob)}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Build and Retry
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
            <button
              onClick={() => setShowDetected(value => !value)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Detected Chat Runtimes</h4>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
                  {candidates.length} installed runtime{candidates.length === 1 ? '' : 's'} found.
                </p>
              </div>
              {showDetected ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            {showDetected && (
              <div className="mt-4 space-y-2">
                {candidates.length === 0 && (
                  <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    No local chat runtimes were detected yet.
                  </p>
                )}
                {candidates.map(candidate => {
                  const key = `${candidate.runtime}:${candidate.path}`;
                  return (
                    <div key={candidate.id || key} className="flex flex-col gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{readableRuntime(candidate)}</span>
                          {candidate.isCurrent && <Badge color="green">Current</Badge>}
                          {candidate.isRecommended && <Badge color="amber">Recommended</Badge>}
                          <Badge color={capabilityBadgeColor(candidate.capabilityHint)}>{candidate.capabilityLabel}</Badge>
                        </div>
                        <p className="mt-1 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{candidate.path}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onSwitch?.({ runtime: candidate.runtime, path: candidate.path }, false)}
                          disabled={candidate.isCurrent || Boolean(switchingKey) || Boolean(installingKey)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          {switchingKey === key ? 'Switching...' : candidate.isCurrent ? 'Current' : 'Switch'}
                        </button>
                        <button
                          onClick={() => onSwitch?.({ runtime: candidate.runtime, path: candidate.path }, true)}
                          disabled={candidate.isCurrent || !canRetry || Boolean(switchingKey) || Boolean(installingKey)}
                          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 midnight:border-slate-800 midnight:bg-slate-950">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Add a Chat Runtime Path</h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              Use this when you installed llama-server or llama-cpp-python outside Asyncat.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr]">
              <select
                value={customRuntime}
                onChange={(event) => setCustomRuntime(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                <option value="binary">Binary</option>
                <option value="python">Python</option>
              </select>
              <input
                value={customPath}
                onChange={(event) => setCustomPath(event.target.value)}
                placeholder={customRuntime === 'python' ? '/path/to/python' : '/path/to/llama-server'}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => submitCustom(false)}
                disabled={!customPath.trim() || Boolean(switchingKey) || Boolean(installingKey)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Switch
              </button>
              <button
                onClick={() => submitCustom(true)}
                disabled={!customPath.trim() || !canRetry || Boolean(switchingKey) || Boolean(installingKey)}
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
              >
                Switch and Retry
              </button>
            </div>
          </div>

          {revertSelection && (
            <button
              onClick={() => onSwitch?.(revertSelection, false)}
              disabled={Boolean(switchingKey) || Boolean(installingKey)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/20"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Revert to Previous Chat Engine
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default EngineRuntimeSection;
