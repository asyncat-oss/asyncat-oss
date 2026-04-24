import { useState, useEffect, useRef } from 'react';
import { Server, RefreshCw, Play, Square, Trash2, Box, Cpu, Zap, Activity, Wrench, TriangleAlert, RotateCcw, TerminalSquare, ChevronDown, ChevronUp, Sparkles, HardDriveDownload, Download } from 'lucide-react';
import LocalModelsSection from './LocalModelsSection';
import { llamaServerApi, localModelsApi, aiProviderApi } from './settingApi.js';
import { useModelConfig } from '../CommandCenter/hooks/useModelConfig.js';

const Badge = ({ children, color = 'gray' }) => {
  const colors = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 midnight:bg-green-900/30 midnight:text-green-400',
    gray:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 midnight:bg-gray-800 midnight:text-gray-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 midnight:bg-amber-900/30 midnight:text-amber-400',
    red:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 midnight:bg-red-900/30 midnight:text-red-400',
    blue:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 midnight:bg-blue-900/30 midnight:text-blue-400',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
};

const STATUS_META = {
  idle:    { label: 'No model loaded', color: 'gray'  },
  loading: { label: 'Loading model…',  color: 'amber' },
  ready:   { label: 'Ready',           color: 'green' },
  error:   { label: 'Error',           color: 'red'   },
};

const ENGINE_STATE_META = {
  current_ok:             { title: 'Current setup is fine', color: 'green' },
  recommended_available:  { title: 'Recommended engine available on this machine', color: 'amber' },
  not_installed:          { title: 'Better engine not installed yet', color: 'blue' },
};

const ENGINE_KIND_LABELS = {
  cpu_safe: 'CPU-safe',
  nvidia_gpu: 'NVIDIA-ready',
  apple_metal: 'Metal-ready',
  amd_rocm: 'ROCm-ready',
  custom_gpu_needed: 'Install needed',
};

const INSTALL_PROFILE_LABELS = {
  cpu_safe: 'CPU-safe build',
  nvidia_gpu: 'NVIDIA CUDA build',
  apple_metal: 'Apple Metal build',
  amd_rocm: 'AMD ROCm build',
};

const INSTALL_PROFILE_HELP = {
  cpu_safe: 'Safest managed install for broad compatibility.',
  nvidia_gpu: 'Managed GPU-oriented install for NVIDIA systems.',
  apple_metal: 'Managed install tuned for Apple Silicon and Metal.',
  amd_rocm: 'Managed GPU-oriented install for ROCm-capable AMD systems.',
};

const MiniBar = ({ value, color = 'bg-indigo-500', max = 100 }) => {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  const barColor = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : color;
  return (
    <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex-1">
      <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
};

const OverviewCard = ({ icon: Icon, label, value, detail, tone = 'gray' }) => {
  const tones = {
    gray: 'from-white to-gray-50 border-gray-200 text-gray-700',
    blue: 'from-blue-50 to-white border-blue-200 text-blue-700',
    amber: 'from-amber-50 to-white border-amber-200 text-amber-700',
    green: 'from-green-50 to-white border-green-200 text-green-700',
  };
  const toneClass = tones[tone] || tones.gray;
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${toneClass} dark:from-gray-900 dark:to-gray-900 dark:border-gray-700 midnight:from-gray-900 midnight:to-gray-900 midnight:border-gray-800 p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{label}</div>
          <div className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">{value}</div>
          {detail && <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">{detail}</div>}
        </div>
        <div className="rounded-xl bg-white/80 dark:bg-gray-800 midnight:bg-gray-800 p-2 border border-black/5 dark:border-white/5">
          <Icon className="w-4 h-4 text-gray-700 dark:text-gray-300" />
        </div>
      </div>
    </div>
  );
};

const formatEnginePath = (value) => {
  if (!value) return 'Unknown';
  return value.length > 54 ? `…${value.slice(-54)}` : value;
};

const hardwareSummary = (hardware) => {
  const gpu = hardware?.gpu;
  if (!gpu) return `${hardware?.platform || 'unknown'} · ${hardware?.arch || 'unknown'} · CPU-safe recommended`;
  const vram = gpu.vramGb ? ` · ${gpu.vramGb} GB VRAM` : '';
  return `${hardware?.platform || 'unknown'} · ${hardware?.arch || 'unknown'} · ${gpu.vendor} ${gpu.name}${vram}`;
};

const conciseHardwareSummary = (hardware) => {
  const gpu = hardware?.gpu;
  if (!gpu) return `${hardware?.arch || 'unknown'} · CPU-safe`;
  const vram = gpu.vramGb ? ` · ${gpu.vramGb} GB` : '';
  return `${gpu.vendor}${vram}`;
};

const capabilityBadgeColor = (hint) => {
  if (hint === 'nvidia') return 'green';
  if (hint === 'apple') return 'blue';
  if (hint === 'amd') return 'amber';
  return 'gray';
};

const getInstallGuidance = (engineData) => {
  const gpu = engineData?.hardware?.gpu;
  if (!gpu) {
    return {
      title: 'CPU-safe mode is already the right default here.',
      steps: [
        'Use the managed Asyncat engine unless you have a specific custom runtime to test.',
      ],
      command: '',
    };
  }

  if (gpu.vendor === 'NVIDIA') {
    return {
      title: 'You can try the managed NVIDIA install here first, or add your own CUDA runtime.',
      steps: [
        'Use the Install Inside Asyncat panel to try the managed NVIDIA build directly from this page.',
        'Or download a CUDA-enabled llama.cpp / llama-server build and note its llama-server path.',
        'Or build a CUDA-enabled llama-cpp-python environment if you prefer the Python runtime.',
        'After a manual installation, click Rescan Installed Engines and then Switch Engine.',
      ],
      command: 'CMAKE_ARGS="-DGGML_CUDA=on" python -m pip install "llama-cpp-python[server]"',
    };
  }

  if (gpu.vendor === 'Apple') {
    return {
      title: 'Try the managed Metal install here first, or add your own runtime.',
      steps: [
        'Use the Install Inside Asyncat panel to try the managed Metal-oriented build directly from this page.',
        'Use a llama.cpp build with Metal support or a Python runtime that exposes llama-cpp-python server.',
        'After installation, click Rescan Installed Engines and switch to the detected runtime.',
      ],
      command: '',
    };
  }

  if (gpu.vendor === 'AMD') {
    return {
      title: 'Try the managed ROCm install here first, or add your own runtime.',
      steps: [
        'Use the Install Inside Asyncat panel to try the managed ROCm-oriented build directly from this page.',
        'Install a ROCm-enabled llama.cpp or llama-cpp-python runtime.',
        'After installation, click Rescan Installed Engines and switch to it here.',
      ],
      command: '',
    };
  }

  return {
    title: 'Install a GPU-capable runtime, then rescan.',
    steps: [
      'Install a compatible llama.cpp or llama-cpp-python server runtime for this machine.',
      'Rescan installed engines and switch to it here once it appears.',
    ],
    command: '',
  };
};

const getManualPathGuidance = (engineData, managedProfileAvailable) => {
  const hardware = engineData?.hardware;
  const gpu = hardware?.gpu;
  const platformLabel = hardware ? `${hardware.platform}-${hardware.arch}` : 'this machine';

  if (gpu?.vendor === 'NVIDIA' && hardware?.platform === 'linux') {
    return {
      title: 'Linux + NVIDIA: drivers are ready, but Asyncat still needs a CUDA-capable llama runtime.',
      body: `The current upstream llama.cpp release catalog does not include a managed NVIDIA CUDA asset for ${platformLabel}. Your NVIDIA driver and CUDA toolkit are the foundation, but Asyncat still needs a CUDA-built llama-server or llama-cpp-python runtime.`,
      steps: [
        'Build or install a CUDA-capable llama.cpp / llama-server runtime.',
        'Or build a CUDA-enabled llama-cpp-python[server] environment.',
        'Paste the resulting binary or Python path into Manual Engine Path below, then switch to it.',
      ],
      aside: "If you're using Linux, an explicit runtime path probably won't scare you.",
    };
  }

  if (!managedProfileAvailable && gpu) {
    return {
      title: `Managed ${gpu.vendor} install is not available for this machine right now.`,
      body: `Asyncat can still use a compatible custom runtime on ${platformLabel}; it just cannot download the exact managed variant from the current upstream release catalog.`,
      steps: [
        'Install a runtime that matches your hardware backend.',
        'Paste its path into Manual Engine Path below.',
        'Switch to it and retry the current model.',
      ],
      aside: '',
    };
  }

  return {
    title: 'Manual runtimes are still supported when you want full control.',
    body: 'If you already have a local llama-server binary or a llama-cpp-python server environment, you can point Asyncat to it directly here.',
    steps: [
      'Choose Binary or Python.',
      'Paste the runtime path.',
      'Switch to it and retry the current model if needed.',
    ],
    aside: '',
  };
};

const friendlyRecommendationBody = (engineData, recommendation) => {
  const gpu = engineData?.hardware?.gpu;
  if (!recommendation) {
    return 'Inspect the current engine and switch to a better local runtime when one is available.';
  }

  if (recommendation.state === 'current_ok' && !gpu) {
    return 'This machine looks CPU-only right now, so the current managed engine is already the best default.';
  }

  if (recommendation.state === 'current_ok') {
    return `Your current engine already matches this ${gpu?.vendor || 'machine'} setup, so you can focus on choosing the right model.`;
  }

  if (recommendation.state === 'recommended_available') {
    return `A better local engine is already installed on this machine. Switching should let Asyncat try GPU offload with a safer default of ${recommendation.suggestedGpuLayers} GPU layers.`;
  }

  if (recommendation.state === 'not_installed') {
    return `Asyncat only found the CPU-safe engine right now. Install a ${gpu?.vendor || 'GPU'}-capable runtime from this page when available, or add a manual runtime path and switch to it here.`;
  }

  return recommendation.body;
};

const managedInstallSupported = (profile) => Boolean(INSTALL_PROFILE_LABELS[profile]);

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
  if (status === 'running' || status === 'queued') return 'blue';
  return 'gray';
};

const capabilityHintForProfile = (profile) => {
  if (profile === 'nvidia_gpu') return 'nvidia';
  if (profile === 'apple_metal') return 'apple';
  if (profile === 'amd_rocm') return 'amd';
  return 'cpu_safe';
};

const RuntimePill = ({ candidate }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="text-xs font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">
      {candidate.runtime === 'python' ? 'Python runtime' : 'Native binary'}
    </span>
    {candidate.isCurrent && <Badge color="green">Current</Badge>}
    {candidate.isRecommended && <Badge color="amber">Recommended</Badge>}
    <Badge color={capabilityBadgeColor(candidate.capabilityHint)}>{candidate.capabilityLabel}</Badge>
    {candidate.runtime === 'python' && <Badge color="blue">Python</Badge>}
    {candidate.managed && <Badge color="blue">Managed</Badge>}
  </div>
);

const EngineAdvisorSection = ({
  engineData,
  engineCatalog,
  loadingCatalog,
  installJob,
  loading,
  switchingKey,
  installingKey,
  switchError,
  switchSuccess,
  installError,
  installSuccess,
  revertSelection,
  retryModel,
  onRescan,
  onSwitch,
  onInstall,
  onRefreshCatalog,
}) => {
  const [customPath, setCustomPath] = useState('');
  const [customRuntime, setCustomRuntime] = useState('binary');
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showInstallerControls, setShowInstallerControls] = useState(false);
  const [expandedCandidate, setExpandedCandidate] = useState(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showCurrentEnginePath, setShowCurrentEnginePath] = useState(false);
  const [selectedReleaseTag, setSelectedReleaseTag] = useState('');
  const [selectedAssetName, setSelectedAssetName] = useState('');
  const [showAllCatalogAssets, setShowAllCatalogAssets] = useState(false);

  const recommendation = engineData?.recommendation || null;
  const current = engineData?.current || null;
  const installGuidance = getInstallGuidance(engineData);
  const actionError = switchError || installError;
  const actionSuccess = switchSuccess || installSuccess;
  const stateMeta = actionError
    ? { title: 'Engine action failed', color: 'red' }
    : ENGINE_STATE_META[recommendation?.state] || { title: recommendation?.title || 'Engine Advisor', color: 'gray' };
  const canRetry = Boolean(retryModel);
  const recommendationCandidate = engineData?.candidates?.find(candidate => candidate.id === recommendation?.recommendedCandidateId) || null;
  const installProfile = managedInstallSupported(recommendation?.recommendedInstallProfile)
    ? recommendation.recommendedInstallProfile
    : null;
  const canInstallRecommended = Boolean(installProfile);
  const installKeyBase = installProfile ? `install:${installProfile}` : null;
  const isInstallingRecommended = installingKey === installKeyBase || installingKey === `${installKeyBase}:retry`;
  const releases = engineCatalog?.releases || [];
  const activeInstallJob = installJob || engineCatalog?.activeJob || null;
  const catalogLoading = loadingCatalog || loading;
  const managedProfileAvailable = installProfile
    ? releases.some(release => release.assets.some(asset => asset.compatible && asset.supportedProfiles.includes(installProfile)))
    : false;
  const manualPathGuidance = getManualPathGuidance(engineData, managedProfileAvailable);
  const hasCpuSafeCandidate = Boolean(engineData?.candidates?.some(candidate => candidate.capabilityHint === 'cpu_safe'));
  const needsManagedInstall = !current || recommendation?.state === 'not_installed';
  const showManagedInstallerControls = needsManagedInstall || showInstallerControls;
  const showRecommendedInstallCard = canInstallRecommended
    && managedProfileAvailable
    && needsManagedInstall
    && (!current?.managed || current?.managedProfile !== installProfile);

  useEffect(() => {
    if (!releases.length) return;
    const fallbackRelease = releases.find(release => release.compatibleAssetCount > 0) || releases[0];
    if (!selectedReleaseTag || !releases.some(release => release.tagName === selectedReleaseTag)) {
      setSelectedReleaseTag(fallbackRelease.tagName);
    }
  }, [releases, selectedReleaseTag]);

  const selectedRelease = releases.find(release => release.tagName === selectedReleaseTag) || releases[0] || null;
  const visibleAssets = selectedRelease
    ? (() => {
        const compatibleAssets = selectedRelease.assets.filter(asset => asset.compatible);
        if (showAllCatalogAssets || compatibleAssets.length === 0) return selectedRelease.assets;
        return compatibleAssets;
      })()
    : [];

  useEffect(() => {
    if (!selectedRelease) return;
    const pool = selectedRelease.assets.filter(asset => asset.compatible);
    const fallbackAsset = pool.find(asset => installProfile ? asset.supportedProfiles.includes(installProfile) : true)
      || pool[0]
      || selectedRelease.assets[0]
      || null;
    if (!selectedAssetName || !selectedRelease.assets.some(asset => asset.name === selectedAssetName)) {
      setSelectedAssetName(fallbackAsset?.name || '');
    }
  }, [selectedRelease, selectedAssetName, installProfile]);

  const selectedAsset = selectedRelease?.assets?.find(asset => asset.name === selectedAssetName) || null;
  const installPayload = {
    profile: selectedAsset?.suggestedProfile || installProfile || 'cpu_safe',
    releaseTag: selectedRelease?.tagName || undefined,
    assetName: selectedAsset?.name || undefined,
  };
  const primaryAction = recommendationCandidate && !recommendationCandidate.isCurrent
    ? {
        type: 'switch',
        label: 'Switch to Recommended Engine',
        retryLabel: 'Switch + Retry Current Model',
        run: (retry) => onSwitch({ runtime: recommendationCandidate.runtime, path: recommendationCandidate.path }, retry),
      }
    : canInstallRecommended && recommendation?.state === 'not_installed'
      && managedProfileAvailable
      ? {
          type: 'install',
          label: `Install ${INSTALL_PROFILE_LABELS[installProfile]}`,
          retryLabel: 'Install + Retry Current Model',
          run: (retry) => onInstall({ profile: installProfile }, retry),
        }
      : null;
  const hardwarePlatformLabel = engineData?.hardware
    ? `${engineData.hardware.platform}-${engineData.hardware.arch}`
    : 'this machine';

  const submitCustom = (retry) => {
    const trimmed = customPath.trim();
    if (!trimmed) return;
    onSwitch({ runtime: customRuntime, path: trimmed }, retry);
  };

  return (
    <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Wrench className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-200">Engine Advisor</h3>
        {loading && <RefreshCw className="w-3 h-3 animate-spin text-gray-400 ml-auto" />}
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-3 bg-gray-50/80 dark:bg-gray-900/40 midnight:bg-gray-950/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                {actionError ? (
                  <TriangleAlert className="w-4 h-4 text-red-500" />
                ) : (
                  <Zap className="w-4 h-4 text-amber-500" />
                )}
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100">{stateMeta.title}</span>
              </div>
              <p className={`mt-2 text-xs leading-5 ${actionError ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 midnight:text-gray-400'}`}>
                {actionError || friendlyRecommendationBody(engineData, recommendation)}
              </p>
              {actionSuccess && !actionError && (
                <p className="mt-2 text-xs text-green-600 dark:text-green-400">{actionSuccess}</p>
              )}
            </div>
            <Badge color={stateMeta.color}>{ENGINE_KIND_LABELS[recommendation?.kind] || 'Advisor'}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {primaryAction ? (
              <>
                <button
                  onClick={() => primaryAction.run(false)}
                  disabled={Boolean(switchingKey) || Boolean(installingKey)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 ${
                    primaryAction.type === 'install'
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/10'
                  }`}
                >
                  {primaryAction.type === 'install' && <Download className="w-3.5 h-3.5" />}
                  {primaryAction.label}
                </button>
                <button
                  onClick={() => primaryAction.run(true)}
                  disabled={!canRetry || Boolean(switchingKey) || Boolean(installingKey)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900 disabled:opacity-50"
                >
                  {primaryAction.retryLabel}
                </button>
              </>
            ) : null}
            <button
              onClick={onRescan}
              disabled={loading || Boolean(switchingKey) || Boolean(installingKey)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Rescan
            </button>
            <button
              onClick={() => setShowAdvancedOptions(prev => !prev)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Advanced Options
              {showAdvancedOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          {!primaryAction && recommendation?.state === 'not_installed' && !managedProfileAvailable && (
            <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 midnight:bg-amber-950/20 p-3">
              <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {manualPathGuidance.title}
              </div>
              <p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-100/80">
                {manualPathGuidance.body}
              </p>
              {!!manualPathGuidance.aside && (
                <p className="mt-2 text-[11px] italic text-amber-900/70 dark:text-amber-100/70">
                  {manualPathGuidance.aside}
                </p>
              )}
            </div>
          )}
        </div>

	        <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-3">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">This Machine</div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div className="rounded-xl bg-gray-50/80 dark:bg-gray-900/50 midnight:bg-gray-950/50 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Engine In Use</div>
              {current ? (
                <div className="mt-2 space-y-1">
                  <RuntimePill candidate={current} />
                  <div className="text-[11px] text-gray-500 dark:text-gray-500">{current.source}</div>
                  {current.managedProfile && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-500">
                      Managed profile: {INSTALL_PROFILE_LABELS[current.managedProfile] || current.managedProfile}
                    </div>
                  )}
                  {showCurrentEnginePath && (
                    <div className="rounded-lg bg-white dark:bg-gray-900 midnight:bg-black/30 px-3 py-2 text-[11px] font-mono text-gray-600 dark:text-gray-400 break-all">
                      {current.path}
                    </div>
                  )}
                  <button
                    onClick={() => setShowCurrentEnginePath(prev => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400"
                  >
                    {showCurrentEnginePath ? 'Hide path' : 'Show path'}
                    {showCurrentEnginePath ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No working local engine is configured right now.</p>
              )}
            </div>
            <div className="rounded-xl bg-gray-50/80 dark:bg-gray-900/50 midnight:bg-gray-950/50 border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Hardware</div>
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                {hardwareSummary(engineData?.hardware)}
              </p>
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-500">
                Suggested GPU layers: {recommendation?.suggestedGpuLayers ?? 0}
              </p>
            </div>
          </div>
        </div>

        {activeInstallJob && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">Managed Install Progress</span>
                  <Badge color={installStatusTone(activeInstallJob.status)}>
                    {activeInstallJob.status === 'running' ? 'Running' : activeInstallJob.status === 'complete' ? 'Complete' : activeInstallJob.status === 'error' ? 'Failed' : 'Queued'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400 midnight:text-gray-400">
                  {activeInstallJob.message || 'Preparing managed engine install…'}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">{Math.round(activeInstallJob.percent || 0)}%</div>
                {activeInstallJob.assetName && (
                  <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">{activeInstallJob.assetName}</div>
                )}
              </div>
            </div>
            <div className="mt-3">
              <MiniBar value={activeInstallJob.percent || 0} color="bg-blue-500" />
            </div>
            {(activeInstallJob.downloadedBytes || activeInstallJob.totalBytes) && (
              <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-500">
                {formatBytes(activeInstallJob.downloadedBytes || 0)}
                {activeInstallJob.totalBytes ? ` / ${formatBytes(activeInstallJob.totalBytes)}` : ''}
              </div>
            )}
          </div>
        )}

        {showAdvancedOptions && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Advanced Engine Tools</div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400 dark:text-gray-500">Manual control and version picker</span>
              <button
                onClick={() => onRefreshCatalog(true)}
                disabled={catalogLoading || Boolean(installingKey)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${catalogLoading ? 'animate-spin' : ''}`} />
                Refresh catalog
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {showRecommendedInstallCard ? (
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                      Recommended: {INSTALL_PROFILE_LABELS[installProfile]}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-blue-900/80 dark:text-blue-100/80">
                      {INSTALL_PROFILE_HELP[installProfile]}
                    </p>
                  </div>
                  <Badge color="blue">Managed</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => onInstall({ profile: installProfile }, false)}
                    disabled={Boolean(switchingKey) || Boolean(installingKey)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isInstallingRecommended && installingKey === installKeyBase ? 'Installing…' : 'Install Managed Engine'}
                  </button>
                  <button
                    onClick={() => onInstall({ profile: installProfile }, true)}
                    disabled={!canRetry || Boolean(switchingKey) || Boolean(installingKey)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/10 disabled:opacity-50"
                  >
                    {isInstallingRecommended && installingKey === `${installKeyBase}:retry` ? 'Installing…' : 'Install + Retry'}
                  </button>
                </div>
              </div>
	            ) : (
	              <p className="text-xs text-gray-500 dark:text-gray-400">
	                {!showManagedInstallerControls
	                  ? 'Detected engines are already installed on this machine. Use Detected Engines to switch; reinstall controls are hidden unless you explicitly open them.'
	                  : canInstallRecommended && !managedProfileAvailable
	                  ? `Asyncat does not currently have a matching managed ${INSTALL_PROFILE_LABELS[installProfile] || installProfile} asset for ${hardwarePlatformLabel}. Use the manual/custom runtime path below, or pick another compatible asset in the advanced installer.`
	                  : needsManagedInstall
	                  ? 'Install a managed runtime only if no detected engine matches this machine yet.'
	                  : 'Installer controls are available for manual repair or version pinning.'}
	              </p>
	            )}

	            {showManagedInstallerControls ? (
	            <>
	            <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Advanced Installer</div>
                  <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
                    Pick a llama.cpp release and exact asset for this machine, then install it directly from Model Studio.
                  </p>
                </div>
                {selectedAsset && (
                  <Badge color={capabilityBadgeColor(capabilityHintForProfile(selectedAsset.suggestedProfile))}>
                    {INSTALL_PROFILE_LABELS[selectedAsset.suggestedProfile] || selectedAsset.suggestedProfile}
                  </Badge>
                )}
              </div>

              {!selectedRelease ? (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Release catalog is unavailable right now. Refresh the catalog and try again.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Release version</label>
                      <select
                        value={selectedReleaseTag}
                        onChange={(e) => setSelectedReleaseTag(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100"
                      >
                        {releases.map(release => (
                          <option key={release.tagName} value={release.tagName}>
                            {release.tagName}{release.prerelease ? ' · prerelease' : ''} · {release.compatibleAssetCount} compatible assets
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Asset variant</label>
                        <button
                          onClick={() => setShowAllCatalogAssets(prev => !prev)}
                          className="text-[11px] font-medium text-gray-500 dark:text-gray-400"
                        >
                          {showAllCatalogAssets ? 'Show compatible only' : 'Show all archive assets'}
                        </button>
                      </div>
                      <select
                        value={selectedAssetName}
                        onChange={(e) => setSelectedAssetName(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white dark:bg-gray-900 midnight:bg-gray-950 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100"
                      >
                        {visibleAssets.map(asset => (
                          <option key={asset.name} value={asset.name}>
                            {asset.name} · {asset.sizeFormatted}{asset.compatible ? '' : ' · not for this machine'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {selectedAsset && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-3 bg-gray-50/70 dark:bg-gray-900/50 midnight:bg-gray-950/50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-gray-100 break-all">{selectedAsset.name}</div>
                          <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">
                            {selectedAsset.sizeFormatted}
                            {selectedRelease?.publishedAt ? ` · ${new Date(selectedRelease.publishedAt).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {selectedAsset.supportedProfiles.map(profile => (
                            <Badge key={profile} color={profile === installProfile ? 'blue' : 'gray'}>
                              {INSTALL_PROFILE_LABELS[profile] || profile}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {selectedAsset.tags?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {selectedAsset.tags.map(tag => (
                            <Badge key={tag} color="gray">{tag}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => onInstall(installPayload, false)}
                          disabled={!selectedAsset.compatible || Boolean(switchingKey) || Boolean(installingKey)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900 disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Install Selected Asset
                        </button>
                        <button
                          onClick={() => onInstall(installPayload, true)}
                          disabled={!selectedAsset.compatible || !canRetry || Boolean(switchingKey) || Boolean(installingKey)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                        >
                          Install + Retry Current Model
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

	            {!hasCpuSafeCandidate && (
	            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 midnight:border-gray-800 p-3">
	              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Fallback managed install</div>
	              <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
	                Install the default Asyncat engine if no CPU-safe runtime is already detected.
	              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => onInstall({ profile: 'cpu_safe' }, false)}
                  disabled={Boolean(switchingKey) || Boolean(installingKey)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
	                  {installingKey === 'install:cpu_safe' ? 'Installing…' : 'Install CPU-safe Engine'}
                </button>
                <button
                  onClick={() => onInstall({ profile: 'cpu_safe' }, true)}
                  disabled={!canRetry || Boolean(switchingKey) || Boolean(installingKey)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900 disabled:opacity-50"
                >
	                  {installingKey === 'install:cpu_safe:retry' ? 'Installing…' : 'Install + Retry'}
	                </button>
	              </div>
	            </div>
	            )}
	            </>
	            ) : (
	              <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 midnight:bg-gray-950/40 p-3">
	                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Installed engines are ready</div>
	                <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">
	                  The local llama.cpp runtimes are already detected. Switching uses the downloaded engines directly; reinstalling would replace files in the managed runtime folder.
	                </p>
	                <button
	                  onClick={() => setShowInstallerControls(true)}
	                  className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800"
	                >
	                  Show reinstall controls
	                </button>
	              </div>
	            )}
	          </div>
        </div>
        )}

        {showAdvancedOptions && recommendation?.state === 'not_installed' && (
          <div className="rounded-xl border border-dashed border-amber-200 dark:border-amber-800 p-3 bg-amber-50/40 dark:bg-amber-900/10">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TerminalSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <div className="text-xs font-medium text-amber-900 dark:text-amber-200">{installGuidance.title}</div>
              </div>
              <button
                onClick={() => setShowInstallHelp(prev => !prev)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300"
              >
                {showInstallHelp ? 'Hide' : 'Show'}
                {showInstallHelp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
            {showInstallHelp && (
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  {installGuidance.steps.map((step) => (
                    <p key={step} className="text-xs leading-5 text-amber-900/80 dark:text-amber-100/80">{step}</p>
                  ))}
                </div>
                {installGuidance.command && (
                  <div className="rounded-lg bg-gray-950 text-gray-100 px-3 py-2 text-[11px] font-mono overflow-x-auto">
                    {installGuidance.command}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showAdvancedOptions && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Detected Engines</div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{engineData?.candidates?.length || 0} found</span>
          </div>
          <div className="mt-3 space-y-2">
            {(engineData?.candidates || []).map((rawCandidate) => {
              const candidate = {
                ...rawCandidate,
                isRecommended: rawCandidate.id === recommendation?.recommendedCandidateId,
              };
              const key = `${candidate.runtime}:${candidate.path}`;
              const isSwitching = switchingKey === key || switchingKey === `${key}:retry`;
              const isExpanded = expandedCandidate === candidate.id;

              return (
                <div
                  key={candidate.id}
                  className={`rounded-xl border p-3 transition-colors ${candidate.isRecommended ? 'border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/10' : 'border-gray-200 dark:border-gray-700 midnight:border-gray-800'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <RuntimePill candidate={candidate} />
                      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">{candidate.source}</div>
                      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                        {candidate.isCurrent
                          ? 'This is the engine Asyncat is currently using.'
                          : candidate.isRecommended
                            ? 'Best detected match for this machine right now.'
                            : 'Available local engine you can switch to.'}
                      </div>
                      {isExpanded && (
                        <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 px-3 py-2 text-[11px] font-mono text-gray-600 dark:text-gray-400 break-all">
                          {candidate.path}
                        </div>
                      )}
                      <button
                        onClick={() => setExpandedCandidate(prev => prev === candidate.id ? null : candidate.id)}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400"
                      >
                        {isExpanded ? 'Hide path' : 'Show path'}
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="flex flex-col gap-2 w-28 shrink-0">
                      <button
                        onClick={() => onSwitch({ runtime: candidate.runtime, path: candidate.path }, false)}
                        disabled={candidate.isCurrent || Boolean(switchingKey) || Boolean(installingKey)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        {isSwitching && switchingKey === key ? 'Switching…' : candidate.isCurrent ? 'Current' : 'Switch'}
                      </button>
                      <button
                        onClick={() => onSwitch({ runtime: candidate.runtime, path: candidate.path }, true)}
                        disabled={candidate.isCurrent || !canRetry || Boolean(switchingKey) || Boolean(installingKey)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900 disabled:opacity-50"
                      >
                        {isSwitching && switchingKey === `${key}:retry` ? 'Retrying…' : 'Retry Load'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {showAdvancedOptions && (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 midnight:border-gray-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Manual Engine Path</div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">For engines installed outside Asyncat</span>
          </div>
          <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40 midnight:bg-gray-950/40 p-3">
            <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-100">
              {manualPathGuidance.title}
            </div>
            <p className="mt-1 text-[11px] leading-5 text-gray-600 dark:text-gray-400 midnight:text-gray-400">
              {manualPathGuidance.body}
            </p>
            <div className="mt-2 space-y-1.5">
              {manualPathGuidance.steps.map(step => (
                <p key={step} className="text-[11px] leading-5 text-gray-500 dark:text-gray-400 midnight:text-gray-400">
                  {step}
                </p>
              ))}
            </div>
            {!!manualPathGuidance.aside && (
              <p className="mt-2 text-[11px] italic text-gray-500 dark:text-gray-500">
                {manualPathGuidance.aside}
              </p>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <select
              value={customRuntime}
              onChange={(e) => setCustomRuntime(e.target.value)}
              className="w-32 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-200"
            >
              <option value="binary">Binary</option>
              <option value="python">Python</option>
            </select>
            <input
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder={customRuntime === 'python' ? '/path/to/python' : '/path/to/llama-server'}
              className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-200"
            />
          </div>
          <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-500">
            Install the runtime first, paste its path here, switch to it, then retry the current model if needed.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => submitCustom(false)}
              disabled={!customPath.trim() || Boolean(switchingKey) || Boolean(installingKey)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Switch Engine
            </button>
            <button
              onClick={() => submitCustom(true)}
              disabled={!customPath.trim() || !canRetry || Boolean(switchingKey) || Boolean(installingKey)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900 disabled:opacity-50"
            >
              Switch + Retry Last Model
            </button>
          </div>
        </div>
        )}

        {revertSelection && (
          <button
            onClick={() => onSwitch(revertSelection, false)}
            disabled={Boolean(switchingKey) || Boolean(installingKey)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-xl border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/10 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Revert to Previous Engine
          </button>
        )}
      </div>
    </div>
  );
};

const SystemInfoSection = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await aiProviderApi.getStats();
        if (res.success) setStats(res);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 8000);
    return () => clearInterval(interval);
  }, []);

  const cpu = stats?.hardware?.cpu;
  const ram = stats?.hardware?.ram;
  const gpu = stats?.hardware?.gpu?.[0];

  return (
    <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-200">System Resources</h3>
        {loading && <RefreshCw className="w-3 h-3 animate-spin text-gray-400 ml-auto" />}
      </div>

      {cpu && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <Cpu className="w-3.5 h-3.5" />
              <span className="truncate max-w-[120px]">{cpu.model?.split('@')[0]?.trim() || 'CPU'}</span>
            </div>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{cpu.usagePercent}%</span>
          </div>
          <MiniBar value={cpu.usagePercent} color="bg-blue-500" />
        </div>
      )}

      {ram && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-600 dark:text-gray-400">RAM</span>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {ram.usedGb}/{ram.totalGb} GB
            </span>
          </div>
          <MiniBar value={ram.usagePercent} color="bg-indigo-500" />
        </div>
      )}

      {gpu && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
              <Zap className="w-3.5 h-3.5 text-yellow-500" />
              <span className="truncate max-w-[120px]">{gpu.name?.split(' ').slice(0, 2).join(' ') || 'GPU'}</span>
            </div>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {gpu.utilizationPercent}%{gpu.temperatureC ? ` · ${gpu.temperatureC}°C` : ''}
            </span>
          </div>
          <MiniBar value={gpu.utilizationPercent} color="bg-yellow-500" />
          {gpu.vramTotalGb > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">VRAM</span>
                <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
                  {gpu.vramUsedGb}/{gpu.vramTotalGb} GB
                </span>
              </div>
              <MiniBar value={gpu.vramUsedGb} max={gpu.vramTotalGb} color="bg-green-500" />
            </div>
          )}
        </div>
      )}

      {!cpu && !gpu && !loading && (
        <div className="text-xs text-gray-400 dark:text-gray-500">No hardware data available</div>
      )}

      {stats?.modelHardwareInfo && (
        <div className="pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          <div className="font-medium text-gray-600 dark:text-gray-400">{stats.modelHardwareInfo.name}</div>
          {stats.modelHardwareInfo.sizeVram && <div className="mt-0.5">{stats.modelHardwareInfo.sizeVram} VRAM</div>}
          {stats.modelHardwareInfo.gpuLayers && <div className="mt-0.5">{stats.modelHardwareInfo.gpuLayers} GPU layers</div>}
        </div>
      )}
    </div>
  );
};

const ModelsPage = () => {
  const { config } = useModelConfig();
  const [serverStatus, setServerStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [engineData, setEngineData] = useState(null);
  const [engineCatalog, setEngineCatalog] = useState(null);
  const [installJob, setInstallJob] = useState(null);
  const [storage, setStorage] = useState(null);
  const [activeTab, setActiveTab] = useState('library');
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingEngines, setLoadingEngines] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [startingModel, setStartingModel] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [deletingModel, setDeletingModel] = useState(null);
  const [switchingEngine, setSwitchingEngine] = useState(null);
  const [installingEngine, setInstallingEngine] = useState(null);
  const [switchError, setSwitchError] = useState('');
  const [switchSuccess, setSwitchSuccess] = useState('');
  const [installError, setInstallError] = useState('');
  const [installSuccess, setInstallSuccess] = useState('');
  const [revertSelection, setRevertSelection] = useState(null);
  const pollCleanup = useRef(null);
  const installPollCleanup = useRef(null);

  useEffect(() => {
    loadStatus();
    loadModelList();
    loadEngineData();
    loadEngineCatalog();
    return () => {
      pollCleanup.current?.();
      installPollCleanup.current?.();
    };
  }, []);

  const clearEngineActionMessages = () => {
    setSwitchError('');
    setSwitchSuccess('');
    setInstallError('');
    setInstallSuccess('');
    setRevertSelection(null);
    setShowInstallerControls(false);
  };

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const snap = await llamaServerApi.getStatus();
      setServerStatus(snap);
    } catch (err) {
      console.warn('Failed to load server status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadModelList = async () => {
    setLoadingModels(true);
    try {
      const res = await localModelsApi.listModels();
      if (res.success) {
        setModels(res.models || []);
        setStorage(res.storage || null);
      }
    } catch (err) {
      console.warn('Failed to load models:', err);
    } finally {
      setLoadingModels(false);
    }
  };

  const loadEngineData = async ({ clearActions = false } = {}) => {
    setLoadingEngines(true);
    try {
      const res = await llamaServerApi.getEngines();
      if (res.success) {
        setEngineData(res);
        if (clearActions && res.recommendation?.state === 'current_ok') {
          clearEngineActionMessages();
        }
      }
    } catch (err) {
      console.warn('Failed to load engine advisor:', err);
    } finally {
      setLoadingEngines(false);
    }
  };

  const beginInstallJobPolling = (jobId) => {
    if (!jobId) return;
    installPollCleanup.current?.();
    installPollCleanup.current = llamaServerApi.pollInstallJob(
      jobId,
      (job) => setInstallJob(job),
      async (job) => {
        setInstallJob(job);
        setInstallingEngine(null);
        installPollCleanup.current = null;
        if (job.advisor) setEngineData(job.advisor);
        if (job.statusSnapshot) setServerStatus(job.statusSnapshot);
        await loadEngineCatalog(true);
        await loadEngineData();

        if (job.retry?.attempted && !job.retry.success) {
          setInstallError(job.retry.error || 'Engine installed, but retrying the model failed.');
          setRevertSelection(job.previousSelection || null);
          return;
        }

        const label = INSTALL_PROFILE_LABELS[job.install?.profile] || 'Managed engine';
        const asset = job.install?.asset ? ` (${job.install.asset})` : '';
        setInstallSuccess(`${label} installed${asset}. GPU layers set to ${job.install?.gpuLayers}.`);
        setInstallError('');
        setRevertSelection(null);

        if (job.retry?.attempted && job.retry.success) {
          pollInstallRetry(job.previousSelection || null, job.install?.profile || job.profile || 'cpu_safe');
        }
      },
      async (job) => {
        setInstallJob(job);
        setInstallingEngine(null);
        installPollCleanup.current = null;
        setInstallError(job?.error || 'Failed to install engine.');
        await loadEngineCatalog(true);
      },
    );
  };

  const loadEngineCatalog = async (refresh = false) => {
    setLoadingCatalog(true);
    try {
      const res = await llamaServerApi.getEngineCatalog(refresh);
      if (res.success) {
        setEngineCatalog(res);
        const activeJob = res.activeJob || null;
        setInstallJob(activeJob);
        if (activeJob) {
          if (activeJob.status === 'queued' || activeJob.status === 'running') {
            setInstallingEngine(`install:${activeJob.profile || 'cpu_safe'}${activeJob.retryModel ? ':retry' : ''}`);
          } else {
            setInstallingEngine(null);
          }
          if (activeJob.status === 'queued' || activeJob.status === 'running') {
            beginInstallJobPolling(activeJob.id);
          }
        } else {
          setInstallingEngine(null);
        }
      }
    } catch (err) {
      console.warn('Failed to load engine catalog:', err);
    } finally {
      setLoadingCatalog(false);
    }
  };

  const pollEngineRetry = (previousSelection = null) => {
    pollCleanup.current?.();
    pollCleanup.current = llamaServerApi.pollStatus(
      (snap) => setServerStatus(snap),
      async (snap) => {
        setServerStatus(snap);
        pollCleanup.current = null;
        setSwitchSuccess(`Engine switched and ${snap.model || 'the model'} is loading successfully.`);
        setSwitchError('');
        setRevertSelection(null);
        await loadEngineData();
      },
      async (snap) => {
        setServerStatus(snap);
        pollCleanup.current = null;
        setSwitchError(snap?.error || 'Engine switched, but retrying the model failed.');
        if (previousSelection) setRevertSelection(previousSelection);
        await loadEngineData();
      },
    );
  };

  const pollInstallRetry = (previousSelection = null, profile = 'cpu_safe') => {
    pollCleanup.current?.();
    pollCleanup.current = llamaServerApi.pollStatus(
      (snap) => setServerStatus(snap),
      async (snap) => {
        setServerStatus(snap);
        pollCleanup.current = null;
        setInstallSuccess(`${INSTALL_PROFILE_LABELS[profile] || 'Managed engine'} installed and ${snap.model || 'the model'} is loading successfully.`);
        setInstallError('');
        setRevertSelection(null);
        await loadEngineData();
      },
      async (snap) => {
        setServerStatus(snap);
        pollCleanup.current = null;
        setInstallError(snap?.error || 'Engine installed, but retrying the model failed.');
        if (previousSelection) setRevertSelection(previousSelection);
        await loadEngineData();
      },
    );
  };

  const handleStart = async (filename) => {
    setStartingModel(filename);
    try {
      await llamaServerApi.start(filename, config.ctx_size);
      setServerStatus(prev => ({ ...prev, status: 'loading', model: filename }));
      pollCleanup.current?.();
      pollCleanup.current = llamaServerApi.pollStatus(
        (snap) => setServerStatus(snap),
        (snap) => { setServerStatus(snap); setStartingModel(null); pollCleanup.current = null; },
        (snap) => { setServerStatus(snap); setStartingModel(null); pollCleanup.current = null; },
      );
    } catch (err) {
      setServerStatus(prev => ({ ...prev, status: 'error', error: err.message }));
      setStartingModel(null);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    pollCleanup.current?.();
    pollCleanup.current = null;
    try {
      await llamaServerApi.stop();
      setServerStatus({ status: 'idle', model: null });
    } catch (err) {
      console.error('Failed to stop server:', err);
    } finally {
      setStopping(false);
    }
  };

  const handleDelete = async (filename) => {
    setDeletingModel(filename);
    try {
      await localModelsApi.deleteModel(filename);
      await loadModelList();
    } catch (err) {
      console.error('Failed to delete model:', err);
    } finally {
      setDeletingModel(null);
    }
  };

  const handleEngineSwitch = async (selection, retryModelAfterSwitch) => {
    const key = `${selection.runtime}:${selection.path}${retryModelAfterSwitch ? ':retry' : ''}`;
    setSwitchingEngine(key);
    setSwitchError('');
    setSwitchSuccess('');
    setInstallError('');
    setInstallSuccess('');
    try {
      const res = await llamaServerApi.selectEngine({
        runtime: selection.runtime,
        path: selection.path,
        retryModel: retryModelAfterSwitch ? serverStatus?.model || undefined : undefined,
        ctxSize: retryModelAfterSwitch ? config.ctx_size : undefined,
      });

      setEngineData(res.advisor || null);
      setServerStatus(res.statusSnapshot || null);

      if (res.retry?.attempted && !res.retry.success) {
        setSwitchError(res.retry.error || 'Engine switched, but retrying the model failed.');
        setRevertSelection(res.previousSelection || null);
      } else {
        setSwitchSuccess(`Engine switched to ${res.applied?.runtime === 'python' ? 'Python runtime' : 'native binary'} with GPU layers set to ${res.applied?.gpuLayers}.`);
        setRevertSelection(null);
      }

      if (res.retry?.attempted && res.retry.success) {
        pollEngineRetry(res.previousSelection || null);
      } else {
        await loadEngineData();
      }
    } catch (err) {
      setSwitchError(err.message || 'Failed to switch engine.');
    } finally {
      setSwitchingEngine(null);
    }
  };

  const handleManagedInstall = async (selection, retryModelAfterInstall) => {
    const profile = selection?.profile || 'cpu_safe';
    const key = `install:${profile}${retryModelAfterInstall ? ':retry' : ''}`;
    setInstallingEngine(key);
    setInstallError('');
    setInstallSuccess('');
    setSwitchError('');
    setSwitchSuccess('');
    try {
      const res = await llamaServerApi.startInstallJob({
        profile,
        releaseTag: selection?.releaseTag,
        assetName: selection?.assetName,
        retryModel: retryModelAfterInstall ? serverStatus?.model || undefined : undefined,
        ctxSize: retryModelAfterInstall ? config.ctx_size : undefined,
      });
      const job = res.job;
      setInstallJob(job);
      await loadEngineCatalog(true);
      beginInstallJobPolling(job.id);
    } catch (err) {
      setInstallError(err.message || 'Failed to install engine.');
      setInstallingEngine(null);
    }
  };

  const status = serverStatus?.status ?? 'idle';
  const { label: statusLabel, color: statusColor } = STATUS_META[status] || STATUS_META.idle;
  const isRunning = status === 'ready' || status === 'loading';
  const isReady = status === 'ready';

  const bannerClass = {
    ready:   'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800 midnight:bg-green-900/20 midnight:border-green-800',
    loading: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 midnight:bg-amber-900/20 midnight:border-amber-800',
    error:   'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800 midnight:bg-red-900/20 midnight:border-red-800',
    idle:    'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 midnight:bg-gray-800/50 midnight:border-gray-700',
  }[status] ?? 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 midnight:bg-gray-800/50 midnight:border-gray-700';

  const iconClass = {
    ready:   'text-green-600 dark:text-green-400',
    loading: 'text-amber-600 dark:text-amber-400 animate-pulse',
    error:   'text-red-500',
    idle:    'text-gray-400',
  }[status] ?? 'text-gray-400';

  const recommendationState = engineData?.recommendation?.state || 'current_ok';
  const recommendationTone = recommendationState === 'recommended_available'
    ? 'amber'
    : recommendationState === 'not_installed'
      ? 'blue'
      : status === 'ready'
        ? 'green'
        : 'gray';
  const currentEngineValue = engineData?.current
    ? `${engineData.current.runtime === 'python' ? 'Python' : 'Native'} · ${engineData.current.capabilityLabel}`
    : 'No engine detected';
  const recommendationValue = (switchError || installError)
    ? 'Needs attention'
    : recommendationState === 'recommended_available'
      ? 'Recommended engine available'
      : recommendationState === 'not_installed'
        ? 'Install GPU engine'
        : 'Setup looks healthy';
  const storageDetail = storage?.disk
    ? `${storage.totalFormatted} models · ${storage.disk.availableFormatted} free on device`
    : storage?.totalFormatted
      ? `${storage.totalFormatted} stored locally`
      : 'Ready for GGUF downloads';
  const tabs = [
    { id: 'library', label: 'Library', icon: HardDriveDownload },
    { id: 'discover', label: 'Download', icon: Download },
    { id: 'engine', label: 'Engine', icon: Wrench },
    { id: 'system', label: 'System', icon: Activity },
  ];

  return (
    <div className="flex h-full w-full bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.08),_transparent_24%),linear-gradient(to_bottom,_#ffffff,_#f8fafc)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_20%),linear-gradient(to_bottom,_#0f172a,_#020617)] midnight:bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_20%),radial-gradient(circle_at_top_right,_rgba(244,114,182,0.10),_transparent_18%),linear-gradient(to_bottom,_#020617,_#000000)] font-sans">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800/60 midnight:border-gray-800/60 flex-shrink-0 bg-white/90 dark:bg-gray-900/90 midnight:bg-gray-950/90 backdrop-blur z-10 sticky top-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 midnight:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-gray-100">
                  Model Studio
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-0.5">
                  Load, stop, download, and remove local AI models
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                clearEngineActionMessages();
                setInstallJob(null);
                loadStatus();
                loadModelList();
                loadEngineData({ clearActions: true });
                loadEngineCatalog(true);
              }}
              disabled={loadingStatus || loadingModels || loadingEngines || loadingCatalog || Boolean(switchingEngine) || Boolean(installingEngine)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 midnight:text-gray-300 hover:text-gray-900 dark:hover:text-white midnight:hover:text-white transition-colors bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-gray-700"
            >
              <RefreshCw className={`w-4 h-4 ${(loadingStatus || loadingModels || loadingEngines || loadingCatalog) ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto w-full">
          <div className="max-w-[1400px] mx-auto w-full px-8 py-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <OverviewCard
                icon={HardDriveDownload}
                label="Local Library"
                value={`${models.length} model${models.length === 1 ? '' : 's'}`}
                detail={storageDetail}
                tone="blue"
              />
              <OverviewCard
                icon={Wrench}
                label="Current Engine"
                value={currentEngineValue}
                detail={engineData?.current?.source || 'Asyncat will auto-detect the best local runtime it can use'}
                tone={recommendationTone}
              />
              <OverviewCard
                icon={Sparkles}
                label="Next Best Action"
                value={recommendationValue}
                detail={switchError || installError || engineData?.recommendation?.body || 'Pick a model and start exploring'}
                tone={(switchError || installError) ? 'amber' : recommendationTone}
              />
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white/80 dark:bg-gray-900/70 midnight:bg-gray-950/70 p-2 shadow-sm">
                {tabs.map(({ id, label, icon: Icon }) => {
                  const selected = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                        selected
                          ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 midnight:bg-gray-100 midnight:text-gray-900'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800 midnight:text-gray-400 midnight:hover:text-gray-100 midnight:hover:bg-gray-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {activeTab === 'library' && (
              <div className="space-y-8">
                
                {/* Active Server Banner */}
                <div className={`relative overflow-hidden rounded-3xl border p-6 transition-all duration-300 shadow-sm ${bannerClass}`}>
                  <div className="absolute inset-y-0 right-0 w-40 bg-gradient-to-l from-white/40 to-transparent dark:from-white/[0.03] pointer-events-none" />
                  <div className="relative z-10 flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 bg-white dark:bg-gray-900 midnight:bg-gray-900 rounded-xl shadow-sm border border-black/5 dark:border-white/5 midnight:border-white/5`}>
                        <Server className={`w-6 h-6 ${iconClass}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white midnight:text-white">Active Inference Server</h2>
                          <Badge color={statusColor}>{statusLabel}</Badge>
                        </div>
                        {serverStatus?.model ? (
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                            {isReady ? 'Running' : 'Loading'}: <span className="text-gray-800 dark:text-gray-200 midnight:text-gray-100 font-semibold">{serverStatus.model}</span>
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            No model is currently loaded in memory.
                          </p>
                        )}
                        {serverStatus?.error && (
                          <p className="text-sm text-red-600 dark:text-red-400 mt-1">{serverStatus.error}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {engineData?.current && (
                            <Badge color={capabilityBadgeColor(engineData.current.capabilityHint)}>
                              {engineData.current.capabilityLabel}
                            </Badge>
                          )}
                          {engineData?.hardware && (
                            <Badge color="gray">{conciseHardwareSummary(engineData.hardware)}</Badge>
                          )}
                          {serverStatus?.ctxSize && (
                            <Badge color="blue">{serverStatus.ctxSize.toLocaleString()} ctx</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {isRunning && (
                      <button
                        onClick={handleStop}
                        disabled={stopping || Boolean(switchingEngine) || Boolean(installingEngine)}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-xl disabled:opacity-50 transition-all shadow-sm"
                      >
                        {stopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                        {stopping ? 'Stopping...' : 'Stop Server'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Local Library Grid */}
                <div>
                  <div className="flex items-end justify-between mb-4 gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Local Library</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pick a GGUF model, load it into memory, and iterate from here.</p>
                    </div>
                    <Badge color="blue">{models.length} Models</Badge>
                  </div>
                  
                  {loadingModels ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[1, 2].map(i => (
                        <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800/50 midnight:bg-gray-800/50 rounded-2xl animate-pulse" />
                      ))}
                    </div>
                  ) : models.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-gray-200 dark:border-gray-800 midnight:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-900/50 midnight:bg-gray-900/50">
                      <div className="p-3 bg-white dark:bg-gray-800 midnight:bg-gray-800 rounded-full shadow-sm mb-3">
                        <Box className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-600 dark:text-gray-300 midnight:text-gray-300 font-medium">Your library is empty</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-gray-400 mt-1 max-w-sm text-center">
                        Open the Download tab to search HuggingFace and add GGUF models.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {models.map(m => {
                        const isLoaded = serverStatus?.model === m.filename && status === 'ready';
                        const isStarting = startingModel === m.filename;
                        const isDeleting = deletingModel === m.filename;
                        
                        return (
                          <div 
                            key={m.filename}
                            className={`group relative flex flex-col bg-white dark:bg-gray-800 midnight:bg-gray-900 border rounded-3xl overflow-hidden transition-all duration-200 hover:shadow-md
                              ${isLoaded ? 'border-gray-400 dark:border-gray-500 midnight:border-gray-600 ring-1 ring-gray-400/30 dark:ring-gray-500/30 midnight:ring-gray-500/20 shadow-sm' : 'border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-gray-700'}`}
                          >
                            <div className={`absolute inset-x-0 top-0 h-1 ${isLoaded ? 'bg-green-500' : 'bg-gradient-to-r from-gray-200 via-gray-100 to-transparent dark:from-gray-700 dark:via-gray-800'}`} />
                            <div className="p-5 flex-1">
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isLoaded ? 'bg-gray-700 text-white dark:bg-gray-600 midnight:bg-gray-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 midnight:bg-gray-800/50'}`}>
                                    <Cpu className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-white truncate" title={m.name || m.filename}>
                                      {m.name || m.filename}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 bg-gray-100 dark:bg-gray-900/50 midnight:bg-gray-800/50 px-2 py-0.5 rounded">
                                        {m.sizeFormatted}
                                      </span>
                                      {m.architecture && (
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-gray-400 bg-gray-100 dark:bg-gray-900/50 midnight:bg-gray-800/50 px-2 py-0.5 rounded">
                                          {m.architecture}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {isLoaded && (
                                  <span className="flex h-3 w-3 relative flex-shrink-0 mt-1">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-3 mt-4">
                                <div className="rounded-2xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-gray-950/60 px-3 py-2 border border-gray-100 dark:border-gray-800">
                                  <div className="text-[11px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Context</div>
                                  <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                                    {m.contextLength ? `${Number(m.contextLength).toLocaleString()} ctx` : 'Unknown'}
                                  </div>
                                </div>
                                <div className="rounded-2xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-gray-950/60 px-3 py-2 border border-gray-100 dark:border-gray-800">
                                  <div className="text-[11px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Status</div>
                                  <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-gray-100">
                                    {isLoaded ? 'Loaded now' : 'Ready to load'}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50 midnight:border-gray-800/50 flex items-center justify-between gap-2">
                              {!isLoaded ? (
                                <button
                                  onClick={() => handleStart(m.filename)}
                                  disabled={isStarting || isRunning || Boolean(switchingEngine) || Boolean(installingEngine)}
                                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-white dark:bg-gray-800 midnight:bg-gray-900 text-gray-700 dark:text-gray-300 midnight:text-gray-400 border border-gray-200 dark:border-gray-600 midnight:border-gray-700 rounded-xl hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-gray-100 midnight:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-gray-700 disabled:hover:border-gray-200"
                                >
                                  {isStarting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                                  {isStarting ? 'Starting...' : 'Load Model'}
                                </button>
                              ) : (
                                <button
                                  onClick={handleStop}
                                  disabled={stopping || Boolean(switchingEngine) || Boolean(installingEngine)}
                                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-gray-800 hover:bg-gray-700 text-white dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 midnight:bg-gray-800 midnight:hover:bg-gray-700 rounded-xl transition-colors shadow-sm"
                                >
                                  {stopping ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                                  In Memory
                                </button>
                              )}
                              
                              <button
                                onClick={() => handleDelete(m.filename)}
                                disabled={isDeleting || isLoaded || Boolean(switchingEngine) || Boolean(installingEngine)}
                                className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                                title="Delete model"
                              >
                                {isDeleting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              )}

              {activeTab === 'discover' && (
              <div className="rounded-3xl border border-gray-200 dark:border-gray-700 midnight:border-gray-800 bg-white/85 dark:bg-gray-900/75 midnight:bg-gray-950/75 p-6 shadow-sm">
                <LocalModelsSection storage={storage} onRefresh={loadModelList} />
              </div>
              )}

              {activeTab === 'engine' && (
              <div className="max-w-5xl">
                <EngineAdvisorSection
                  engineData={engineData}
                  engineCatalog={engineCatalog}
                  loadingCatalog={loadingCatalog}
                  installJob={installJob}
                  loading={loadingEngines}
                  switchingKey={switchingEngine}
                  installingKey={installingEngine}
                  switchError={switchError}
                  switchSuccess={switchSuccess}
                  installError={installError}
                  installSuccess={installSuccess}
                  revertSelection={revertSelection}
                  retryModel={serverStatus?.model || null}
                  onRescan={loadEngineData}
                  onSwitch={handleEngineSwitch}
                  onInstall={handleManagedInstall}
                  onRefreshCatalog={loadEngineCatalog}
                />
              </div>
              )}

              {activeTab === 'system' && (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)] gap-6">
                <SystemInfoSection />
                <div className="bg-white dark:bg-gray-800 midnight:bg-gray-900 border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <HardDriveDownload className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-gray-200">Storage Footprint</h3>
                  </div>
                  {storage ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-gray-950/60 border border-gray-100 dark:border-gray-800 p-3">
                          <div className="text-[11px] uppercase tracking-[0.15em] text-gray-400">Models</div>
                          <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">{storage.totalFormatted}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-gray-950/60 border border-gray-100 dark:border-gray-800 p-3">
                          <div className="text-[11px] uppercase tracking-[0.15em] text-gray-400">Device Free</div>
                          <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">{storage.disk?.availableFormatted || 'Unknown'}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-gray-950/60 border border-gray-100 dark:border-gray-800 p-3">
                          <div className="text-[11px] uppercase tracking-[0.15em] text-gray-400">Device Total</div>
                          <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">{storage.disk?.totalFormatted || 'Unknown'}</div>
                        </div>
                      </div>
                      {storage.disk && (
                        <div>
                          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                            <span>{storage.disk.usedFormatted} used</span>
                            <span>{storage.disk.usedPercent}%</span>
                          </div>
                          <MiniBar value={storage.disk.usedPercent || 0} color="bg-gray-700" />
                          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            GGUF models use {storage.disk.modelPercent}% of this device.
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Storage details are unavailable.</p>
                  )}
                </div>
              </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelsPage;
