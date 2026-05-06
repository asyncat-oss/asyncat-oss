import { useState, useEffect, useRef } from 'react';
import { RefreshCw, RotateCcw, TerminalSquare, ChevronDown, ChevronUp, Sparkles, Download, Wrench, TriangleAlert, Zap } from 'lucide-react';
import { Badge } from './modelPageShared.jsx';

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

const hardwareSummary = (hardware) => {
  const gpu = hardware?.gpu;
  if (!gpu) return `${hardware?.platform || 'unknown'} · ${hardware?.arch || 'unknown'} · CPU-safe recommended`;
  const vram = gpu.vramGb ? ` · ${gpu.vramGb} GB VRAM` : '';
  return `${hardware?.platform || 'unknown'} · ${hardware?.arch || 'unknown'} · ${gpu.vendor} ${gpu.name}${vram}`;
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
    <span className="text-xs font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">
      {candidate.runtime === 'python' ? 'Python runtime' : 'Native binary'}
    </span>
    {candidate.isCurrent && <Badge color="green">Current</Badge>}
    {candidate.isRecommended && <Badge color="amber">Recommended</Badge>}
    <Badge color={capabilityBadgeColor(candidate.capabilityHint)}>{candidate.capabilityLabel}</Badge>
    {candidate.runtime === 'python' && <Badge color="blue">Python</Badge>}
    {candidate.managed && <Badge color="blue">Managed</Badge>}
  </div>
);

const PYTHON_BUILD_PROFILES = {
  nvidia_gpu:  { label: 'Build CUDA Runtime',  tag: 'CUDA',  color: 'bg-green-600 hover:bg-green-700 text-white' },
  apple_metal: { label: 'Build Metal Runtime', tag: 'Metal', color: 'bg-purple-600 hover:bg-purple-700 text-white' },
  amd_rocm:    { label: 'Build ROCm Runtime',  tag: 'ROCm',  color: 'bg-orange-600 hover:bg-orange-700 text-white' },
};

const PYTHON_BUILD_PHASES = [
  { id: 'venv',        label: 'Create venv',   percent: 5  },
  { id: 'pip',         label: 'Upgrade pip',   percent: 10 },
  { id: 'build_tools', label: 'Build tools',   percent: 20 },
  { id: 'compile',     label: 'Compile',        percent: 30 },
  { id: 'finalizing',  label: 'Finalize',       percent: 95 },
];

function formatElapsed(ms) {
  if (ms < 1000) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const PythonBuildCard = ({
  buildMeta, installProfile, isPythonBuilding, pythonDone, pythonError,
  pythonInstallJob, pythonBuildError, pythonBuildSuccess,
  retryModel, switchingKey, installingKey, onBuildGpuRuntime,
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isPythonBuilding || !pythonInstallJob?.startedAt) { setElapsed(0); return; }
    const tick = () => setElapsed(Date.now() - new Date(pythonInstallJob.startedAt).getTime());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isPythonBuilding, pythonInstallJob?.startedAt]);

  const phaseIdx = PYTHON_BUILD_PHASES.findIndex(p => p.id === pythonInstallJob?.phase);

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 space-y-3 dark:border-gray-700 dark:bg-gray-800/40 midnight:border-slate-800 midnight:bg-slate-900/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-gray-500 flex-shrink-0 dark:text-gray-400" />
          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
            Build {buildMeta.tag} runtime inside Asyncat
          </span>
        </div>
        {isPythonBuilding && elapsed > 0 && (
          <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 flex-shrink-0">
            {formatElapsed(elapsed)} elapsed
          </span>
        )}
      </div>

      {!isPythonBuilding && !pythonDone && !pythonError && (
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-5">
          Asyncat will compile <code className="font-mono text-[11px]">llama-cpp-python</code> with {buildMeta.tag} support
          inside its own isolated venv — nothing touches your system Python.
          Requires Python 3.10+ and takes <strong>10–30 minutes</strong>.
          After that, performance matches Ollama.
        </p>
      )}

      {isPythonBuilding && (
        <div className="space-y-2">
          {/* Phase steps */}
          <div className="flex items-center gap-1">
            {PYTHON_BUILD_PHASES.map((phase, i) => {
              const done = phaseIdx > i || pythonDone;
              const active = phaseIdx === i;
              return (
                <div key={phase.id} className="flex items-center gap-1 flex-1 min-w-0">
                  <div className={`h-1.5 flex-1 rounded-full transition-all ${
                    done ? 'bg-gray-700 dark:bg-gray-300' : active ? 'bg-gray-500 animate-pulse dark:bg-gray-400' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                  {i < PYTHON_BUILD_PHASES.length - 1 && (
                    <div className={`w-1 h-1 rounded-full flex-shrink-0 ${done ? 'bg-gray-700 dark:bg-gray-300' : 'bg-gray-300 dark:bg-gray-600'}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Phase labels */}
          <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
            {PYTHON_BUILD_PHASES.map((phase) => (
              <span key={phase.id} className={phase.id === pythonInstallJob?.phase ? 'text-gray-800 font-semibold dark:text-gray-200' : ''}>
                {phase.label}
              </span>
            ))}
          </div>

          {/* Live output terminal */}
          <div className="rounded-lg bg-gray-950 dark:bg-black p-2.5 font-mono text-[11px] leading-5">
            <div className="flex items-center gap-2 mb-1.5 text-gray-500">
              <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
              <span className="text-gray-300">
                {pythonInstallJob?.phase === 'compile' ? `Compiling ${buildMeta.tag}…`
                  : pythonInstallJob?.phase === 'build_tools' ? 'Installing build tools…'
                  : pythonInstallJob?.phase === 'pip' ? 'Upgrading pip…'
                  : pythonInstallJob?.phase === 'venv' ? 'Creating venv…'
                  : 'Working…'}
              </span>
            </div>
            <p className="text-gray-300 truncate pl-4">
              {pythonInstallJob?.message || '…'}
            </p>
          </div>
        </div>
      )}

      {pythonDone && (
        <p className="text-xs text-green-600 dark:text-green-400 font-medium">
          {pythonBuildSuccess || pythonInstallJob?.message || 'GPU runtime built successfully.'}
        </p>
      )}

      {(pythonBuildError || pythonError) && (() => {
        const errText = pythonBuildError || pythonInstallJob?.error || 'Build failed.';
        const lines = errText.split('\n').filter(Boolean);
        // CUDA missing: match specific "not found" messages, not just the word "cuda"
        const isCudaMissing = /cuda toolkit not found|could not find.*nvcc|nvcc.*not found|CUDAToolkit_ROOT|nvcc missing/i.test(errText);
        // Compiler missing: only when an explicit "not found" message is present, and CUDA isn't the root cause
        const isCompilerMissing = !isCudaMissing && /c\+\+ compiler.*not found|no c\+\+ compiler|compiler.*not found|CXX.*not found|g\+\+.*not found|clang\+\+.*not found/i.test(errText);
        return (
          <div className="space-y-2">
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2.5 space-y-1">
              {lines.map((line, i) => (
                <p key={i} className={`text-xs ${i === 0 ? 'text-red-700 dark:text-red-300 font-medium' : 'font-mono text-red-600 dark:text-red-400'}`}>
                  {line}
                </p>
              ))}
            </div>
            {isCompilerMissing && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1">C++ compiler missing</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-1.5">Install it, then retry:</p>
                <code className="block text-[11px] font-mono bg-gray-900 text-green-400 rounded px-2 py-1.5">
                  sudo dnf install gcc-c++ make
                </code>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1.5 italic">
                  On Ubuntu/Debian use: sudo apt install build-essential
                </p>
              </div>
            )}
            {isCudaMissing && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 space-y-2">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">CUDA Toolkit not installed</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Run the commands shown above in a terminal (they are tailored to your OS version), then come back and click Retry.
                </p>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">After install, also run:</p>
                  <code className="block text-[11px] font-mono bg-gray-900 text-green-400 rounded px-2 py-1.5 whitespace-pre-wrap">
                    {"echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc\nsource ~/.bashrc"}
                  </code>
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-500 italic">
                  GCC version compatibility is handled automatically by asyncat — no manual compiler flags needed.
                </p>
              </div>
            )}
            <button
              onClick={() => onBuildGpuRuntime(installProfile, false)}
              disabled={Boolean(switchingKey) || Boolean(installingKey)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 ${buildMeta.color}`}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Build
            </button>
          </div>
        );
      })()}

      {!isPythonBuilding && !pythonDone && !pythonError && (
        <div className="flex gap-2 pt-0.5">
          <button
            onClick={() => onBuildGpuRuntime(installProfile, false)}
            disabled={Boolean(switchingKey) || Boolean(installingKey)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50 ${buildMeta.color}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {buildMeta.label}
          </button>
          {retryModel && (
            <button
              onClick={() => onBuildGpuRuntime(installProfile, true)}
              disabled={Boolean(switchingKey) || Boolean(installingKey)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900 disabled:opacity-50"
            >
              {buildMeta.label} + Retry Model
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const EngineRuntimeSection = ({
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
  pythonInstallJob,
  pythonBuildError,
  pythonBuildSuccess,
  onRescan,
  onSwitch,
  onInstall,
  onBuildGpuRuntime,
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
  const [releaseDropdownOpen, setReleaseDropdownOpen] = useState(false);
  const [assetDropdownOpen, setAssetDropdownOpen] = useState(false);
  const [runtimeDropdownOpen, setRuntimeDropdownOpen] = useState(false);
  const releaseDropdownRef = useRef(null);
  const assetDropdownRef = useRef(null);
  const runtimeDropdownRef = useRef(null);

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

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (releaseDropdownRef.current && !releaseDropdownRef.current.contains(e.target)) {
        setReleaseDropdownOpen(false);
      }
      if (assetDropdownRef.current && !assetDropdownRef.current.contains(e.target)) {
        setAssetDropdownOpen(false);
      }
      if (runtimeDropdownRef.current && !runtimeDropdownRef.current.contains(e.target)) {
        setRuntimeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    <div className="bg-white dark:bg-gray-800 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-800/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Wrench className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 midnight:text-slate-200">Engine Advisor</h3>
        {loading && <RefreshCw className="w-3 h-3 animate-spin text-gray-400 ml-auto" />}
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 p-3 bg-gray-50/80 dark:bg-gray-900/40 midnight:bg-slate-950/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                {actionError ? (
                  <TriangleAlert className="w-4 h-4 text-red-500" />
                ) : (
                  <Zap className="w-4 h-4 text-amber-500" />
                )}
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100">{stateMeta.title}</span>
              </div>
              <p className={`mt-2 text-xs leading-5 ${actionError ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400 midnight:text-slate-400'}`}>
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
                      ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200'
                      : 'border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
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
            <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 midnight:bg-slate-950/40 p-3">
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

          {/* Python GPU build card — shown when GPU detected but no managed binary available */}
          {recommendation?.state === 'not_installed' && !managedProfileAvailable && installProfile && PYTHON_BUILD_PROFILES[installProfile] && (() => {
            const buildMeta = PYTHON_BUILD_PROFILES[installProfile];
            const isPythonBuilding = pythonInstallJob?.status === 'queued' || pythonInstallJob?.status === 'running';
            const pythonDone = pythonInstallJob?.status === 'complete';
            const pythonError = pythonInstallJob?.status === 'error';
            const currentPhaseIdx = PYTHON_BUILD_PHASES.findIndex(p => p.id === pythonInstallJob?.phase);
            const _progressPercent = pythonInstallJob?.percent ?? (currentPhaseIdx >= 0 ? PYTHON_BUILD_PHASES[currentPhaseIdx].percent : 0);
            return (
              <PythonBuildCard
                buildMeta={buildMeta}
                installProfile={installProfile}
                isPythonBuilding={isPythonBuilding}
                pythonDone={pythonDone}
                pythonError={pythonError}
                pythonInstallJob={pythonInstallJob}
                progressPercent={_progressPercent}
                pythonBuildError={pythonBuildError}
                pythonBuildSuccess={pythonBuildSuccess}
                retryModel={retryModel}
                switchingKey={switchingKey}
                installingKey={installingKey}
                onBuildGpuRuntime={onBuildGpuRuntime}
              />
            );
          })()}
        </div>

	        <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 p-3">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">This Machine</div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div className="rounded-xl bg-gray-50/80 dark:bg-gray-900/50 midnight:bg-slate-950/50 border border-gray-200 dark:border-gray-700 midnight:border-slate-800 p-3">
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
                    <div className="rounded-lg bg-white dark:bg-gray-900 midnight:bg-slate-900/30 px-3 py-2 text-[11px] font-mono text-gray-600 dark:text-gray-400 midnight:text-slate-400 break-all">
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
            <div className="rounded-xl bg-gray-50/80 dark:bg-gray-900/50 midnight:bg-slate-950/50 border border-gray-200 dark:border-gray-700 midnight:border-slate-800 p-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500 midnight:text-slate-500">Hardware</div>
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                {hardwareSummary(engineData?.hardware)}
              </p>
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-500">
                Suggested GPU layers: {recommendation?.suggestedGpuLayers ?? 0}
              </p>
            </div>
          </div>
        </div>

        {activeInstallJob && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Managed Install Progress</span>
                  <Badge color={installStatusTone(activeInstallJob.status)}>
                    {activeInstallJob.status === 'running' ? 'Running' : activeInstallJob.status === 'complete' ? 'Complete' : activeInstallJob.status === 'error' ? 'Failed' : 'Queued'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400 midnight:text-slate-400">
                  {activeInstallJob.message || 'Preparing managed engine install…'}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">{Math.round(activeInstallJob.percent || 0)}%</div>
                {activeInstallJob.assetName && (
                  <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">{activeInstallJob.assetName}</div>
                )}
              </div>
            </div>
            <div className="mt-3">
              <MiniBar value={activeInstallJob.percent || 0} color="bg-gray-700 dark:bg-gray-300" />
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
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">Advanced Engine Tools</div>
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
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 midnight:bg-slate-950/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                      Recommended: {INSTALL_PROFILE_LABELS[installProfile]}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
                      {INSTALL_PROFILE_HELP[installProfile]}
                    </p>
                  </div>
                  <Badge color="gray">Managed</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => onInstall({ profile: installProfile }, false)}
                    disabled={Boolean(switchingKey) || Boolean(installingKey)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isInstallingRecommended && installingKey === installKeyBase ? 'Installing…' : 'Install Managed Engine'}
                  </button>
                  <button
                    onClick={() => onInstall({ profile: installProfile }, true)}
                    disabled={!canRetry || Boolean(switchingKey) || Boolean(installingKey)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
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
	            <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">Advanced Installer</div>
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
                    <div ref={releaseDropdownRef} className="relative">
                      <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Release version</label>
                      <button
                        type="button"
                        onClick={() => { setReleaseDropdownOpen(prev => !prev); setAssetDropdownOpen(false); }}
                        className="mt-1 w-full flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 text-left"
                      >
                        <span className="truncate">
                          {selectedRelease
                            ? `${selectedRelease.tagName}${selectedRelease.prerelease ? ' · prerelease' : ''} · ${selectedRelease.compatibleAssetCount} compatible assets`
                            : 'Select a release'}
                        </span>
                        <ChevronDown className="w-4 h-4 flex-shrink-0 ml-2 text-gray-400" />
                      </button>
                      {releaseDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 shadow-lg py-1">
                          {releases.map(release => (
                            <button
                              key={release.tagName}
                              type="button"
                              onClick={() => { setSelectedReleaseTag(release.tagName); setReleaseDropdownOpen(false); }}
                              className={`w-full text-left px-3 py-2 text-sm truncate hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 ${release.tagName === selectedReleaseTag ? 'text-gray-900 dark:text-gray-100 midnight:text-slate-100 font-medium' : 'text-gray-700 dark:text-gray-300 midnight:text-slate-300'}`}
                            >
                              {release.tagName}{release.prerelease ? ' · prerelease' : ''} · {release.compatibleAssetCount} compatible assets
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div ref={assetDropdownRef} className="relative">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Asset variant</label>
                        <button
                          onClick={() => setShowAllCatalogAssets(prev => !prev)}
                          className="text-[11px] font-medium text-gray-500 dark:text-gray-400"
                        >
                          {showAllCatalogAssets ? 'Show compatible only' : 'Show all archive assets'}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setAssetDropdownOpen(prev => !prev); setReleaseDropdownOpen(false); }}
                        className="mt-1 w-full flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 text-left"
                      >
                        <span className="truncate">
                          {selectedAsset
                            ? `${selectedAsset.name} · ${selectedAsset.sizeFormatted}${selectedAsset.compatible ? '' : ' · not for this machine'}`
                            : 'Select an asset'}
                        </span>
                        <ChevronDown className="w-4 h-4 flex-shrink-0 ml-2 text-gray-400" />
                      </button>
                      {assetDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 shadow-lg py-1">
                          {visibleAssets.map(asset => (
                            <button
                              key={asset.name}
                              type="button"
                              onClick={() => { setSelectedAssetName(asset.name); setAssetDropdownOpen(false); }}
                              className={`w-full text-left px-3 py-2 text-sm truncate hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 ${asset.name === selectedAssetName ? 'text-gray-900 dark:text-gray-100 midnight:text-slate-100 font-medium' : 'text-gray-700 dark:text-gray-300 midnight:text-slate-300'}`}
                            >
                              {asset.name} · {asset.sizeFormatted}{asset.compatible ? '' : ' · not for this machine'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedAsset && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 p-3 bg-gray-50/70 dark:bg-gray-900/50 midnight:bg-slate-950/50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 midnight:text-slate-100 break-all">{selectedAsset.name}</div>
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
	            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 midnight:border-slate-600 p-3">
	              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">Fallback managed install</div>
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
	              <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-gray-50/70 dark:bg-gray-900/40 midnight:bg-slate-950/40 p-3">
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
	          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 midnight:border-slate-600 p-3 bg-gray-50/60 dark:bg-gray-900/40 midnight:bg-slate-950/40">
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
	        <div className="rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 p-3">
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
                  className={`rounded-xl border p-3 transition-colors ${candidate.isRecommended ? 'border-gray-300 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-900/40 midnight:border-slate-800 midnight:bg-slate-950/40' : 'border-gray-200 dark:border-gray-700 midnight:border-slate-800'}`}
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
	        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 midnight:border-slate-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Manual Engine Path</div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">For engines installed outside Asyncat</span>
          </div>
	          <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-gray-50/70 dark:bg-gray-900/40 midnight:bg-slate-950/40 p-3">
	            <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 midnight:text-slate-100">
	              {manualPathGuidance.title}
	            </div>
	            <p className="mt-1 text-[11px] leading-5 text-gray-600 dark:text-gray-400 midnight:text-slate-400">
	              {manualPathGuidance.body}
	            </p>
	            <div className="mt-2 space-y-1.5">
              {manualPathGuidance.steps.map((step) => (
	                <p key={step} className="text-[11px] leading-5 text-gray-500 dark:text-gray-400 midnight:text-slate-400">
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
            <div ref={runtimeDropdownRef} className="relative w-32 flex-shrink-0">
              <button
                type="button"
                onClick={() => setRuntimeDropdownOpen(prev => !prev)}
                className="w-full flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 text-left"
              >
                <span>{customRuntime === 'python' ? 'Python' : 'Binary'}</span>
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 ml-1 text-gray-400" />
              </button>
              {runtimeDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 shadow-lg py-1">
                  {[{ value: 'binary', label: 'Binary' }, { value: 'python', label: 'Python' }].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setCustomRuntime(opt.value); setRuntimeDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 ${opt.value === customRuntime ? 'text-gray-900 dark:text-gray-100 midnight:text-slate-100 font-medium' : 'text-gray-700 dark:text-gray-300 midnight:text-slate-300'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/10 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Revert to Previous Engine
          </button>
        )}
      </div>
    </div>
  );
};

export default EngineRuntimeSection;
