import { useState, useEffect, useRef } from 'react';
import { Server, RefreshCw, Play, Square, Trash2, Box, Cpu, Zap, Wrench, TriangleAlert, RotateCcw, TerminalSquare, ChevronDown, ChevronUp, Sparkles, HardDriveDownload, Download, Cloud, KeyRound, CheckCircle2, X, Plus, Save, Link2, Search, Wifi, WifiOff, FolderOpen } from 'lucide-react';
import LocalModelsSection from './LocalModelsSection';
import MlxModelsSection from './MlxModelsSection';
import { llamaServerApi, localModelsApi, aiProviderApi, mlxApi } from '../Settings/settingApi.js';
import { useModelConfig } from '../CommandCenter/hooks/useModelConfig.js';
import { useNetworkStatus } from '../hooks/useNetworkStatus.js';

const Badge = ({ children, color = 'gray' }) => {
  const colors = {
    green: 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/30 midnight:bg-slate-900/30 midnight:text-green-400',
    gray:  'bg-gray-50 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 midnight:bg-slate-800 midnight:text-slate-400',
    amber: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/30 midnight:bg-slate-900/30 midnight:text-amber-400',
    red:   'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/30 midnight:bg-slate-900/30 midnight:text-red-400',
    blue:  'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/30 midnight:bg-slate-900/30 midnight:text-blue-400',
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

const ConfirmDeleteDialog = ({ model, onConfirm, onCancel }) => {
  if (!model) return null;
  const identifier = model.isExternal ? model.name : model.filename;
  const isExternal = model.isExternal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 midnight:bg-slate-900 shadow-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-700 p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Trash2 size={18} className="text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white midnight:text-slate-100">
              {isExternal ? 'Remove from library?' : 'Delete model?'}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 break-all">
              <span className="font-medium text-gray-700 dark:text-gray-300 midnight:text-slate-300">{identifier}</span>
            </p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400">
              {isExternal
                ? 'The file on disk will not be affected.'
                : 'This will permanently delete the file from your disk.'}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-600 text-gray-700 dark:text-gray-300 midnight:text-slate-300 hover:bg-gray-50 dark:hover:bg-gray-800 midnight:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            {isExternal ? 'Remove' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
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

const DEFAULT_LOAD_CTX_SIZE = 32768;
const MAX_LOAD_CTX_SIZE = 1048576;

const MODEL_LOAD_CONTEXT_STORAGE_KEY = 'asyncat_model_load_contexts';

const normalizeLoadCtxSize = (value, fallback = DEFAULT_LOAD_CTX_SIZE, max = MAX_LOAD_CTX_SIZE) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 512) return fallback;
  return Math.min(n, max);
};

const getModelContextLimit = (model) => {
  const n = Number(model?.contextLength);
  if (!Number.isFinite(n) || n < 512) return MAX_LOAD_CTX_SIZE;
  return Math.min(n, MAX_LOAD_CTX_SIZE);
};

const getModelLoadCtxError = (value, max = MAX_LOAD_CTX_SIZE) => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 512) return 'Set a load context of at least 512.';
  if (n > max) return `Set within this model's limit: ${max.toLocaleString()} ctx.`;
  return '';
};

const loadSavedModelContextSizes = () => {
  try {
    const raw = localStorage.getItem(MODEL_LOAD_CONTEXT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([filename]) => typeof filename === 'string' && filename)
        .map(([filename, value]) => [filename, String(normalizeLoadCtxSize(value))])
    );
  } catch {
    return {};
  }
};

const saveModelContextSizes = (contexts) => {
  try {
    localStorage.setItem(MODEL_LOAD_CONTEXT_STORAGE_KEY, JSON.stringify(contexts));
  } catch {}
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
    gray: 'border-gray-200 text-gray-700',
    blue: 'border-gray-200 text-gray-700',
    amber: 'border-gray-200 text-gray-700',
    green: 'border-gray-200 text-gray-700',
  };
  const toneClass = tones[tone] || tones.gray;
  return (
    <div className={`rounded-2xl border bg-white ${toneClass} dark:bg-gray-900 dark:border-gray-700 midnight:bg-slate-950 midnight:border-slate-800 p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{label}</div>
          <div className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">{value}</div>
          {detail && <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 midnight:text-slate-400">{detail}</div>}
        </div>
        <div className="rounded-xl bg-white/80 dark:bg-gray-800 midnight:bg-slate-800 p-2 border border-black/5 dark:border-white/5">
          <Icon className="w-4 h-4 text-gray-700 dark:text-gray-300" />
        </div>
      </div>
    </div>
  );
};

const _formatEnginePath = (value) => {
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
  pythonInstallJob, progressPercent, pythonBuildError, pythonBuildSuccess,
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
    <div className="mt-3 rounded-xl border border-blue-200 dark:border-blue-800 midnight:border-blue-900 bg-blue-50/60 dark:bg-blue-900/20 midnight:bg-blue-950/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-blue-900 dark:text-blue-200">
            Build {buildMeta.tag} runtime inside Asyncat
          </span>
        </div>
        {isPythonBuilding && elapsed > 0 && (
          <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 flex-shrink-0">
            {formatElapsed(elapsed)} elapsed
          </span>
        )}
      </div>

      {!isPythonBuilding && !pythonDone && !pythonError && (
        <p className="text-xs text-blue-800/80 dark:text-blue-200/70 leading-5">
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
                    done ? 'bg-blue-500' : active ? 'bg-blue-400 animate-pulse' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                  {i < PYTHON_BUILD_PHASES.length - 1 && (
                    <div className={`w-1 h-1 rounded-full flex-shrink-0 ${done ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Phase labels */}
          <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
            {PYTHON_BUILD_PHASES.map((phase) => (
              <span key={phase.id} className={phase.id === pythonInstallJob?.phase ? 'text-blue-500 font-semibold' : ''}>
                {phase.label}
              </span>
            ))}
          </div>

          {/* Live output terminal */}
          <div className="rounded-lg bg-gray-950 dark:bg-black p-2.5 font-mono text-[11px] leading-5">
            <div className="flex items-center gap-2 mb-1.5 text-gray-500">
              <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
              <span className="text-blue-400">
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
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
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
	              {manualPathGuidance.steps.map((step, i) => (
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

const providerLabel = (profile, catalog = []) => {
  const preset = catalog.find(item => item.providerId === profile?.provider_id || item.id === profile?.provider_id);
  return preset?.name || profile?.name || profile?.provider_id || 'Provider';
};

const ProviderProfileModal = ({ catalog, profile, preset, onClose, onSave, saving }) => {
  const seed = profile || preset || {};
  const [form, setForm] = useState({
    name: seed.name || '',
    provider_id: seed.provider_id || seed.providerId || seed.id || 'custom',
    base_url: seed.base_url || seed.baseUrl || '',
    model: seed.model || '',
    api_key: '',
    supports_tools: seed.supports_tools ?? seed.supportsTools ?? true,
    settings: seed.settings || {},
  });
  const [apiKeyTouched, setApiKeyTouched] = useState(false);

  const selectedPreset = catalog.find(item => item.providerId === form.provider_id || item.id === form.provider_id);
  const isAzure = form.provider_id === 'azure';
  const isLocalManaged = form.provider_id === 'llamacpp-builtin';
  const requiresKey = selectedPreset?.requiresApiKey;

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const updateSetting = (key, value) => setForm(prev => ({ ...prev, settings: { ...(prev.settings || {}), [key]: value } }));

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      provider_id: form.provider_id,
      base_url: form.base_url,
      model: form.model,
      supports_tools: Boolean(form.supports_tools),
      settings: form.settings || {},
    };
    if (!profile || apiKeyTouched) payload.api_key = form.api_key;
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">{profile ? 'Edit Provider' : 'Connect Provider'}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{selectedPreset?.description || 'Configure an OpenAI-compatible endpoint.'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Provider
            <select
              value={form.provider_id}
              onChange={(e) => {
                const next = catalog.find(item => item.providerId === e.target.value || item.id === e.target.value);
                setForm(prev => ({
                  ...prev,
                  provider_id: e.target.value,
                  name: prev.name || next?.name || '',
                  base_url: next?.baseUrl || prev.base_url,
                  model: next?.model || prev.model,
                  supports_tools: next?.supportsTools ?? prev.supports_tools,
                  settings: next?.settings || prev.settings || {},
                }));
              }}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
            >
              {catalog.filter(item => !item.managed).map(item => (
                <option key={item.id} value={item.providerId}>{item.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Name
            <input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
              placeholder={selectedPreset?.name || 'Provider name'}
            />
          </label>

          <label className="md:col-span-2 text-xs font-medium text-gray-600 dark:text-gray-300">
            Base URL
            <input
              value={form.base_url}
              onChange={(e) => update('base_url', e.target.value)}
              disabled={isLocalManaged}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none disabled:opacity-60"
              placeholder={selectedPreset?.baseUrl || 'https://.../v1'}
            />
          </label>

          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Model
            <input
              value={form.model}
              onChange={(e) => update('model', e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
              placeholder={selectedPreset?.model || 'model-id'}
            />
          </label>

          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            API Key {profile?.api_key_set && !apiKeyTouched ? <span className="text-gray-400">(saved)</span> : null}
            <input
              value={form.api_key}
              onChange={(e) => { setApiKeyTouched(true); update('api_key', e.target.value); }}
              type="password"
              className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
              placeholder={requiresKey ? 'Required' : 'Optional'}
            />
          </label>

          {isAzure && (
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              API Version
              <input
                value={form.settings?.apiVersion || '2024-10-21'}
                onChange={(e) => updateSetting('apiVersion', e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
              />
            </label>
          )}

          <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={Boolean(form.supports_tools)}
              onChange={(e) => update('supports_tools', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Enable native tool calling for chat and agents
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-5 py-4">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

const LocalProviderCard = ({ name, found, running, baseUrl, models, onUse, onDismiss, providerAction }) => {
  const hasModels = models && models.length > 0;
  return (
    <div className="rounded-3xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 midnight:bg-green-900/10 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-green-900 dark:text-green-100">{name} Detected</h3>
              {running && <Badge color="green">Running</Badge>}
            </div>
            <p className="mt-1 text-xs text-green-700 dark:text-green-300 break-all">{baseUrl}</p>
            {hasModels && (
              <div className="mt-2 flex flex-wrap gap-1">
                {models.slice(0, 5).map(m => (
                  <span key={m} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">{m}</span>
                ))}
                {models.length > 5 && <span className="text-xs text-green-600 dark:text-green-400">+{models.length - 5} more</span>}
              </div>
            )}
          </div>
        </div>
        <button onClick={onDismiss} className="p-1 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-800 rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          onClick={onUse}
          disabled={Boolean(providerAction)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          Use {name}
        </button>
        {hasModels && (
          <span className="flex items-center text-xs text-green-700 dark:text-green-300 py-2">
            {models.length} model{models.length !== 1 ? 's' : ''} available
          </span>
        )}
      </div>
    </div>
  );
};

const LocalSwitchPrompt = ({ profile, serverStatus, onChoose, onClose, busy }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Local model is still loaded</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Switch to {profile?.name || 'this provider'} and choose whether to keep {serverStatus?.model || 'the local model'} in memory.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <button disabled={busy} onClick={() => onChoose(true)} className="flex-1 px-3 py-2 text-sm font-medium rounded-xl bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 disabled:opacity-50">Stop local server</button>
        <button disabled={busy} onClick={() => onChoose(false)} className="flex-1 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">Keep it running</button>
        <button disabled={busy} onClick={onClose} className="px-3 py-2 text-sm font-medium rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
      </div>
    </div>
  </div>
);

const RemoteModelPickerModal = ({
  profile,
  models,
  loading,
  onClose,
  onRefresh,
  onSelect,
  onSelectAndActivate,
}) => {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? models.filter(model => String(model.id || model.name || '').toLowerCase().includes(normalized))
    : models;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 midnight:border-slate-800 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">Choose Remote Model</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{profile?.name} · {profile?.base_url}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
                autoFocus
              />
            </label>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="mt-4 max-h-[420px] overflow-y-auto rounded-2xl border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
            {loading ? (
              <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading models...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">No models matched.</div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800 midnight:divide-slate-800">
                {filtered.map(model => {
                  const modelId = model.id || model.name;
                  const isCurrent = profile?.model === modelId;
                  return (
                    <div key={modelId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{modelId}</p>
                          {isCurrent && <Badge color="green">Current</Badge>}
                        </div>
                        {model.owned_by && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{model.owned_by}</p>}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => onSelect(modelId)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                        >
                          Set Model
                        </button>
                        <button
                          onClick={() => onSelectAndActivate(modelId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Set + Activate
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ProvidersSection = ({
  catalog,
  profiles,
  activeConfig,
  serverStatus,
  loading,
  providerAction,
  providerError,
  onRefresh,
  onSave,
  onDelete,
  onTest,
  onActivate,
  onDeactivate,
  onLoadModels,
}) => {
  const network = useNetworkStatus();
  const [modalState, setModalState] = useState(null);
  const [pendingActivate, setPendingActivate] = useState(null);
  const [ollamaInfo, setOllamaInfo] = useState(null); // { found, running, models, baseUrl }
  const [lmStudioInfo, setLmStudioInfo] = useState(null); // { found, running, models, baseUrl }
  const [checkingLocal, setCheckingLocal] = useState(false);
  const [modelLists, setModelLists] = useState({});
  const [modelLoading, setModelLoading] = useState(null);
  const [modelPickerProfile, setModelPickerProfile] = useState(null);

  // Auto-detect Ollama and LM Studio on mount
  useEffect(() => {
    if (checkingLocal) return;
    setCheckingLocal(true);

    Promise.all([
      aiProviderApi.checkOllama(),
      aiProviderApi.checkLMStudio(),
    ])
      .then(([ollamaRes, lmStudioRes]) => {
        if (ollamaRes.success && ollamaRes.found && ollamaRes.running) {
          setOllamaInfo({ found: true, running: true, models: ollamaRes.models || [], baseUrl: ollamaRes.baseUrl });
        }
        if (lmStudioRes.success && lmStudioRes.found && lmStudioRes.running) {
          setLmStudioInfo({ found: true, running: true, models: lmStudioRes.models || [], baseUrl: lmStudioRes.baseUrl });
        }
      })
      .catch(() => {})
      .finally(() => setCheckingLocal(false));
  }, []);

  const activeProfileId = activeConfig?.profile_id;
  const activeProviderName = activeConfig?.provider_id === 'llamacpp-builtin'
    ? 'Built-in llama.cpp'
    : providerLabel({ provider_id: activeConfig?.provider_id }, catalog);
  const cloudPresets = catalog.filter(item => !item.managed);
  const localServerRunning = serverStatus?.status === 'ready' || serverStatus?.status === 'loading';
  const activeIsCloud = activeConfig?.provider_type === 'cloud' || activeConfig?.provider_type === 'custom';
  const NetworkIcon = network.fullyOnline ? Wifi : WifiOff;

  const handleUseLocalProvider = async (providerId, info) => {
    if (!info?.found) return;
    const model = info.models[0] || (providerId === 'ollama' ? 'llama3.2' : 'local-model');
    const payload = {
      name: providerId === 'ollama' ? 'Ollama Auto' : 'LM Studio Auto',
      provider_id: providerId,
      provider_type: 'local',
      base_url: info.baseUrl,
      model,
      supports_tools: false,
      settings: {},
    };
    await onSave(null, payload);
    if (providerId === 'ollama') setOllamaInfo(null);
    else setLmStudioInfo(null);
  };

  const activate = (profile) => {
    if (profile.provider_id !== 'llamacpp-builtin' && profile.provider_type !== 'local' && localServerRunning) {
      setPendingActivate(profile);
      return;
    }
    onActivate(profile.id, false);
  };

  const fetchModels = async (profile, openPicker = false) => {
    setModelLoading(profile.id);
    try {
      const models = await onLoadModels(profile.id);
      setModelLists(prev => ({ ...prev, [profile.id]: models }));
      if (openPicker) setModelPickerProfile(profile);
    } finally {
      setModelLoading(null);
    }
  };

  const openModelPicker = (profile) => {
    if (modelLists[profile.id]) {
      setModelPickerProfile(profile);
      return;
    }
    fetchModels(profile, true);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 text-gray-700 dark:text-gray-300">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white midnight:text-slate-100">Active AI Brain</h2>
                {activeConfig?.supports_tools ? <Badge color="green">Tools enabled</Badge> : <Badge color="gray">Prompt tools only</Badge>}
                <Badge color={network.fullyOnline ? 'green' : 'red'}>
                  <span className="inline-flex items-center gap-1">
                    <NetworkIcon className="w-3 h-3" />
                    {network.fullyOnline ? 'Online' : 'Offline'}
                  </span>
                </Badge>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 midnight:text-slate-300">
                {activeConfig?.model ? `${activeProviderName} · ${activeConfig.model}` : 'No provider profile is active yet.'}
              </p>
              {activeConfig?.base_url && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 midnight:text-slate-400 break-all">{activeConfig.base_url}</p>
              )}
              {activeIsCloud && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Cloud models do not stay loaded on this machine. Deactivate to stop using this provider as the shared brain.
                </p>
              )}
              {network.needsNetworkMessage && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{network.needsNetworkMessage}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeIsCloud && (
              <button onClick={onDeactivate} disabled={loading || Boolean(providerAction)} className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 disabled:opacity-50">
                <Square className="w-4 h-4" />
                Deactivate Cloud
              </button>
            )}
            <button onClick={onRefresh} disabled={loading} className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
        {providerError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{providerError}</p>}
      </div>

      <div>
        <div className="flex items-end justify-between gap-4 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Connect Providers</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Save providers once, then switch the shared chat and agent model from here.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {cloudPresets.map(item => (
            <button
              key={item.id}
              onClick={() => setModalState({ preset: item })}
              className="text-left rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 p-4 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{item.name}</div>
                {item.requiresApiKey ? <KeyRound className="w-4 h-4 text-gray-400" /> : <Link2 className="w-4 h-4 text-gray-400" />}
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{item.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge color={item.local ? 'gray' : 'blue'}>{item.local ? 'Local' : 'Cloud'}</Badge>
                {item.supportsTools && <Badge color="green">Tools</Badge>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Saved Profiles</h2>
          <button onClick={() => setModalState({ preset: catalog.find(item => item.id === 'custom') })} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
            <Plus className="w-4 h-4" />
            Add Custom
          </button>
        </div>

        {loading ? (
          <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ) : profiles.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 p-8 text-center text-sm text-gray-500 dark:text-gray-400">No saved provider profiles yet.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {profiles.map(profile => {
              const isActive = activeProfileId === profile.id;
              const busy = providerAction === profile.id;
              return (
                <div key={profile.id} className={`rounded-3xl border bg-white dark:bg-gray-900 midnight:bg-slate-950 p-5 shadow-sm ${isActive ? 'border-green-400 dark:border-green-500' : 'border-gray-200 dark:border-gray-700 midnight:border-slate-800'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{profile.name}</h3>
                        {isActive && <Badge color="green">Active</Badge>}
                        {profile.api_key_set && <Badge color="gray">Key saved</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{providerLabel(profile, catalog)} · {profile.model || 'No model selected'}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-all">{profile.base_url}</p>
                      {profile.last_test_message && (
                        <p className={`mt-2 text-xs ${profile.last_test_status === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{profile.last_test_message}</p>
                      )}
                    </div>
                    {isActive ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" /> : <Cloud className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => activate(profile)} disabled={busy || isActive} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 disabled:opacity-50">
                      {busy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      Activate
                    </button>
                    <button onClick={() => onTest(profile.id)} disabled={busy} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">Test</button>
                    <button onClick={() => openModelPicker(profile)} disabled={modelLoading === profile.id} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">
                      {modelLoading === profile.id ? 'Loading...' : 'Models'}
                    </button>
                    <button onClick={() => setModalState({ profile })} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">Edit</button>
                    <button onClick={() => onDelete(profile.id)} disabled={busy} className="px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/10 disabled:opacity-50">Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detected Local Providers - Ollama & LM Studio */}
      {(ollamaInfo?.found || lmStudioInfo?.found) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Detected Local Providers</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ollamaInfo?.found && (
              <LocalProviderCard
                name="Ollama"
                found
                running={ollamaInfo.running}
                baseUrl={ollamaInfo.baseUrl}
                models={ollamaInfo.models}
                onUse={() => handleUseLocalProvider('ollama', ollamaInfo)}
                onDismiss={() => setOllamaInfo(null)}
                providerAction={providerAction}
              />
            )}
            {lmStudioInfo?.found && (
              <LocalProviderCard
                name="LM Studio"
                found
                running={lmStudioInfo.running}
                baseUrl={lmStudioInfo.baseUrl}
                models={lmStudioInfo.models}
                onUse={() => handleUseLocalProvider('lmstudio', lmStudioInfo)}
                onDismiss={() => setLmStudioInfo(null)}
                providerAction={providerAction}
              />
            )}
          </div>
        </div>
      )}

      {modalState && (
        <ProviderProfileModal
          catalog={catalog}
          profile={modalState.profile || null}
          preset={modalState.preset || null}
          saving={Boolean(providerAction)}
          onClose={() => setModalState(null)}
          onSave={async (payload) => {
            await onSave(modalState.profile?.id || null, payload);
            setModalState(null);
          }}
        />
      )}

      {modelPickerProfile && (
        <RemoteModelPickerModal
          profile={modelPickerProfile}
          models={modelLists[modelPickerProfile.id] || []}
          loading={modelLoading === modelPickerProfile.id}
          onClose={() => setModelPickerProfile(null)}
          onRefresh={() => fetchModels(modelPickerProfile, true)}
          onSelect={async (modelId) => {
            await onSave(modelPickerProfile.id, { model: modelId });
            setModelPickerProfile(prev => prev ? { ...prev, model: modelId } : prev);
          }}
          onSelectAndActivate={async (modelId) => {
            await onSave(modelPickerProfile.id, { model: modelId });
            const nextProfile = { ...modelPickerProfile, model: modelId };
            setModelPickerProfile(null);
            activate(nextProfile);
          }}
        />
      )}

      {pendingActivate && (
        <LocalSwitchPrompt
          profile={pendingActivate}
          serverStatus={serverStatus}
          busy={providerAction === pendingActivate.id}
          onClose={() => setPendingActivate(null)}
          onChoose={async (stopLocal) => {
            await onActivate(pendingActivate.id, stopLocal);
            setPendingActivate(null);
          }}
        />
      )}
    </div>
  );
};

const ModelsPage = () => {
  const { config: modelContextConfig, setConfig: setModelContextConfig } = useModelConfig();
  const [serverStatus, setServerStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [engineData, setEngineData] = useState(null);
  const [engineCatalog, setEngineCatalog] = useState(null);
  const [installJob, setInstallJob] = useState(null);
  const [activeTab, setActiveTab] = useState('library');
  const [hasMlxModels, setHasMlxModels] = useState(false);
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
  const [quickLoadPath, setQuickLoadPath] = useState('');
  const [pythonInstallJob, setPythonInstallJob] = useState(null);
  const [pythonBuildError, setPythonBuildError] = useState('');
  const [pythonBuildSuccess, setPythonBuildSuccess] = useState('');
  const [modelLoadCtxSizes, setModelLoadCtxSizes] = useState(loadSavedModelContextSizes);
  const [modelLoadCtxErrors, setModelLoadCtxErrors] = useState({});
  const [providerCatalog, setProviderCatalog] = useState([]);
  const [providerProfiles, setProviderProfiles] = useState([]);
  const [providerConfig, setProviderConfig] = useState(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [providerAction, setProviderAction] = useState(null);
  const [providerError, setProviderError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const pollCleanup = useRef(null);
  const installPollCleanup = useRef(null);
  const pythonBuildPollCleanup = useRef(null);

  useEffect(() => {
    loadStatus();
    loadModelList();
    loadEngineData();
    loadEngineCatalog();
    loadProviderData();
    return () => {
      pollCleanup.current?.();
      installPollCleanup.current?.();
      pythonBuildPollCleanup.current?.();
    };
  }, []);

  const clearEngineActionMessages = () => {
    setSwitchError('');
    setSwitchSuccess('');
    setInstallError('');
    setInstallSuccess('');
    setRevertSelection(null);
  };

  const updateModelLoadCtxSize = (filename, value) => {
    setModelLoadCtxSizes(prev => ({ ...prev, [filename]: value }));
    setModelLoadCtxErrors(prev => ({ ...prev, [filename]: '' }));
  };

  const commitModelLoadCtxSize = (filename, max = MAX_LOAD_CTX_SIZE) => {
    const fallback = Math.min(DEFAULT_LOAD_CTX_SIZE, max);
    const rawValue = modelLoadCtxSizes[filename] ?? String(fallback);
    const error = getModelLoadCtxError(rawValue, max);
    if (error) {
      setModelLoadCtxErrors(prev => ({ ...prev, [filename]: error }));
      return null;
    }
    const ctxSize = normalizeLoadCtxSize(rawValue, fallback, max);
    const nextValue = String(ctxSize);
    setModelLoadCtxSizes(prev => {
      const next = { ...prev, [filename]: nextValue };
      saveModelContextSizes(next);
      return next;
    });
    setModelLoadCtxErrors(prev => ({ ...prev, [filename]: '' }));
    return ctxSize;
  };

  const getRetryModelContext = () => {
    const filename = serverStatus?.model;
    if (!filename) return undefined;
    const model = models.find(item => item.filename === filename);
    const ctxSize = commitModelLoadCtxSize(filename, getModelContextLimit(model));
    return ctxSize || undefined;
  };

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const [llamaSnap, mlxSnap] = await Promise.all([
        llamaServerApi.getStatus().catch(() => null),
        mlxApi.getStatus().catch(() => null)
      ]);
      const isMlxActive = mlxSnap && (mlxSnap.status === 'ready' || mlxSnap.status === 'loading');
      setServerStatus(isMlxActive ? mlxSnap : (llamaSnap || { status: 'idle' }));
    } catch (err) {
      console.warn('Failed to load server status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadModelList = async () => {
    setLoadingModels(true);
    try {
      const [ggufRes, mlxRes] = await Promise.all([
        localModelsApi.listModels(),
        mlxApi.listModels().catch(() => ({ models: [] }))
      ]);
      const ggufModels = ggufRes?.models ?? [];
      const mlxModels = mlxRes?.models ?? [];

      const unifiedModels = [
        ...ggufModels.map(m => ({ ...m, engineType: 'gguf' })),
        ...mlxModels.map(m => ({ ...m, engineType: 'mlx', filename: m.path }))
      ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      setModels(unifiedModels);
      setHasMlxModels(mlxModels.length > 0);
    } catch (err) {
      console.warn('Failed to load unified model list:', err);
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

  const beginPythonInstallJobPolling = (jobId) => {
    if (!jobId) return;
    pythonBuildPollCleanup.current?.();
    pythonBuildPollCleanup.current = llamaServerApi.pollPythonInstallJob(
      jobId,
      (job) => setPythonInstallJob(job),
      async (job) => {
        setPythonInstallJob(job);
        pythonBuildPollCleanup.current = null;
        if (job.advisor) setEngineData(job.advisor);
        if (job.statusSnapshot) setServerStatus(job.statusSnapshot);
        await loadEngineData();
        setPythonBuildSuccess(`GPU runtime built. GPU layers set to ${job.install?.gpuLayers ?? 0}.`);
        setPythonBuildError('');
      },
      async (job) => {
        setPythonInstallJob(job);
        pythonBuildPollCleanup.current = null;
        setPythonBuildError(job?.error || 'GPU runtime build failed.');
      },
    );
  };

  const handleBuildGpuRuntime = async (profile, retryModelAfterBuild) => {
    setPythonBuildError('');
    setPythonBuildSuccess('');
    try {
      const ctxSize = retryModelAfterBuild ? getRetryModelContext() : undefined;
      const res = await llamaServerApi.startPythonInstallJob({
        profile,
        retryModel: retryModelAfterBuild ? serverStatus?.model || undefined : undefined,
        ctxSize,
      });
      const job = res.job;
      setPythonInstallJob(job);
      beginPythonInstallJobPolling(job.id);
    } catch (err) {
      setPythonBuildError(err.message || 'Failed to start GPU runtime build.');
    }
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

  const loadProviderData = async () => {
    setLoadingProviders(true);
    setProviderError('');
    try {
      const [catalogRes, profilesRes, configRes] = await Promise.all([
        aiProviderApi.getCatalog(),
        aiProviderApi.listProfiles(),
        aiProviderApi.getConfig(),
      ]);
      setProviderCatalog(catalogRes.providers || []);
      setProviderProfiles(profilesRes.profiles || []);
      setProviderConfig(configRes || null);
    } catch (err) {
      setProviderError(err.message || 'Failed to load providers.');
    } finally {
      setLoadingProviders(false);
    }
  };

  const handleProviderSave = async (id, payload) => {
    const actionId = id || 'new';
    setProviderAction(actionId);
    setProviderError('');
    try {
      if (id) {
        await aiProviderApi.updateProfile(id, payload);
      } else {
        await aiProviderApi.createProfile(payload);
      }
      await loadProviderData();
    } catch (err) {
      setProviderError(err.message || 'Failed to save provider.');
      throw err;
    } finally {
      setProviderAction(null);
    }
  };

  const handleProviderDelete = async (id) => {
    setProviderAction(id);
    setProviderError('');
    try {
      await aiProviderApi.deleteProfile(id);
      await loadProviderData();
    } catch (err) {
      setProviderError(err.message || 'Failed to delete provider.');
    } finally {
      setProviderAction(null);
    }
  };

  const handleProviderTest = async (id) => {
    setProviderAction(id);
    setProviderError('');
    try {
      await aiProviderApi.testProfile(id);
      await loadProviderData();
    } catch (err) {
      setProviderError(err.message || 'Provider test failed.');
      await loadProviderData();
    } finally {
      setProviderAction(null);
    }
  };

  const handleProviderActivate = async (id, stopLocal = false) => {
    setProviderAction(id);
    setProviderError('');
    try {
      await aiProviderApi.activateProfile(id, { stopLocal });
      await Promise.all([loadProviderData(), loadStatus()]);
    } catch (err) {
      setProviderError(err.message || 'Failed to activate provider.');
    } finally {
      setProviderAction(null);
    }
  };

  const handleProviderDeactivate = async () => {
    setProviderAction('deactivate');
    setProviderError('');
    try {
      await aiProviderApi.deactivate();
      await loadProviderData();
    } catch (err) {
      setProviderError(err.message || 'Failed to deactivate provider.');
    } finally {
      setProviderAction(null);
    }
  };

  const handleLoadProviderModels = async (id) => {
    try {
      const res = await aiProviderApi.listProviderModels(id);
      return res.models || [];
    } catch (err) {
      setProviderError(err.message || 'Failed to load provider models.');
      return [];
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

  const handleStart = async (filename, modelContextLimit = MAX_LOAD_CTX_SIZE) => {
    const ctxSize = commitModelLoadCtxSize(filename, modelContextLimit);
    if (!ctxSize) return;
    setStartingModel(filename);
    setModelContextConfig({ ctx_size: ctxSize });
    try {
      await llamaServerApi.start(filename, ctxSize);
      setServerStatus(prev => ({ ...prev, status: 'loading', model: filename }));
      pollCleanup.current?.();
      pollCleanup.current = llamaServerApi.pollStatus(
        (snap) => setServerStatus(snap),
        async (snap) => { setServerStatus(snap); setStartingModel(null); pollCleanup.current = null; await loadProviderData(); },
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
      // Safely attempt to stop both engines to guarantee a clean state
      await Promise.all([
        mlxApi.stop().catch(e => console.warn('MLX stop ignored:', e)),
        llamaServerApi.stop().catch(e => console.warn('Llama stop ignored:', e))
      ]);
      setServerStatus({ status: 'idle', model: null });
      await loadProviderData();
      await loadStatus();
    } catch (err) {
      console.error('Failed to stop server:', err);
    } finally {
      setStopping(false);
    }
  };

  const handleDelete = (m) => {
    setDeleteError('');
    setDeleteConfirm(m);
  };

  const confirmDelete = async () => {
    const m = deleteConfirm;
    setDeleteConfirm(null);
    setDeletingModel(m.filename);
    setDeleteError('');
    try {
      if (m.isExternal) {
        await localModelsApi.deleteCustomPath(m.id);
      } else {
        await localModelsApi.deleteModel(m.filename);
      }
      await loadModelList();
    } catch (err) {
      setDeleteError(err.message || 'Failed to remove model');
    } finally {
      setDeletingModel(null);
    }
  };

  const handleAddPath = async () => {
    const p = quickLoadPath.trim();
    if (!p) return;
    
    // Clean up path and extract a friendly name
    const cleanPath = p.replace(/[\\/]+$/, '');
    const isGguf = p.toLowerCase().endsWith('.gguf') || p.toLowerCase().endsWith('.bin');
    const type = isGguf ? 'gguf' : 'mlx';
    const name = cleanPath.split(/[\\/]/).pop().replace(/\.(gguf|bin)$/i, '') || 'Custom Model';
    
    try {
      setSwitchingEngine('adding_path');
      const res = await localModelsApi.saveCustomPath(name, p, 'auto');
      setSwitchSuccess(`Added "${name}" as ${res.type?.toUpperCase() || 'model'} to your library`);
      setQuickLoadPath('');
      await loadModelList();
    } catch (err) {
      setSwitchError(err.message || 'Failed to add path');
    } finally {
      setSwitchingEngine(null);
    }
  };

  const handleEngineSwitch = async (selection, retryModelAfterSwitch) => {
    const key = `${selection.runtime}:${selection.path}${retryModelAfterSwitch ? ':retry' : ''}`;
    const ctxSize = retryModelAfterSwitch ? getRetryModelContext() : undefined;
    if (ctxSize) {
      setModelContextConfig({ ctx_size: ctxSize });
    }
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
        ctxSize,
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
    const ctxSize = retryModelAfterInstall ? getRetryModelContext() : undefined;
    if (ctxSize) {
      setModelContextConfig({ ctx_size: ctxSize });
    }
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
        ctxSize,
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
    ready:   'bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-700 midnight:bg-slate-950 midnight:border-slate-800',
    loading: 'bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-700 midnight:bg-slate-950 midnight:border-slate-800',
    error:   'bg-white border-gray-200 dark:bg-gray-900 dark:border-gray-700 midnight:bg-slate-950 midnight:border-slate-800',
    idle:    'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 midnight:bg-slate-800/50 midnight:border-slate-700',
  }[status] ?? 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700 midnight:bg-slate-800/50 midnight:border-slate-700';

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
  const hardwareBadgeLabel = engineData?.hardware ? conciseHardwareSummary(engineData.hardware) : '';
  const currentCapabilityLabel = engineData?.current?.capabilityLabel || '';
  const showHardwareBadge = Boolean(
    hardwareBadgeLabel
    && hardwareBadgeLabel.toLowerCase() !== currentCapabilityLabel.toLowerCase()
  );
  const tabs = [
    { id: 'library',    label: 'Models',    icon: HardDriveDownload },
    { id: 'providers',  label: 'Providers', icon: Cloud },
    { id: 'engine',     label: 'Engine',    icon: Wrench },
  ];

  return (
    <div className="flex h-full w-full bg-white dark:bg-gray-900 midnight:bg-slate-950 font-sans">
      <ConfirmDeleteDialog
        model={deleteConfirm}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800/60 midnight:border-slate-800/60 flex-shrink-0 bg-white/90 dark:bg-gray-900/90 midnight:bg-slate-950/90 backdrop-blur z-10 sticky top-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 midnight:bg-slate-800 rounded-lg text-gray-700 dark:text-gray-300 midnight:text-slate-300">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 midnight:text-slate-100">
                  Model Studio
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 mt-0.5">
                  Manage the shared AI brain for chat, agents, cloud providers, and local models
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
                loadProviderData();
              }}
              disabled={loadingStatus || loadingModels || loadingEngines || loadingCatalog || loadingProviders || Boolean(switchingEngine) || Boolean(installingEngine)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 midnight:text-slate-300 hover:text-gray-900 dark:hover:text-white midnight:hover:text-white transition-colors bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-gray-700 midnight:border-slate-700"
            >
              <RefreshCw className={`w-4 h-4 ${(loadingStatus || loadingModels || loadingEngines || loadingCatalog || loadingProviders) ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto w-full">
          {deleteError && (
            <div className="mx-8 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-sm text-red-700 dark:text-red-400">
              <TriangleAlert size={15} className="flex-shrink-0" />
              <span className="flex-1">{deleteError}</span>
              <button onClick={() => setDeleteError('')} className="flex-shrink-0 hover:opacity-70 transition-opacity"><X size={14} /></button>
            </div>
          )}
          <div className="max-w-[1400px] mx-auto w-full px-8 py-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <OverviewCard
                icon={HardDriveDownload}
                label="Local Library"
                value={`${models.length} model${models.length === 1 ? '' : 's'}`}
                detail="Ready for GGUF downloads"
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
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white/80 dark:bg-gray-900/70 midnight:bg-slate-950/70 p-2 shadow-sm">
                {tabs.map(({ id, label, icon: Icon }) => {
                  const selected = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                        selected
                          ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 midnight:bg-slate-100 midnight:text-slate-900'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800 midnight:text-slate-400 midnight:hover:text-slate-100 midnight:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {activeTab === 'library' && (
              <div className="flex flex-col gap-8">

                {/* Active Server Banner */}
                <div className={`order-1 relative overflow-hidden rounded-3xl border p-6 transition-all duration-300 shadow-sm ${bannerClass}`}>
                  <div className="relative z-10 flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 bg-white dark:bg-gray-900 midnight:bg-slate-900 rounded-xl shadow-sm border border-black/5 dark:border-white/5 midnight:border-white/5`}>
                        <Server className={`w-6 h-6 ${iconClass}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white midnight:text-slate-100">Active Inference Server</h2>
                          <Badge color={statusColor}>{statusLabel}</Badge>
                        </div>
                        {serverStatus?.model ? (
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300 midnight:text-slate-300">
                            {isReady ? 'Running' : 'Loading'}: <span className="text-gray-800 dark:text-gray-200 midnight:text-slate-100 font-semibold">{serverStatus.model}</span>
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400">
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
	                          {showHardwareBadge && (
	                            <Badge color="gray">{hardwareBadgeLabel}</Badge>
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

                {/* Models: Library + Download combined */}
                <div className={hasMlxModels ? "order-3" : "order-2"}>
                  <div className="flex items-end justify-between mb-4 gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Models</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {models.length > 0
                          ? 'Pick a GGUF model, load it into memory, and iterate from here.'
                          : 'Search HuggingFace above to download your first GGUF model.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {models.length > 0 && <Badge color="blue">{models.length} Models</Badge>}
                    </div>
                  </div>

                  {/* Add Model panel — HF search + custom URL, always visible */}
                  <div className="mb-6 rounded-3xl border border-gray-200 dark:border-gray-700 midnight:border-slate-800 bg-white dark:bg-gray-900 midnight:bg-slate-950 p-6 shadow-sm">
                    <LocalModelsSection onRefresh={loadModelList} />
                  </div>

                  {/* Unified Path Loader */}
                  <div className="bg-white dark:bg-gray-900 midnight:bg-slate-900 border border-gray-200 dark:border-gray-700 midnight:border-slate-800/80 rounded-2xl p-5 shadow-sm mb-6">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="flex-1 w-full">
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Add Local Path
                        </h3>
                        <div className="relative group">
                          <input
                            type="text"
                            value={quickLoadPath}
                            onChange={(e) => setQuickLoadPath(e.target.value)}
                            placeholder="Enter absolute path to .gguf file or MLX directory..."
                            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800/50 midnight:bg-gray-900/50 border border-gray-200 dark:border-gray-700 midnight:border-gray-800/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600 midnight:focus:ring-gray-700 focus:border-gray-300 dark:focus:border-gray-600 midnight:focus:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                          />
                          <FolderOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                      </div>
                      <div className="flex-shrink-0 w-full sm:w-auto self-end">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={async () => {
                              const p = quickLoadPath.trim();
                              if (!p) return;
                              
                              setStartingModel(p);
                              setSwitchError('');
                              setSwitchSuccess('');
                              
                              try {
                                const ctxSize = modelContextConfig?.ctx_size || 4096;
                                const res = await localModelsApi.autoStart(p, ctxSize);
                                
                                setServerStatus(prev => ({ 
                                  ...prev, 
                                  status: 'loading', 
                                  model: p.split(/[\\/]/).pop(), 
                                  modelPath: p,
                                  port: res.engine === 'mlx' ? 8766 : 8765 
                                }));

                                // Polling logic based on detected engine
                                pollCleanup.current?.();
                                const api = res.engine === 'mlx' ? mlxApi : llamaServerApi;
                                
                                pollCleanup.current = api.pollStatus(
                                  (snap) => setServerStatus(snap),
                                  async (snap) => {
                                    setServerStatus(snap);
                                    pollCleanup.current = null;
                                    setStartingModel(null);
                                    await loadEngineData();
                                    await loadProviderData();
                                  },
                                  async (snap) => {
                                    setServerStatus(snap);
                                    pollCleanup.current = null;
                                    setStartingModel(null);
                                    setSwitchError(snap?.error || `Failed to load ${res.engine?.toUpperCase()} model`);
                                  }
                                );
                              } catch (err) {
                                setStartingModel(null);
                                setSwitchError(err.message || 'Failed to start model server');
                              }
                            }}
                            disabled={!quickLoadPath.trim() || startingModel || Boolean(switchingEngine) || Boolean(installingEngine)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-white dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900 midnight:bg-slate-800 midnight:hover:bg-slate-700 rounded-lg transition-all shadow-sm disabled:opacity-50"
                          >
                            {startingModel && <RefreshCw className="w-4 h-4 animate-spin" />}
                            {startingModel ? 'Starting...' : 'Load Model'}
                          </button>
                          
                          <button
                            onClick={handleAddPath}
                            disabled={!quickLoadPath.trim() || Boolean(switchingEngine)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold border border-gray-300 bg-white hover:bg-gray-50 dark:bg-transparent dark:border-gray-700 midnight:border-slate-700 text-gray-700 dark:text-gray-300 midnight:text-slate-400 rounded-lg transition-all disabled:opacity-50"
                            title="Save this path to your library permanently"
                          >
                            {switchingEngine === 'adding_path' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Add to Library
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {switchError && (
                      <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                        <TriangleAlert className="w-4 h-4 flex-shrink-0" />
                        {switchError}
                      </div>
                    )}
                    
                    {switchSuccess && (
                      <div className="mt-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 flex items-center gap-2 text-xs text-green-700 dark:text-green-300">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        {switchSuccess}
                      </div>
                    )}
                    
                    <p className="mt-3 text-[10px] text-gray-400 dark:text-gray-500 italic">
                      Detects automatically: <span className="font-semibold">.gguf/.bin</span> files use llama.cpp; <span className="font-semibold">directories</span> use the MLX engine.
                    </p>
                  </div>

                  {loadingModels ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[1, 2].map(i => (
                        <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800/50 midnight:bg-slate-800/50 rounded-2xl animate-pulse" />
                      ))}
                    </div>
                  ) : models.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-gray-200 dark:border-gray-800 midnight:border-slate-800 rounded-2xl bg-gray-50/50 dark:bg-gray-900/50 midnight:bg-slate-900/50">
                      <div className="p-3 bg-white dark:bg-gray-800 midnight:bg-slate-800 rounded-full shadow-sm mb-3">
                        <Box className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-600 dark:text-gray-300 midnight:text-slate-300 font-medium">Your library is empty</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 midnight:text-slate-400 mt-1 max-w-sm text-center">
                        Use the search above to find and download GGUF models from HuggingFace.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {models.map(m => {
                        const isLoaded = (serverStatus?.model === m.filename || serverStatus?.modelPath === (m.path || m.filename)) && (serverStatus?.status === 'ready' || status === 'ready');
                        const isStarting = startingModel === (m.path || m.filename);
                        const isDeleting = deletingModel === m.filename;
                        const modelContextLimit = getModelContextLimit(m);
                        const modelLoadCtxValue = modelLoadCtxSizes[m.filename] ?? String(Math.min(DEFAULT_LOAD_CTX_SIZE, modelContextLimit));
                        const loadCtxError = modelLoadCtxErrors[m.filename] || getModelLoadCtxError(modelLoadCtxValue, modelContextLimit);

                        return (
                          <div
                            key={m.filename}
                            className={`group relative flex flex-col bg-white dark:bg-gray-800 midnight:bg-slate-900 border rounded-3xl overflow-hidden transition-all duration-200 hover:shadow-md
                              ${isLoaded ? 'border-gray-400 dark:border-gray-500 midnight:border-slate-600 ring-1 ring-gray-400/30 dark:ring-gray-500/30 midnight:ring-slate-500/20 shadow-sm' : 'border-gray-200 dark:border-gray-700 midnight:border-slate-800/80 hover:border-gray-300 dark:hover:border-gray-600 midnight:hover:border-slate-700'}`}
                          >
                            <div className={`absolute inset-x-0 top-0 h-1 ${isLoaded ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                            <div className="p-5 flex-1">
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`p-2 rounded-lg flex-shrink-0 transition-colors ${isLoaded ? 'bg-gray-700 text-white dark:bg-gray-600 midnight:bg-slate-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 midnight:bg-slate-800/50 midnight:text-slate-400'}`}>
                                    {m.isExternal ? <FolderOpen className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white midnight:text-slate-100 truncate" title={m.name || m.filename}>
                                      {m.name || m.filename}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      {m.engineType === 'gguf' && <Badge color="gray">GGUF</Badge>}
                                      {m.engineType === 'mlx' && <Badge color="amber">MLX</Badge>}
                                      {m.isExternal && <Badge color="blue">External</Badge>}
                                      {m.isMissing && <Badge color="red">Missing Path</Badge>}
                                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400 bg-gray-100 dark:bg-gray-900/50 midnight:bg-slate-800/50 px-2 py-0.5 rounded">
                                        {m.sizeFormatted}
                                      </span>
                                      {m.architecture && (
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 midnight:text-slate-400 bg-gray-100 dark:bg-gray-900/50 midnight:bg-slate-800/50 px-2 py-0.5 rounded">
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
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                                <div className="rounded-2xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-slate-950/60 px-3 py-2 border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
                                  <div className="text-[11px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 midnight:text-slate-500">Model context</div>
                                  <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-slate-100">
                                    {m.contextLength ? `${Number(m.contextLength).toLocaleString()} ctx` : 'Unknown'}
                                  </div>
                                </div>
                                <label className="rounded-2xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-slate-950/60 px-3 py-2 border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
                                  <span className="block text-[11px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 midnight:text-slate-500">Load context</span>
                                  <input
                                    type="number"
                                    min="512"
                                    max={modelContextLimit}
                                    step="1024"
                                    value={modelLoadCtxValue}
                                    onChange={(e) => updateModelLoadCtxSize(m.filename, e.target.value)}
                                    onBlur={() => commitModelLoadCtxSize(m.filename, modelContextLimit)}
                                    className={`mt-1 w-full min-w-0 bg-transparent text-sm font-medium outline-none ${
                                      loadCtxError
                                        ? 'text-red-700 dark:text-red-400 midnight:text-red-400'
                                        : 'text-gray-800 dark:text-gray-200 midnight:text-slate-100'
                                    }`}
                                  />
                                </label>
                                <div className="rounded-2xl bg-gray-50 dark:bg-gray-900/60 midnight:bg-slate-950/60 px-3 py-2 border border-gray-100 dark:border-gray-800 midnight:border-slate-800">
                                  <div className="text-[11px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 midnight:text-slate-500">Status</div>
                                  <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200 midnight:text-slate-100">
                                    {isLoaded ? 'Loaded now' : 'Ready to load'}
                                  </div>
                                </div>
                              </div>
                              {loadCtxError && (
                                <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
                                  {loadCtxError}
                                </p>
                              )}
                            </div>

                            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 midnight:bg-slate-900/50 border-t border-gray-100 dark:border-gray-700/50 midnight:border-slate-800/50 flex items-center justify-between gap-2">
                              <button
                                onClick={() => {
                                  if (m.engineType === 'mlx') {
                                    setStartingModel(m.path);
                                    mlxApi.start(m.path).then(() => {
                                      setServerStatus(prev => ({ ...prev, status: 'loading', model: m.name, modelPath: m.path, port: 8766 }));
                                      pollCleanup.current?.();
                                      pollCleanup.current = mlxApi.pollStatus(
                                        (snap) => setServerStatus(snap),
                                        async (snap) => { setServerStatus(snap); pollCleanup.current = null; setStartingModel(null); await loadEngineData(); },
                                        async (snap) => { setServerStatus(snap); pollCleanup.current = null; setStartingModel(null); setSwitchError(snap?.error || 'Failed to load MLX model'); }
                                      );
                                    }).catch(err => {
                                      setStartingModel(null);
                                      setSwitchError(err.message || 'Failed to start MLX server');
                                    });
                                  } else {
                                    handleStart(m.path || m.filename, modelLoadCtxValue);
                                  }
                                }}
                                disabled={isStarting || isDeleting || isLoaded || Boolean(switchingEngine) || Boolean(installingEngine)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50
                                  ${isLoaded 
                                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-200 dark:shadow-none' 
                                    : 'bg-gray-800 hover:bg-gray-700 text-white dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900 midnight:bg-slate-100 midnight:hover:bg-slate-200 midnight:text-slate-900'}`}
                              >
                                {isStarting ? <RefreshCw className="w-4 h-4 animate-spin" /> : isLoaded ? <CheckCircle2 className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                                {isStarting ? 'Loading...' : isLoaded ? 'Active' : 'Load Model'}
                              </button>

                              <button
                                onClick={() => handleDelete(m)}
                                disabled={isDeleting || isLoaded || Boolean(switchingEngine) || Boolean(installingEngine)}
                                className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                                title={m.isExternal ? "Remove from library" : "Delete model"}
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

                  {/* MLX Models — Only show when active or loading an MLX model */}
                  {(serverStatus?.port === 8766 || (serverStatus?.status === 'loading' && startingModel && !startingModel.toLowerCase().endsWith('.gguf') && !startingModel.toLowerCase().endsWith('.bin'))) && (
                    <div className="bg-white dark:bg-gray-900 midnight:bg-slate-950 border border-gray-200 dark:border-gray-700 midnight:border-slate-800/80 rounded-2xl p-5 shadow-sm order-2">
                      <MlxModelsSection 
                        globalServerStatus={serverStatus}
                        onMlxStatusChange={setServerStatus} 
                        onMlxStopRequest={loadStatus}
                      />
                    </div>
                  )}
              </div>
              )}

              {activeTab === 'providers' && (
                <ProvidersSection
                  catalog={providerCatalog}
                  profiles={providerProfiles}
                  activeConfig={providerConfig}
                  serverStatus={serverStatus}
                  loading={loadingProviders}
                  providerAction={providerAction}
                  providerError={providerError}
                  onRefresh={loadProviderData}
                  onSave={handleProviderSave}
                  onDelete={handleProviderDelete}
                  onTest={handleProviderTest}
                  onActivate={handleProviderActivate}
                  onDeactivate={handleProviderDeactivate}
                  onLoadModels={handleLoadProviderModels}
                />
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
                  pythonInstallJob={pythonInstallJob}
                  pythonBuildError={pythonBuildError}
                  pythonBuildSuccess={pythonBuildSuccess}
                  onRescan={loadEngineData}
                  onSwitch={handleEngineSwitch}
                  onInstall={handleManagedInstall}
                  onBuildGpuRuntime={handleBuildGpuRuntime}
                  onRefreshCatalog={loadEngineCatalog}
                />
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
