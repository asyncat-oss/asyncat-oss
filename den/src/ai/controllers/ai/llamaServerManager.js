// llamaServerManager.js — Native llama.cpp server lifecycle manager
// Spawns llama-server as a child process, serves GGUF models via OpenAI-compat API
// on http://127.0.0.1:8765/v1 — no Ollama/LM Studio dependency required.
//
// Binary resolution order:
//   1. LLAMA_BINARY_PATH env var (set in .env for custom installs)
//   2. Asyncat managed llama.cpp binary
//   3. Well-known absolute paths (unsloth, homebrew, standard Linux paths)
//   4. PATH-based lookup (which llama-server)
//   5. Asyncat Python venv or existing llama-cpp-python server
//
// State machine: idle → loading → ready (or error)

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import {
  installManagedLlamaServer,
  readManagedEngineMetadata,
  profileCapabilityHint,
  LLAMA_ENGINE_PROFILES,
  fetchLlamaReleases,
  buildReleaseCatalog,
  installPythonVenvFallback,
} from '../../../../../cli/lib/localEngine.js';

const execAsync = promisify(exec);
const IS_WIN = process.platform === 'win32';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_WRAPPER_PATH = path.resolve(__dirname, '../../../../scripts/llama_cpp_server_wrapper.py');
const DEN_ENV_PATH = path.resolve(__dirname, '../../../../.env');
const LLAMA_PYTHON_IMPORT_PROBE =
  'import site, sys; ' +
  'usersite = site.getusersitepackages(); ' +
  'sys.path.append(usersite) if usersite not in sys.path else None; ' +
  'from llama_cpp.server.__main__ import main';

const LLAMA_PORT      = parseInt(process.env.LLAMA_SERVER_PORT  ?? '8765', 10);
const LLAMA_HOST      = '127.0.0.1';
const LOAD_TIMEOUT_MS = 180_000; // 3 min — large models can take time
const POLL_INTERVAL   = 700;     // ms between /health polls

const MISSING_ENGINE_ERROR =
  'MISSING_ENGINE: Local engine missing. Run asyncat install --local-engine, set LLAMA_BINARY_PATH, or choose /provider for Ollama, LM Studio, or cloud.';

function asyncatHome() {
  if (IS_WIN) {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Asyncat');
  }
  return path.join(os.homedir(), '.asyncat');
}

function managedLlamaBinaryPath() {
  return path.join(asyncatHome(), 'llama.cpp', 'current', IS_WIN ? 'llama-server.exe' : 'llama-server');
}

function managedPythonBinaryPath() {
  if (IS_WIN) return path.join(asyncatHome(), 'llama.cpp', 'python', 'Scripts', 'python.exe');
  return path.join(asyncatHome(), 'llama.cpp', 'python', 'bin', 'python');
}

function expandWildcardPath(pattern) {
  if (!pattern.includes('*')) return [pattern];

  const parsed = path.parse(pattern);
  const parts = pattern
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean);

  let matches = [parsed.root || path.parse(process.cwd()).root];
  for (const part of parts) {
    if (!part.includes('*')) {
      matches = matches.map(base => path.join(base, part));
      continue;
    }

    const re = new RegExp(`^${part.split('*').map(escapeRegex).join('.*')}$`, IS_WIN ? 'i' : '');
    const next = [];
    for (const base of matches) {
      try {
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
          if (re.test(entry.name)) next.push(path.join(base, entry.name));
        }
      } catch { /* skip missing directories */ }
    }
    matches = next;
  }
  return matches;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function detectGpuInfo() {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
      { timeout: 3000 }
    );
    const first = stdout.trim().split('\n').filter(Boolean)[0];
    if (first) {
      const [name, memMb] = first.split(',').map(s => s.trim());
      const vram = Number.isFinite(Number(memMb)) ? ` (${(Number(memMb) / 1024).toFixed(1)} GB VRAM)` : '';
      return {
        vendor: 'NVIDIA',
        name,
        vramGb: Number.isFinite(Number(memMb)) ? +(Number(memMb) / 1024).toFixed(1) : null,
        advice: `NVIDIA GPU detected: ${name}${vram}. Asyncat keeps CPU-safe defaults; for CUDA builds use a CUDA llama.cpp binary or an Asyncat Python venv with CMAKE_ARGS="-DGGML_CUDA=on" python -m pip install "llama-cpp-python[server]".`,
      };
    }
  } catch {}

  try {
    await execAsync('rocm-smi --showuse', { timeout: 3000 });
    return {
      vendor: 'AMD',
      name: 'AMD GPU with ROCm detected',
      vramGb: null,
      advice: 'AMD/ROCm detected. ROCm llama.cpp builds are advanced/manual; keep LLAMA_GPU_LAYERS=0 unless you configure a ROCm-capable build.',
    };
  } catch {}

  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return {
      vendor: 'Apple',
      name: 'Apple Silicon / Metal',
      vramGb: null,
      advice: 'Apple Silicon detected. Use the managed macOS llama.cpp build first, then set LLAMA_GPU_LAYERS in den/.env if you want Metal offload.',
    };
  }

  return null;
}

async function withDiagnostics(result) {
  return {
    managedPath: managedLlamaBinaryPath(),
    managedPythonPath: managedPythonBinaryPath(),
    gpu: await detectGpuInfo(),
    ...result,
  };
}

function currentEnvValue(key) {
  return (process.env[key] || '').trim();
}

function normalizeCandidatePath(candidatePath) {
  if (!candidatePath) return '';
  if (path.isAbsolute(candidatePath) && fs.existsSync(candidatePath)) {
    try {
      return fs.realpathSync(candidatePath);
    } catch {
      return path.resolve(candidatePath);
    }
  }
  return candidatePath;
}

function managedCapabilityHintFor(runtime, candidatePath) {
  if (runtime !== 'binary') return null;
  if (normalizeCandidatePath(candidatePath) !== normalizeCandidatePath(managedLlamaBinaryPath())) return null;
  const metadata = readManagedEngineMetadata();
  const hint = metadata?.capabilityHint || profileCapabilityHint(metadata?.profile || 'cpu_safe');
  if (!hint) return null;
  return {
    profile: metadata?.profile || 'cpu_safe',
    capabilityHint: hint,
    metadata,
  };
}

function capabilityHintFor(runtime, source, candidatePath) {
  const managed = managedCapabilityHintFor(runtime, candidatePath);
  if (managed?.capabilityHint) return managed.capabilityHint;
  const text = `${runtime} ${source || ''} ${candidatePath || ''}`.toLowerCase();
  if (/cuda|cublas/.test(text)) return 'nvidia';
  if (/rocm|hip/.test(text)) return 'amd';
  if (/metal/.test(text)) return 'apple';
  return 'cpu_safe';
}

function capabilityLabelFor(hint) {
  if (hint === 'nvidia') return 'NVIDIA';
  if (hint === 'amd') return 'AMD';
  if (hint === 'apple') return 'Apple';
  return 'CPU-safe';
}

function addEngineCandidate(map, candidate) {
  const normalizedPath = normalizeCandidatePath(candidate.path);
  const key = `${candidate.runtime}:${normalizedPath}`;
  const existing = map.get(key);
  const next = {
    id: key,
    ...candidate,
    path: candidate.path,
    normalizedPath,
    capabilityHint: capabilityHintFor(candidate.runtime, candidate.source, candidate.path),
  };
  if (!existing) {
    next.capabilityLabel = capabilityLabelFor(next.capabilityHint);
    map.set(key, next);
    return;
  }

  existing.source = existing.source === 'PATH' ? next.source : existing.source;
  existing.configured = existing.configured || next.configured;
  existing.managed = existing.managed || next.managed;
  existing.isCurrent = existing.isCurrent || next.isCurrent;
  if (!existing.path && next.path) existing.path = next.path;
  if (existing.capabilityHint === 'cpu_safe' && next.capabilityHint !== 'cpu_safe') {
    existing.capabilityHint = next.capabilityHint;
    existing.capabilityLabel = capabilityLabelFor(next.capabilityHint);
  }
}

function absoluteBinaryCandidatePaths() {
  const home = os.homedir();
  return [
    managedLlamaBinaryPath(),
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'llama-server.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'llama-server.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', '*', 'llama-server.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python*', 'Scripts', 'llama-server.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'llama.cpp', 'llama-server.exe'),
    path.join(home, '.local', 'bin', 'llama-server.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'llama.cpp', 'llama-server.exe'),
    path.join(home, '.unsloth', 'llama.cpp', 'build', 'bin', 'llama-server'),
    path.join(home, '.unsloth', 'llama.cpp', 'llama-server'),
    path.join(home, '.local', 'bin', 'llama-server'),
    path.join(home, 'bin', 'llama-server'),
    '/usr/local/bin/llama-server',
    '/usr/bin/llama-server',
    '/usr/local/llama.cpp/bin/llama-server',
    '/opt/homebrew/bin/llama-server',
    '/usr/local/opt/llama.cpp/bin/llama-server',
  ];
}

function pythonCommandsForDetection() {
  return [
    currentEnvValue('LLAMA_PYTHON_PATH'),
    managedPythonBinaryPath(),
    ...(IS_WIN ? ['python', 'python3', 'py'] : ['python3', 'python']),
  ].filter(Boolean);
}

async function commandPaths(name) {
  try {
    const cmd = IS_WIN ? `where "${name}" 2>nul` : `which -a "${name}" 2>/dev/null`;
    const { stdout } = await execAsync(cmd);
    return stdout.trim().split('\n').map(line => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function pythonHasLlamaServer(pythonCmd) {
  const stderrNull = IS_WIN ? '2>nul' : '2>/dev/null';
  try {
    await execAsync(`${JSON.stringify(pythonCmd)} -c "${LLAMA_PYTHON_IMPORT_PROBE}" ${stderrNull}`);
    return true;
  } catch {
    return false;
  }
}

async function verifyEngineSelection(runtime, selectedPath) {
  const trimmed = String(selectedPath || '').trim();
  if (!trimmed) throw new Error('Engine path is required.');
  if (runtime !== 'binary' && runtime !== 'python') throw new Error('Engine runtime must be "binary" or "python".');

  if (runtime === 'binary') {
    if (path.isAbsolute(trimmed) && !fs.existsSync(trimmed)) {
      throw new Error(`Engine binary not found: ${trimmed}`);
    }
    const actual = path.isAbsolute(trimmed) ? trimmed : trimmed;
    try {
      const { execFileSync } = await import('child_process');
      try {
        execFileSync(actual, ['--version'], { stdio: 'ignore', timeout: 5000 });
      } catch {
        execFileSync(actual, ['--help'], { stdio: 'ignore', timeout: 5000 });
      }
    } catch (err) {
      throw new Error(`Engine binary failed verification: ${err.message}`);
    }
    return { runtime, path: trimmed, normalizedPath: normalizeCandidatePath(trimmed) };
  }

  if (path.isAbsolute(trimmed) && !fs.existsSync(trimmed)) {
    throw new Error(`Python runtime not found: ${trimmed}`);
  }
  if (!(await pythonHasLlamaServer(trimmed))) {
    throw new Error(`Python runtime does not provide llama-cpp-python server support: ${trimmed}`);
  }
  return { runtime, path: trimmed, normalizedPath: normalizeCandidatePath(trimmed) };
}

function recommendationKindForGpu(gpu) {
  if (!gpu) return 'cpu_safe';
  if (gpu.vendor === 'NVIDIA') return 'nvidia_gpu';
  if (gpu.vendor === 'Apple') return 'apple_metal';
  if (gpu.vendor === 'AMD') return 'amd_rocm';
  return 'custom_gpu_needed';
}

function targetCapabilityForGpu(gpu) {
  if (!gpu) return 'cpu_safe';
  if (gpu.vendor === 'NVIDIA') return 'nvidia';
  if (gpu.vendor === 'Apple') return 'apple';
  if (gpu.vendor === 'AMD') return 'amd';
  return 'cpu_safe';
}

function suggestedGpuLayers(capabilityHint, gpu) {
  if (!gpu || capabilityHint === 'cpu_safe') return 0;
  if (gpu.vendor === 'NVIDIA') {
    if (typeof gpu.vramGb === 'number') {
      if (gpu.vramGb < 10) return 20;
      if (gpu.vramGb < 20) return 35;
      return 60;
    }
    return 20;
  }
  if (gpu.vendor === 'Apple' || gpu.vendor === 'AMD') return 20;
  return 20;
}

function buildCurrentEngine(currentInfo, currentEnv) {
  if (!currentInfo?.found) return null;
  const runtime = currentInfo.isPython ? 'python' : 'binary';
  const managed = managedCapabilityHintFor(runtime, currentInfo.path || currentInfo.binary);
  const capabilityHint = capabilityHintFor(runtime, currentInfo.source, currentInfo.path || currentInfo.binary);
  return {
    id: `${runtime}:${normalizeCandidatePath(currentInfo.path || currentInfo.binary)}`,
    runtime,
    path: currentInfo.path || currentInfo.binary,
    normalizedPath: normalizeCandidatePath(currentInfo.path || currentInfo.binary),
    source: currentInfo.source,
    configured: runtime === 'binary'
      ? normalizeCandidatePath(currentEnv.LLAMA_BINARY_PATH) === normalizeCandidatePath(currentInfo.path || currentInfo.binary)
      : normalizeCandidatePath(currentEnv.LLAMA_PYTHON_PATH) === normalizeCandidatePath(currentInfo.path || currentInfo.binary),
    managed: normalizeCandidatePath(currentInfo.path || currentInfo.binary) === normalizeCandidatePath(runtime === 'binary' ? managedLlamaBinaryPath() : managedPythonBinaryPath()),
    capabilityHint,
    capabilityLabel: capabilityLabelFor(capabilityHint),
    isCurrent: true,
    managedProfile: managed?.profile || null,
    managedMetadata: managed?.metadata || null,
  };
}

async function listEngineCandidates(currentEngine = null) {
  const map = new Map();
  const configuredBinary = currentEnvValue('LLAMA_BINARY_PATH');
  const configuredPython = currentEnvValue('LLAMA_PYTHON_PATH');

  if (configuredBinary && fs.existsSync(configuredBinary)) {
    addEngineCandidate(map, {
      runtime: 'binary',
      path: configuredBinary,
      source: 'LLAMA_BINARY_PATH env var',
      configured: true,
      managed: normalizeCandidatePath(configuredBinary) === normalizeCandidatePath(managedLlamaBinaryPath()),
    });
  }

  for (const pattern of absoluteBinaryCandidatePaths()) {
    for (const candidate of expandWildcardPath(pattern)) {
      if (!fs.existsSync(candidate)) continue;
      addEngineCandidate(map, {
        runtime: 'binary',
        path: candidate,
        source: normalizeCandidatePath(candidate) === normalizeCandidatePath(managedLlamaBinaryPath()) ? 'Asyncat managed llama.cpp' : 'auto-detected',
        configured: normalizeCandidatePath(candidate) === normalizeCandidatePath(configuredBinary),
        managed: normalizeCandidatePath(candidate) === normalizeCandidatePath(managedLlamaBinaryPath()),
      });
    }
  }

  const pathNames = IS_WIN
    ? ['llama-server.exe', 'llama-server', 'llama-cpp-server.exe', 'llama-cpp-server']
    : ['llama-server', 'llama-cpp-server'];
  for (const name of pathNames) {
    for (const candidate of await commandPaths(name)) {
      addEngineCandidate(map, {
        runtime: 'binary',
        path: candidate,
        source: 'PATH',
        configured: normalizeCandidatePath(candidate) === normalizeCandidatePath(configuredBinary),
        managed: normalizeCandidatePath(candidate) === normalizeCandidatePath(managedLlamaBinaryPath()),
      });
    }
  }

  for (const pythonCmd of pythonCommandsForDetection()) {
    if (!(await pythonHasLlamaServer(pythonCmd))) continue;
    addEngineCandidate(map, {
      runtime: 'python',
      path: pythonCmd,
      source: pythonCmd === configuredPython
        ? 'LLAMA_PYTHON_PATH env var'
        : normalizeCandidatePath(pythonCmd) === normalizeCandidatePath(managedPythonBinaryPath())
          ? 'Asyncat Python venv'
          : 'llama-cpp-python server package',
      configured: normalizeCandidatePath(pythonCmd) === normalizeCandidatePath(configuredPython),
      managed: normalizeCandidatePath(pythonCmd) === normalizeCandidatePath(managedPythonBinaryPath()),
    });
  }

  if (currentEngine) {
    addEngineCandidate(map, currentEngine);
  }

  const candidates = [...map.values()];
  if (currentEngine) {
    for (const candidate of candidates) {
      candidate.isCurrent = candidate.id === currentEngine.id;
    }
  }

  candidates.sort((a, b) => {
    const score = (candidate) =>
      (candidate.isCurrent ? 100 : 0) +
      (candidate.configured ? 20 : 0) +
      (candidate.managed ? 10 : 0) +
      (candidate.runtime === 'binary' ? 2 : 1);
    return score(b) - score(a) || a.path.localeCompare(b.path);
  });

  return candidates;
}

function buildEngineRecommendation(current, candidates, hardware) {
  const gpu = hardware.gpu;
  const targetCapability = targetCapabilityForGpu(gpu);
  const kind = recommendationKindForGpu(gpu);
  const recommendedInstallProfile = gpu ? kind : 'cpu_safe';
  const recommendedCandidate = targetCapability === 'cpu_safe'
    ? (current?.capabilityHint === 'cpu_safe' ? current : candidates.find(candidate => candidate.capabilityHint === 'cpu_safe') || null)
    : candidates.find(candidate => candidate.capabilityHint === targetCapability) || null;
  const currentCapability = current?.capabilityHint || 'cpu_safe';
  const currentMatchesTarget = targetCapability === 'cpu_safe'
    ? currentCapability === 'cpu_safe'
    : currentCapability === targetCapability;

  if (!gpu) {
    return {
      kind: 'cpu_safe',
      state: 'current_ok',
      title: 'Current setup is fine',
      body: 'No compatible GPU acceleration was detected. Asyncat\'s CPU-safe engine is the recommended default on this machine.',
      recommendedCandidateId: recommendedCandidate?.id || current?.id || null,
      suggestedGpuLayers: 0,
      recommendedInstallProfile: 'cpu_safe',
    };
  }

  if (currentMatchesTarget) {
    return {
      kind,
      state: 'current_ok',
      title: 'Current setup is fine',
      body: `${gpu.vendor} hardware is detected and the active engine already matches it.`,
      recommendedCandidateId: current?.id || recommendedCandidate?.id || null,
      suggestedGpuLayers: suggestedGpuLayers(currentCapability, gpu),
      recommendedInstallProfile,
    };
  }

  if (recommendedCandidate) {
    return {
      kind,
      state: 'recommended_available',
      title: 'Recommended engine available on this machine',
      body: `${gpu.vendor} hardware is detected, but the current engine is ${currentCapability === 'cpu_safe' ? 'CPU-safe' : 'not hardware-optimized'}. Switch to the recommended engine to try GPU offload.`,
      recommendedCandidateId: recommendedCandidate.id,
      suggestedGpuLayers: suggestedGpuLayers(recommendedCandidate.capabilityHint, gpu),
      recommendedInstallProfile,
    };
  }

  return {
    kind: 'custom_gpu_needed',
    state: 'not_installed',
    title: 'Better engine not installed yet',
    body: `${gpu.vendor} hardware is detected, but no matching GPU-capable llama.cpp runtime was found on this machine. Install one manually, then point Asyncat to it here.`,
    recommendedCandidateId: null,
    suggestedGpuLayers: suggestedGpuLayers(targetCapability, gpu),
    recommendedInstallProfile,
  };
}

function sanitizeInstallProfile(profile, hardware = null) {
  if (profile && LLAMA_ENGINE_PROFILES.includes(profile)) return profile;
  if (!hardware?.gpu) return 'cpu_safe';
  if (hardware.gpu.vendor === 'NVIDIA') return 'nvidia_gpu';
  if (hardware.gpu.vendor === 'Apple') return 'apple_metal';
  if (hardware.gpu.vendor === 'AMD') return 'amd_rocm';
  return 'cpu_safe';
}

const RELEASE_CATALOG_TTL_MS = 5 * 60 * 1000;
const releaseCatalogCache = {
  expiresAt: 0,
  releases: [],
};
const installJobs = new Map();
let latestInstallJobId = null;

function nowIso() {
  return new Date().toISOString();
}

function snapshotInstallJob(job = null) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    message: job.message,
    percent: job.percent,
    downloadedBytes: job.downloadedBytes ?? null,
    totalBytes: job.totalBytes ?? null,
    profile: job.profile,
    releaseTag: job.releaseTag,
    assetName: job.assetName,
    retryModel: job.retryModel || null,
    retry: job.retry || null,
    error: job.error || null,
    previousSelection: job.previousSelection || null,
    install: job.install || null,
    advisor: job.advisor || null,
    statusSnapshot: job.statusSnapshot || null,
    diagnostics: job.diagnostics || null,
    createdAt: job.createdAt,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
  };
}

function updateInstallJob(job, patch) {
  Object.assign(job, patch, { updatedAt: nowIso() });
  return snapshotInstallJob(job);
}

function currentInstallJobSnapshot() {
  const job = latestInstallJobId ? installJobs.get(latestInstallJobId) : null;
  if (!job || (job.status !== 'queued' && job.status !== 'running')) return null;
  return snapshotInstallJob(job);
}

function pruneInstallJobs() {
  const entries = [...installJobs.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  for (const job of entries.slice(12)) {
    installJobs.delete(job.id);
  }
}

async function loadReleaseCatalog(force = false) {
  const now = Date.now();
  if (!force && releaseCatalogCache.releases.length > 0 && releaseCatalogCache.expiresAt > now) {
    return releaseCatalogCache.releases;
  }
  const releases = await fetchLlamaReleases(10);
  const catalog = buildReleaseCatalog(releases);
  releaseCatalogCache.releases = catalog;
  releaseCatalogCache.expiresAt = now + RELEASE_CATALOG_TTL_MS;
  return catalog;
}

function persistEngineEnv(updates) {
  const existing = fs.existsSync(DEN_ENV_PATH) ? fs.readFileSync(DEN_ENV_PATH, 'utf8') : '';
  const lines = existing.split('\n');
  const written = new Set();
  const updated = lines.map(raw => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return raw;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return raw;
    const key = trimmed.slice(0, idx).trim();
    if (!(key in updates)) return raw;
    written.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!written.has(key)) updated.push(`${key}=${value}`);
  }

  fs.writeFileSync(DEN_ENV_PATH, updated.join('\n'), 'utf8');
}

function applyProcessEnv(updates) {
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

function currentSelectionSnapshot(currentEngine = null) {
  if (!currentEngine) return null;
  return {
    runtime: currentEngine.runtime,
    path: currentEngine.path,
    source: currentEngine.source,
    id: currentEngine.id,
    capabilityHint: currentEngine.capabilityHint,
  };
}

export async function getEngineAdvisor() {
  const currentInfo = await checkBinary();
  const currentEnv = {
    LLAMA_BINARY_PATH: currentEnvValue('LLAMA_BINARY_PATH'),
    LLAMA_PYTHON_PATH: currentEnvValue('LLAMA_PYTHON_PATH'),
    LLAMA_GPU_LAYERS: currentEnvValue('LLAMA_GPU_LAYERS'),
  };
  const current = buildCurrentEngine(currentInfo, currentEnv);
  const candidates = await listEngineCandidates(current);
  const gpu = await detectGpuInfo();
  const hardware = {
    platform: process.platform,
    arch: process.arch,
    gpu: gpu ? { vendor: gpu.vendor, name: gpu.name, vramGb: gpu.vramGb ?? null } : null,
  };
  const recommendation = buildEngineRecommendation(current, candidates, hardware);

  return {
    current,
    configured: currentEnv,
    hardware,
    candidates,
    recommendation,
  };
}

export async function getEngineInstallCatalog({ force = false } = {}) {
  const advisor = await getEngineAdvisor();
  return {
    generatedAt: nowIso(),
    activeJob: currentInstallJobSnapshot(),
    releases: await loadReleaseCatalog(force),
    current: advisor.current,
    hardware: advisor.hardware,
    recommendation: advisor.recommendation,
  };
}

export async function selectEngine({ runtime, path: selectedPath, retryModel, ctxSize, modelsDir }) {
  console.info('[llamaServer] Switching engine:', JSON.stringify({
    runtime,
    path: selectedPath,
    retryModel: retryModel || null,
  }));
  const previousAdvisor = await getEngineAdvisor();
  const previousSelection = currentSelectionSnapshot(previousAdvisor.current);
  const verified = await verifyEngineSelection(runtime, selectedPath);
  const gpu = await detectGpuInfo();
  const capabilityHint = capabilityHintFor(runtime, runtime === 'python' ? 'llama-cpp-python server package' : 'manual engine', verified.path);
  const gpuLayers = String(suggestedGpuLayers(capabilityHint, gpu));

  const updates = runtime === 'binary'
    ? {
        LLAMA_BINARY_PATH: verified.path,
        LLAMA_PYTHON_PATH: '',
        LLAMA_GPU_LAYERS: gpuLayers,
      }
    : {
        LLAMA_BINARY_PATH: '',
        LLAMA_PYTHON_PATH: verified.path,
        LLAMA_GPU_LAYERS: gpuLayers,
      };

  await stopServer();
  persistEngineEnv(updates);
  applyProcessEnv(updates);

  let retry = {
    attempted: false,
    success: false,
    model: retryModel || null,
    error: null,
  };

  if (retryModel) {
    retry.attempted = true;
    try {
      await startServer(retryModel, modelsDir, ctxSize);
      retry.success = true;
    } catch (err) {
      retry.error = err.message;
    }
  }

  const result = {
    previousSelection,
    advisor: await getEngineAdvisor(),
    retry,
    statusSnapshot: getStatus(),
    applied: {
      runtime,
      path: verified.path,
      gpuLayers: parseInt(gpuLayers, 10),
      capabilityHint,
    },
  };
  console.info('[llamaServer] Engine switch applied:', JSON.stringify({
    runtime,
    path: verified.path,
    capabilityHint,
    gpuLayers: parseInt(gpuLayers, 10),
    retryAttempted: retry.attempted,
    retrySuccess: retry.success,
  }));
  return result;
}

export async function installEngine({ profile, releaseTag, assetName, retryModel, ctxSize, modelsDir, onProgress = null }) {
  const previousAdvisor = await getEngineAdvisor();
  const previousSelection = currentSelectionSnapshot(previousAdvisor.current);
  const effectiveProfile = sanitizeInstallProfile(profile, previousAdvisor.hardware);

  await stopServer();
  const installed = await installManagedLlamaServer({
    profile: effectiveProfile,
    releaseTag,
    assetName,
    onProgress,
  });

  const capabilityHint = profileCapabilityHint(installed.profile || effectiveProfile);
  const gpu = await detectGpuInfo();
  const gpuLayers = String(suggestedGpuLayers(capabilityHint, gpu));
  const updates = {
    LLAMA_BINARY_PATH: installed.binary,
    LLAMA_PYTHON_PATH: '',
    LLAMA_GPU_LAYERS: gpuLayers,
  };
  persistEngineEnv(updates);
  applyProcessEnv(updates);

  let retry = {
    attempted: false,
    success: false,
    model: retryModel || null,
    error: null,
  };

  if (retryModel) {
    retry.attempted = true;
    try {
      await startServer(retryModel, modelsDir, ctxSize);
      retry.success = true;
    } catch (err) {
      retry.error = err.message;
    }
  }

  return {
    previousSelection,
    advisor: await getEngineAdvisor(),
    retry,
    statusSnapshot: getStatus(),
    install: {
      profile: installed.profile || effectiveProfile,
      binary: installed.binary,
      asset: installed.asset,
      version: installed.version,
      gpuLayers: parseInt(gpuLayers, 10),
      capabilityHint,
    },
  };
}

export async function startEngineInstallJob({ profile, releaseTag, assetName, retryModel, ctxSize, modelsDir }) {
  const runningJob = currentInstallJobSnapshot();
  if (runningJob && (runningJob.status === 'queued' || runningJob.status === 'running')) {
    throw new Error('Another managed engine install is already running.');
  }

  const job = {
    id: randomUUID(),
    status: 'queued',
    phase: 'queued',
    message: 'Preparing managed engine install…',
    percent: 0,
    downloadedBytes: null,
    totalBytes: null,
    profile: profile || null,
    releaseTag: releaseTag || null,
    assetName: assetName || null,
    retryModel: retryModel || null,
    retry: null,
    error: null,
    previousSelection: null,
    install: null,
    advisor: null,
    statusSnapshot: null,
    diagnostics: null,
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    updatedAt: nowIso(),
  };

  installJobs.set(job.id, job);
  latestInstallJobId = job.id;
  pruneInstallJobs();
  console.info('[llamaServer] Managed engine install job started:', JSON.stringify({
    jobId: job.id,
    profile: profile || null,
    releaseTag: releaseTag || null,
    assetName: assetName || null,
    retryModel: retryModel || null,
  }));

  (async () => {
    updateInstallJob(job, {
      status: 'running',
      phase: 'preparing',
      message: 'Inspecting hardware and preparing install…',
      startedAt: nowIso(),
      percent: 1,
    });

    try {
      const result = await installEngine({
        profile,
        releaseTag,
        assetName,
        retryModel,
        ctxSize,
        modelsDir,
        onProgress: progress => {
          updateInstallJob(job, {
            status: 'running',
            phase: progress.phase || 'running',
            message: progress.message || 'Installing managed engine…',
            percent: typeof progress.percent === 'number' ? progress.percent : job.percent,
            downloadedBytes: progress.downloadedBytes ?? job.downloadedBytes,
            totalBytes: progress.totalBytes ?? job.totalBytes,
            releaseTag: progress.releaseTag || releaseTag || job.releaseTag,
            assetName: progress.assetName || assetName || job.assetName,
          });
        },
      });

      updateInstallJob(job, {
        status: 'complete',
        phase: result.retry?.attempted ? 'retrying_model' : 'complete',
        message: result.retry?.attempted
          ? (result.retry.success ? 'Managed engine installed and model retry started.' : 'Managed engine installed, but model retry failed.')
          : 'Managed engine installed successfully.',
        percent: 100,
        retry: result.retry,
        previousSelection: result.previousSelection,
        install: result.install,
        advisor: result.advisor,
        statusSnapshot: result.statusSnapshot,
        diagnostics: null,
        finishedAt: nowIso(),
      });
      console.info('[llamaServer] Managed engine install job completed:', JSON.stringify({
        jobId: job.id,
        profile: result.install?.profile || profile || null,
        asset: result.install?.asset || assetName || null,
        retryAttempted: result.retry?.attempted || false,
        retrySuccess: result.retry?.success || false,
      }));
      releaseCatalogCache.expiresAt = 0;
    } catch (err) {
      const diagnostics = err.diagnostics || null;
      console.error('[llamaServer] Managed engine install failed:', err.message || err);
      if (diagnostics) {
        console.error('[llamaServer] Managed engine install diagnostics:', JSON.stringify(diagnostics, null, 2));
      }
      updateInstallJob(job, {
        status: 'error',
        phase: 'error',
        message: err.message || 'Managed engine install failed.',
        error: err.message || 'Managed engine install failed.',
        diagnostics,
        finishedAt: nowIso(),
      });
    }
  })();

  return snapshotInstallJob(job);
}

export function getEngineInstallJob(jobId) {
  return snapshotInstallJob(installJobs.get(jobId));
}

// ── Python GPU engine build (async compile via pip) ───────────────────────────

const PYTHON_GPU_CAPABILITY = {
  nvidia_gpu:  'nvidia',
  apple_metal: 'apple',
  amd_rocm:    'amd',
};

function runCommandStreaming(cmd, args, options = {}, timeoutMs = 120000, onLine = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Timed out: ${cmd}`)); }, timeoutMs);
    const onChunk = (chunk) => {
      if (!onLine) return;
      chunk.toString().split('\n').filter(l => l.trim()).forEach(l => onLine(l.trim()));
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    let errTail = '';
    child.stderr.on('data', (c) => { errTail = (errTail + c).slice(-800); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${errTail.trim()}`));
    });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function findPythonCmd() {
  const cmds = IS_WIN ? ['python', 'python3', 'py'] : ['python3', 'python'];
  for (const cmd of cmds) {
    try { await execAsync(`${cmd} --version`, { timeout: 5000 }); return cmd; } catch {}
  }
  throw new Error('Python 3 not found. Install Python 3.10+ first.');
}

async function checkCxxCompiler() {
  const compilers = IS_WIN ? ['cl', 'clang++', 'g++'] : ['g++', 'c++', 'clang++'];
  for (const cmd of compilers) {
    try { await execAsync(`${cmd} --version`, { timeout: 5000 }); return cmd; } catch {}
  }
  return null;
}

function cxxInstallHint() {
  const p = process.platform;
  if (p === 'linux') {
    // Detect distro from /etc/os-release
    let id = '';
    try { id = fs.readFileSync('/etc/os-release', 'utf8'); } catch {}
    if (/fedora|rhel|centos|rocky|alma/i.test(id)) return 'sudo dnf install gcc-c++ make';
    return 'sudo apt install build-essential';
  }
  if (p === 'darwin') return 'xcode-select --install';
  return 'Install Visual Studio Build Tools (C++ workload) from visualstudio.microsoft.com';
}

// Compiler/linker output lines we don't need to surface to the user
const NOISY_OUTPUT_RE = /^\s*$|^#|^\s*\[|nvcc |gcc |g\+\+ |clang|\.cpp$|\.cu$|\.o$|^ninja:|^cmake\s*-|^--\s/i;

// Locate nvcc in PATH or common install directories.
// Returns { inPath, cudaRoot } or null if not found.
async function findNvcc() {
  try { await execAsync('nvcc --version', { timeout: 5000 }); return { inPath: true, cudaRoot: null }; } catch {}

  const candidates = IS_WIN
    ? [path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'NVIDIA GPU Computing Toolkit', 'CUDA')]
    : ['/usr/local/cuda', '/opt/cuda'];

  if (!IS_WIN) {
    try {
      const dirs = fs.readdirSync('/usr/local').filter(n => /^cuda(-\d[\d.]*)?$/.test(n));
      candidates.push(...dirs.map(d => path.join('/usr/local', d)));
    } catch {}
  }

  for (const base of candidates) {
    const nvcc = path.join(base, 'bin', IS_WIN ? 'nvcc.exe' : 'nvcc');
    if (fs.existsSync(nvcc)) return { inPath: false, cudaRoot: base, nvccPath: nvcc };
  }
  return null;
}

function cudaInstallHint() {
  if (process.platform === 'linux') {
    let osRelease = '';
    try { osRelease = fs.readFileSync('/etc/os-release', 'utf8'); } catch {}

    if (/fedora|rhel|centos|rocky|alma/i.test(osRelease)) {
      const m = osRelease.match(/^VERSION_ID="?(\d+)"?/m);
      const fedoraVer = parseInt(m ? m[1] : '43', 10);
      // NVIDIA has repos for fedora39–43; clamp to that range
      const repoVer = Math.min(Math.max(fedoraVer, 39), 43);
      // Fedora 41+ uses dnf5 which changed the config-manager syntax
      const addRepoCmd = fedoraVer >= 41
        ? `sudo dnf config-manager addrepo --from-repofile=https://developer.download.nvidia.com/compute/cuda/repos/fedora${repoVer}/x86_64/cuda-fedora${repoVer}.repo`
        : `sudo dnf config-manager --add-repo https://developer.download.nvidia.com/compute/cuda/repos/fedora${repoVer}/x86_64/cuda-fedora${repoVer}.repo`;
      return [
        addRepoCmd,
        'sudo dnf clean all',
        'sudo dnf install cuda-toolkit',
        "echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc",
        'source ~/.bashrc',
      ].join('\n');
    }

    // Ubuntu / Debian
    return [
      'sudo apt install nvidia-cuda-toolkit',
      "echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc",
      'source ~/.bashrc',
    ].join('\n');
  }
  if (process.platform === 'darwin') return 'CUDA is not supported on macOS — use the Metal runtime instead.';
  return 'Install CUDA Toolkit from developer.nvidia.com/cuda-downloads (select Windows).';
}

async function installPythonEngine({ profile, retryModel, ctxSize, modelsDir, onProgress = null }) {
  // Pre-flight: C++ compiler is required to build llama-cpp-python from source
  const cxx = await checkCxxCompiler();
  if (!cxx) {
    const hint = cxxInstallHint();
    throw new Error(`C++ compiler (g++) not found.\nRun this first: ${hint}`);
  }

  // Pre-flight for CUDA builds: nvcc must be present before cmake runs
  let cudaEnvOverrides = {};
  if (profile === 'nvidia_gpu') {
    const nvccInfo = await findNvcc();
    if (!nvccInfo) {
      const hint = cudaInstallHint();
      throw new Error(`CUDA Toolkit not found (nvcc missing).\n${hint}`);
    }
    if (!nvccInfo.inPath && nvccInfo.cudaRoot) {
      // nvcc exists but isn't on PATH — tell cmake where to find it
      const cudaBin = path.join(nvccInfo.cudaRoot, 'bin');
      cudaEnvOverrides = {
        CUDAToolkit_ROOT: nvccInfo.cudaRoot,
        PATH: `${cudaBin}${IS_WIN ? ';' : ':'}${process.env.PATH || ''}`,
      };
    }

    // CUDA 12.6 only officially supports up to GCC 13. Fedora 40+ ships GCC 14/15.
    // Check GCC version and fix automatically: prefer clang++ as host compiler,
    // fall back to --allow-unsupported-compiler if clang isn't available.
    try {
      const { stdout: gccOut } = await execAsync('gcc --version', { timeout: 5000 });
      const gccMajor = parseInt((gccOut.match(/\b(\d+)\.\d+\.\d+/) || [])[1] || '0', 10);
      if (gccMajor >= 14) {
        let clangAvailable = false;
        try { await execAsync('clang++ --version', { timeout: 5000 }); clangAvailable = true; } catch {}
        if (clangAvailable) {
          cudaEnvOverrides.CUDAHOSTCXX = 'clang++';
        } else {
          // clang not installed — tell nvcc to skip the version check
          cudaEnvOverrides.CUDAFLAGS = (cudaEnvOverrides.CUDAFLAGS ? cudaEnvOverrides.CUDAFLAGS + ' ' : '') + '--allow-unsupported-compiler';
        }
      }
    } catch {}
  }

  const pythonCmd = await findPythonCmd();
  const capabilityHint = PYTHON_GPU_CAPABILITY[profile] || 'cpu_safe';
  const pythonVenvDir = path.join(asyncatHome(), 'llama.cpp', 'python');

  onProgress?.({ phase: 'venv', message: 'Creating Python virtual environment…', percent: 5 });
  await runCommandStreaming(pythonCmd, ['-m', 'venv', pythonVenvDir], {}, 120000);

  const pythonBin = managedPythonBinaryPath();

  onProgress?.({ phase: 'pip', message: 'Upgrading pip…', percent: 10 });
  await runCommandStreaming(pythonBin, ['-m', 'pip', 'install', '--upgrade', 'pip'], {}, 120000);

  // ninja + cmake must be pre-installed in the venv so llama-cpp-python's build
  // backend can find them. Without this, pip's isolated build environment tries
  // to download ninja and fails on restricted networks or older pip.
  onProgress?.({ phase: 'build_tools', message: 'Installing build tools (ninja, cmake, scikit-build-core)…', percent: 20 });
  await runCommandStreaming(
    pythonBin,
    ['-m', 'pip', 'install', 'ninja', 'cmake', 'scikit-build-core', 'wheel', 'setuptools'],
    {}, 300000
  );

  const cmakeArgs = { nvidia_gpu: '-DGGML_CUDA=on', apple_metal: '-DGGML_METAL=on', amd_rocm: '-DGGML_HIP=on' }[profile] || '';
  const env = { ...(cmakeArgs ? { ...process.env, CMAKE_ARGS: cmakeArgs } : process.env), ...cudaEnvOverrides };
  const tag = profile === 'nvidia_gpu' ? 'CUDA' : profile === 'apple_metal' ? 'Metal' : profile === 'amd_rocm' ? 'ROCm' : 'CPU';

  onProgress?.({ phase: 'compile', message: `Compiling llama-cpp-python with ${tag} support — takes 10–30 min…`, percent: 30 });
  await runCommandStreaming(
    pythonBin,
    // --no-build-isolation reuses the ninja/cmake we just installed instead of
    // trying to download them again inside an isolated build env
    ['-m', 'pip', 'install', 'llama-cpp-python[server]', '--no-build-isolation'],
    { env }, 3600000,
    (line) => {
      if (!NOISY_OUTPUT_RE.test(line)) {
        onProgress?.({ phase: 'compile', message: line.slice(0, 140), percent: null });
      }
    }
  );

  onProgress?.({ phase: 'finalizing', message: 'Finalizing installation…', percent: 95 });
  const gpu = await detectGpuInfo();
  const gpuLayers = String(suggestedGpuLayers(capabilityHint, gpu));
  const updates = { LLAMA_BINARY_PATH: '', LLAMA_PYTHON_PATH: pythonBin, LLAMA_GPU_LAYERS: gpuLayers };
  persistEngineEnv(updates);
  applyProcessEnv(updates);

  return { pythonPath: pythonBin, profile, capabilityHint, gpuLayers: parseInt(gpuLayers, 10) };
}

const pythonInstallJobs = new Map();
let latestPythonInstallJobId = null;

export async function startPythonEngineInstallJob({ profile, retryModel, ctxSize, modelsDir }) {
  const running = [...pythonInstallJobs.values()].find(j => j.status === 'queued' || j.status === 'running');
  if (running) throw new Error('A Python GPU runtime build is already running.');

  const job = {
    id: randomUUID(), status: 'queued', phase: 'queued',
    message: 'Preparing Python GPU runtime build…', percent: 0,
    profile: profile || null, retryModel: retryModel || null,
    retry: null, error: null, install: null, advisor: null, statusSnapshot: null,
    createdAt: nowIso(), startedAt: null, finishedAt: null, updatedAt: nowIso(),
  };

  pythonInstallJobs.set(job.id, job);
  latestPythonInstallJobId = job.id;

  const update = (fields) => Object.assign(job, fields, { updatedAt: nowIso() });

  (async () => {
    update({ status: 'running', phase: 'preparing', message: 'Inspecting hardware…', startedAt: nowIso(), percent: 1 });
    try {
      const result = await installPythonEngine({
        profile, retryModel, ctxSize, modelsDir,
        onProgress: (p) => update({
          status: 'running', phase: p.phase || 'running',
          message: p.message || 'Building…',
          percent: typeof p.percent === 'number' ? p.percent : job.percent,
        }),
      });

      let retry = { attempted: false, success: false, model: retryModel || null, error: null };
      if (retryModel) {
        retry.attempted = true;
        try { await startServer(retryModel, modelsDir, ctxSize); retry.success = true; }
        catch (e) { retry.error = e.message; }
      }

      update({
        status: 'complete', phase: 'complete', percent: 100,
        message: `GPU runtime built. GPU layers set to ${result.gpuLayers}.`,
        install: result, retry, advisor: await getEngineAdvisor(),
        statusSnapshot: getStatus(), finishedAt: nowIso(),
      });
    } catch (e) {
      console.error('[llamaServer] Python GPU build failed:', e.message);
      update({ status: 'error', phase: 'error', message: e.message || 'Build failed.', error: e.message, finishedAt: nowIso() });
    }
  })();

  return { id: job.id, status: job.status, phase: job.phase, message: job.message, percent: job.percent, profile: job.profile };
}

export function getPythonEngineInstallJob(jobId) {
  const job = pythonInstallJobs.get(jobId);
  return job ? { ...job } : null;
}

// ── Singleton state ───────────────────────────────────────────────────────────
const state = {
  status:    'idle',   // 'idle' | 'loading' | 'ready' | 'error'
  model:     null,     // filename of loaded model
  pid:       null,
  error:     null,     // human-readable classified error
  errorRaw:  null,     // full raw log output for debug
  startedAt: null,
  logLines:  [],       // ring buffer of last 80 log lines
  proc:      null,     // ChildProcess handle
  ctxSize:   null,     // context window size used when starting
  ctxTrain:  null,     // model's n_ctx_train from /props (max supported ctx)
};

const subscribers = new Set();
const DEFAULT_CTX_SIZE = 32768;
const MAX_CTX_SIZE = 1048576;

function normalizeCtxSize(value, fallback = DEFAULT_CTX_SIZE) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 512) return fallback;
  return Math.min(n, MAX_CTX_SIZE);
}

function pushLog(line) {
  if (!line.trim()) return;
  state.logLines.push(line);
  if (state.logLines.length > 80) state.logLines.shift();
}

function captureProcessOutput(source, chunk) {
  const lines = chunk.toString().split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    pushLog(line);
    if (!shouldMirrorProcessLog(line)) continue;
    const prefix = `[llamaServer:${source}]`;
    if (source === 'stderr') {
      console.error(`${prefix} ${line}`);
    } else {
      console.log(`${prefix} ${line}`);
    }
  }
}

function shouldMirrorProcessLog(line) {
  return /^Traceback/i.test(line)
    || /ModuleNotFoundError|ImportError|FileNotFoundError|error|failed|fatal|warning|address already in use|no module|started server process|application startup complete|uvicorn running|GET \/health|GET \/v1\/models/i.test(line);
}

function emit(patch) {
  Object.assign(state, patch);
  const snap = snapshot();
  subscribers.forEach(fn => fn(snap));
}

function snapshot() {
  const error = state.error || null;
  // Derive a short errorCode from the classified message prefix (e.g. 'CORRUPTED')
  const errorCode = error ? (error.match(/^([A-Z_]+):/)?.[1] ?? null) : null;
  return {
    status:     state.status,
    model:      state.model,
    pid:        state.pid,
    error,
    errorCode,  // 'CORRUPTED' | 'OOM' | 'PORT' | 'MISSING' | 'UNSUPPORTED' | null
    startedAt:  state.startedAt,
    port:       LLAMA_PORT,
    baseUrl:    state.status === 'ready' ? `http://${LLAMA_HOST}:${LLAMA_PORT}/v1` : null,
    ctxSize:    state.ctxSize ?? normalizeCtxSize(process.env.LLAMA_CTX_SIZE),
    ctxTrain:   state.ctxTrain ?? null,
    logs:       state.status === 'loading' || state.status === 'error'
      ? state.logLines.slice(-20)
      : [],
  };
}

/** Subscribe to live status events. Returns an unsubscribe function. */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** Current status snapshot (no side effects). */
export function getStatus() {
  return snapshot();
}

// ── Binary detection ──────────────────────────────────────────────────────────

/**
 * Probe the system for a usable llama-server binary.
 *
 * Returns { found: true, binary: '/path/to/llama-server', path: '...', source: '...' }
 * or      { found: false, searched: [...] }
 *
 * Users can override by setting LLAMA_BINARY_PATH=/path/to/llama-server in .env
 */
export async function checkBinary() {
  // 1. Explicit env var override — highest priority, always wins
  if (process.env.LLAMA_BINARY_PATH) {
    const envPath = process.env.LLAMA_BINARY_PATH.trim();
    if (fs.existsSync(envPath)) {
      return withDiagnostics({ found: true, binary: envPath, path: envPath, source: 'LLAMA_BINARY_PATH env var' });
    }
    // Env var was set but path doesn't exist — warn but continue searching
    console.warn(`[llamaServer] LLAMA_BINARY_PATH="${envPath}" does not exist, falling through to auto-detect`);
  }

  const home = os.homedir();

  // 2. Well-known absolute paths (no PATH needed)
  //    Covers: unsloth installs, homebrew, standard Linux locations
  //    Also includes Windows paths for llama-server binaries
  const absolutePaths = [
    managedLlamaBinaryPath(),
    // Windows llama-server locations
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'llama-server.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'llama-server.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', '*', 'llama-server.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python*', 'Scripts', 'llama-server.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'llama.cpp', 'llama-server.exe'),
    path.join(home, '.local', 'bin', 'llama-server.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'llama.cpp', 'llama-server.exe'),
    // unsloth studio ships its own llama.cpp build
    path.join(home, '.unsloth', 'llama.cpp', 'build', 'bin', 'llama-server'),
    path.join(home, '.unsloth', 'llama.cpp', 'llama-server'),
    // user-local installs
    path.join(home, '.local', 'bin', 'llama-server'),
    path.join(home, 'bin', 'llama-server'),
    // system-wide
    '/usr/local/bin/llama-server',
    '/usr/bin/llama-server',
    '/usr/local/llama.cpp/bin/llama-server',
    // macOS homebrew
    '/opt/homebrew/bin/llama-server',
    '/usr/local/opt/llama.cpp/bin/llama-server',
  ];

  for (const p of absolutePaths) {
    for (const candidate of expandWildcardPath(p)) {
      if (fs.existsSync(candidate)) {
        return withDiagnostics({
          found: true,
          binary: candidate,
          path: candidate,
          source: candidate === managedLlamaBinaryPath() ? 'Asyncat managed llama.cpp' : 'auto-detected',
        });
      }
    }
  }

  // 3. PATH-based lookup
  const pathNames = IS_WIN
    ? ['llama-server.exe', 'llama-server', 'llama-cpp-server.exe', 'llama-cpp-server']
    : ['llama-server', 'llama-cpp-server'];
  for (const name of pathNames) {
    try {
      // Use 'where' on Windows, 'which' on Unix
      const cmd = IS_WIN ? `where "${name}" 2>nul` : `which "${name}" 2>/dev/null`;
      const { stdout } = await execAsync(cmd);
      const p = stdout.trim().split('\n')[0]; // Take first match on Windows
      if (p) return withDiagnostics({ found: true, binary: p, path: p, source: 'PATH' });
    } catch { /* not found */ }
  }

  // 4. Asyncat Python venv or existing llama-cpp-python package.
  const pythonCommands = [
    process.env.LLAMA_PYTHON_PATH,
    managedPythonBinaryPath(),
    ...(IS_WIN ? ['python', 'python3', 'py'] : ['python3', 'python']),
  ].filter(Boolean);
  const stderrNull = IS_WIN ? '2>nul' : '2>/dev/null';
  const serverImportProbe =
    'import site, sys; ' +
    'usersite = site.getusersitepackages(); ' +
    'sys.path.append(usersite) if usersite not in sys.path else None; ' +
    'from llama_cpp.server.__main__ import main';
  for (const pythonCmd of pythonCommands) {
    try {
      await execAsync(`${JSON.stringify(pythonCmd)} -c "${serverImportProbe}" ${stderrNull}`);
      return withDiagnostics({
        found:    true,
        binary:   pythonCmd,
        path:     pythonCmd,
        source:   'llama-cpp-python server package',
        isPython: true,
        pythonCmd, // Store the working command for spawning
      });
    } catch { /* not installed */ }
  }

  return withDiagnostics({
    found:    false,
    searched: [...absolutePaths, ...pathNames, ...pythonCommands.map(cmd => `${cmd} llama-cpp-python`)],
    hint:     'Run asyncat install --local-engine, set LLAMA_BINARY_PATH=/path/to/llama-server, or choose /provider for Ollama, LM Studio, or cloud.',
  });
}

// ── Server start/stop ─────────────────────────────────────────────────────────

/**
 * Start the built-in llama-server with the given model file.
 * Returns immediately — loading happens in background.
 * Callers should poll getStatus() or subscribe() for state changes.
 * Throws synchronously on binary-not-found or model-not-found.
 */
export async function startServer(modelFilename, modelsDir, ctxSizeOverride) {
  if (state.status === 'loading') {
    throw new Error('A model is already loading. Please wait.');
  }

  // Stop whatever is running first
  if (state.proc) {
    await stopServer();
  }

  const isAbs = path.isAbsolute(modelFilename.trim());
  const modelPath = isAbs ? modelFilename.trim() : path.join(modelsDir, path.basename(modelFilename.trim()));
  const safeFilename = path.basename(modelPath);

  if (!fs.existsSync(modelPath)) {
    throw new Error(
      `Model file not found: ${safeFilename}\n` +
      `Expected at: ${modelPath}\n` +
      `Tip: Download the model from Models first.`
    );
  }

  const binInfo = await checkBinary();
  if (!binInfo.found) {
    throw new Error(MISSING_ENGINE_ERROR);
  }

  const cpuCount   = os.cpus().length;
  const nThreads   = process.env.LLAMA_THREADS    ?? String(Math.max(1, cpuCount - 1));
  // Default to CPU-only unless the user explicitly opts into GPU offload.
  // This avoids startup failures on builds without a working Metal/CUDA backend.
  const nGpuLayers = process.env.LLAMA_GPU_LAYERS ?? '0';
  const ctxSize    = String(normalizeCtxSize(ctxSizeOverride ?? process.env.LLAMA_CTX_SIZE));

  emit({
    status:    'loading',
    model:     safeFilename,
    error:     null,
    pid:       null,
    startedAt: new Date().toISOString(),
    logLines:  [
      `[asyncat] Starting ${binInfo.binary}`,
      `[asyncat] Model: ${modelPath}`,
      `[asyncat] GPU layers: ${nGpuLayers}`,
    ],
    ctxSize:   parseInt(ctxSize, 10),
  });

  let proc;
  // Use the python command that was found during checkBinary (could be 'python', 'python3', or 'py' on Windows)
  const pythonCmd = binInfo.pythonCmd || (IS_WIN ? 'python' : 'python3');

  if (binInfo.isPython) {
    const childEnv = {
      ...process.env,
      HOST: LLAMA_HOST,
      PORT: String(LLAMA_PORT),
      LLAMA_SERVER_PORT: String(LLAMA_PORT),
    };
    proc = spawn(pythonCmd, [
      PYTHON_WRAPPER_PATH,
      '--model',         modelPath,
      '--host',          LLAMA_HOST,
      '--port',          String(LLAMA_PORT),
      '--n_ctx',         ctxSize,
      '--n_gpu_layers',  nGpuLayers,
      '--n_threads',     nThreads,
    ], { stdio: ['ignore', 'pipe', 'pipe'], detached: false, windowsHide: IS_WIN, env: childEnv });
  } else {
    const binaryPath = binInfo.binary.endsWith('.exe') ? binInfo.binary : binInfo.binary;
    proc = spawn(binaryPath, [
      '-m',         modelPath,
      '--host',     LLAMA_HOST,
      '--port',     String(LLAMA_PORT),
      '--ctx-size', ctxSize,
      '-ngl',       nGpuLayers,
      '--threads',  nThreads,
      // Note: intentionally NOT passing --log-disable so we capture startup errors
    ], { stdio: ['ignore', 'pipe', 'pipe'], detached: false, windowsHide: IS_WIN });
  }

  state.proc = proc;
  emit({ pid: proc.pid });

  proc.stdout?.on('data', d => captureProcessOutput('stdout', d));
  proc.stderr?.on('data', d => captureProcessOutput('stderr', d));

  proc.on('error', err => {
    const message = `START_FAILED: Could not start llama-server: ${err.message}`;
    pushLog(message);
    emit({
      status:   'error',
      error:    message,
      errorRaw: state.logLines.join('\n'),
      proc:     null,
      pid:      null,
    });
    state.proc = null;
  });

  proc.on('exit', (code, signal) => {
    if (state.status === 'loading' || state.status === 'ready') {
      const allLogs = state.logLines.join('\n');
      emit({
        status:       'error',
        error:        classifyError(allLogs, code),
        errorRaw:     allLogs,
        proc:         null,
        pid:          null,
      });
    }
    state.proc = null;
  });

  // Poll /health in background — updates state via emit() when ready
  waitUntilReady().catch(err => {
    if (state.status !== 'idle') {
      emit({ status: 'error', error: err.message, proc: null, pid: null });
    }
  });
}

async function waitUntilReady() {
  const healthUrl = `http://${LLAMA_HOST}:${LLAMA_PORT}/health`;
  const modelsUrl = `http://${LLAMA_HOST}:${LLAMA_PORT}/v1/models`;
  const deadline  = Date.now() + LOAD_TIMEOUT_MS;

  while (Date.now() < deadline) {
    // Process already exited (handled by 'exit' handler above)
    if (!state.proc || state.status === 'error') return;

    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res   = await fetch(healthUrl, { signal: ctrl.signal });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        // llama-server: { status: 'ok' } = ready, { status: 'loading model' } = still loading
        if (json.status === 'ok' || !json.status) {
          emit({ status: 'ready', ctxTrain: await readCtxTrain() });
          return;
        }
        // Still loading weights — keep waiting
      }
      // 503 = loading model, anything else = keep waiting
    } catch { /* server not accepting connections yet — normal during startup */ }

    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res   = await fetch(modelsUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (Array.isArray(json.data) && json.data.length > 0) {
          // Warmup ping: /v1/models goes ready slightly before /v1/chat/completions.
          // One minimal request flushes any remaining initialization.
          const modelId = json.data[0].id;
          try {
            const wCtrl = new AbortController();
            const wTimer = setTimeout(() => wCtrl.abort(), 5000);
            await fetch(`http://${LLAMA_HOST}:${LLAMA_PORT}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: ' ' }] }),
              signal: wCtrl.signal,
            });
            clearTimeout(wTimer);
          } catch { /* warmup failed — server may still serve real requests fine */ }
          emit({ status: 'ready', ctxTrain: await readCtxTrain() });
          return;
        }
      }
    } catch { /* some llama-server builds do not expose /health while booting */ }

    await sleep(POLL_INTERVAL);
  }

  const err = 'Model load timed out (3 min). The model may be too large for your hardware, or try a smaller quantization (Q4_K_M instead of Q8).';
  emit({ status: 'error', error: err });
  await stopServer({ preserveState: true }).catch(() => {});
}

async function readCtxTrain() {
  try {
    const propsCtrl  = new AbortController();
    const propsTimer = setTimeout(() => propsCtrl.abort(), 2500);
    const propsRes   = await fetch(`http://${LLAMA_HOST}:${LLAMA_PORT}/props`, { signal: propsCtrl.signal });
    clearTimeout(propsTimer);
    if (propsRes.ok) {
      const props = await propsRes.json().catch(() => ({}));
      return props.n_ctx_train || null;
    }
  } catch { /* non-critical — older llama-server versions may not expose /props */ }
  return null;
}

/**
 * Stop the running llama-server process gracefully.
 * Safe to call when already stopped.
 */
export async function stopServer(options = {}) {
  const { preserveState = false } = options;
  const proc = state.proc;
  state.proc = null;
  if (preserveState) {
    emit({ pid: null });
  } else {
    emit({ status: 'idle', model: null, pid: null, error: null, ctxTrain: null, ctxSize: null });
  }

  if (!proc) return;

  try {
    proc.kill('SIGTERM');
    await Promise.race([
      new Promise(r => proc.on('exit', r)),
      sleep(4000).then(() => { try { proc.kill('SIGKILL'); } catch {} }),
    ]);
  } catch { /* already dead */ }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Error classification ──────────────────────────────────────────────────────
// Turns raw llama-server stderr into a short, actionable message + a machine-
// readable errorCode the frontend can react to (e.g. offer re-download button).

function classifyError(logs, exitCode) {
  if (/corrupted or incomplete|data is not within the file bounds/i.test(logs)) {
    return 'CORRUPTED: The model file is incomplete or corrupted (the download was cut short). Delete it and re-download from Models.';
  }
  if (/error while loading shared libraries|cannot open shared object file/i.test(logs)) {
    return 'ENGINE_LIBS: The local llama.cpp engine is missing its shared libraries. Re-run asyncat install --local-engine.';
  }
  if (/failed to create command queue|ggml_metal_init|backend_metal|failed to initialize the context: failed to initialize +backend/i.test(logs)) {
    return 'BACKEND_INIT: llama.cpp backend initialization failed. If you are using GPU offload, set LLAMA_GPU_LAYERS=0 in den/.env. Otherwise try a newer llama.cpp or llama-cpp-python build.';
  }
  if (/out of memory|CUDA error.*out of memory|std::bad_alloc|cannot allocate memory|failed to allocate (buffer|tensor|memory)/i.test(logs)) {
    return 'OOM: Not enough VRAM/RAM to load this model. Try a smaller quantization (Q4_K_M) or a smaller model.';
  }
  if (/Failed to create llama_context/i.test(logs)) {
    return 'INIT: llama.cpp failed to initialize this model context. Try a different GGUF, a newer llama.cpp or llama-cpp-python build, or a smaller model.';
  }
  if (/address already in use/i.test(logs)) {
    return 'PORT: Port 8765 is already in use. Stop any other llama-server instance and try again.';
  }
  if (/no such file|cannot open/i.test(logs)) {
    return 'MISSING: Model file not found. It may have been moved or deleted. Re-download it from Models.';
  }
  if (/unsupported model|unknown model/i.test(logs)) {
    return 'UNSUPPORTED: This model format is not supported by your version of llama-server. Try updating llama.cpp.';
  }
  return `Server exited (code=${exitCode}). Check the logs for details.`;
}
