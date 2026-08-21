import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync, execSync, spawn, spawnSync } from 'child_process';
import { once } from 'events';
import { randomUUID } from 'crypto';
import { ENV_FILE, readEnv, setKey } from './env.js';
import { setConfigValue } from '../config/appConfig.js';
import { AUTO_DETECT, runtimeHome } from '../config/runtimeConfig.js';

// Persist a runtime path. These used to be written to a source-tree .env; they now
// live in the DB-backed app_config (hydrated into process.env at boot). We set
// process.env immediately so the running process picks it up, then persist to
// the DB, falling back to the active runtime .env only if the DB is unavailable.
export function persistRuntimeConfigValue(key, value) {
  process.env[key] = value;
  try {
    setConfigValue(key, value);
  } catch {
    setKey(ENV_FILE, key, value);
  }
}

export const LLAMA_RELEASES_API = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest';
export const LLAMA_RELEASES_LIST_API = 'https://api.github.com/repos/ggml-org/llama.cpp/releases';
export const LLAMA_RELEASES_URL = 'https://github.com/ggml-org/llama.cpp/releases';
export const MISSING_ENGINE_MESSAGE = 'Local engine missing. Install one in Settings → Runtime, set LLAMA_BINARY_PATH, or choose Ollama, LM Studio, or a cloud provider.';
export const MANAGED_ENGINE_METADATA_FILE = 'asyncat-engine.json';
export const MANAGED_RUNTIME_METADATA_FILE = 'asyncat-runtime.json';
export const LLAMA_ENGINE_PROFILES = ['cpu_safe', 'nvidia_gpu', 'apple_metal', 'amd_rocm', 'vulkan', 'intel_sycl'];

const isWin = process.platform === 'win32';

export function asyncatHome() {
  return runtimeHome();
}

export function managedEngineRootDir() {
  return path.join(asyncatHome(), 'llama.cpp');
}

export function managedEngineProfileSlug(profile = 'cpu_safe') {
  return String(profile || 'cpu_safe').replace(/_/g, '-');
}

export function managedEngineDir(profile = 'current') {
  if (!profile || profile === 'current') return path.join(managedEngineRootDir(), 'current');
  return path.join(managedEngineRootDir(), 'profiles', managedEngineProfileSlug(profile));
}

export function managedLlamaBinaryPath(profile = 'current') {
  return path.join(managedEngineDir(profile), isWin ? 'llama-server.exe' : 'llama-server');
}

export function managedEngineMetadataPath(root = managedEngineDir()) {
  return path.join(root, MANAGED_ENGINE_METADATA_FILE);
}

export function managedPythonDir() {
  return path.join(asyncatHome(), 'llama.cpp', 'python');
}

export function managedPythonBinaryPath() {
  if (isWin) return path.join(managedPythonDir(), 'Scripts', 'python.exe');
  return path.join(managedPythonDir(), 'bin', 'python');
}

function pathIsInside(candidate, root) {
  if (!candidate || !root) return false;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function realPathOrResolved(candidate) {
  try {
    return fs.realpathSync(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

function assertManagedTarget(target) {
  const home = path.resolve(asyncatHome());
  const resolved = path.resolve(target);
  if (resolved === home || !pathIsInside(resolved, home)) {
    throw new Error(`Refusing to modify a path outside Asyncat home: ${resolved}`);
  }
  return resolved;
}

function removeManagedEntry(target) {
  const resolved = assertManagedTarget(target);
  if (!fs.existsSync(resolved)) return false;
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink()) fs.unlinkSync(resolved);
  else if (stat.isDirectory()) fs.rmSync(resolved, { recursive: true });
  else fs.unlinkSync(resolved);
  return true;
}

function swapManagedDirectory(stagingDir, targetDir) {
  const staging = assertManagedTarget(stagingDir);
  const target = assertManagedTarget(targetDir);
  const backup = assertManagedTarget(`${target}.backup-${randomUUID()}`);
  let movedExisting = false;
  let preserveBackup = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      movedExisting = true;
    }
    fs.renameSync(staging, target);
  } catch (error) {
    if (fs.existsSync(target)) {
      try {
        removeManagedEntry(target);
      } catch (cleanupError) {
        preserveBackup = movedExisting;
        const recovery = movedExisting
          ? ` The previous runtime remains at ${backup}.`
          : '';
        throw new Error(`${error.message} The incomplete replacement could not be removed: ${cleanupError.message}.${recovery}`);
      }
    }
    if (movedExisting && fs.existsSync(backup)) {
      try {
        fs.renameSync(backup, target);
      } catch (restoreError) {
        preserveBackup = true;
        throw new Error(`${error.message} The previous runtime remains at ${backup} because rollback failed: ${restoreError.message}`);
      }
    }
    throw error;
  } finally {
    if (fs.existsSync(staging)) removeManagedEntry(staging);
  }
  if (!preserveBackup && fs.existsSync(backup)) {
    try {
      removeManagedEntry(backup);
    } catch (cleanupError) {
      // The verified replacement is already live. Keep the old backup if the OS
      // has it locked instead of turning a successful update into data loss.
      console.warn(`[runtime] Could not remove the previous runtime backup at ${backup}: ${cleanupError.message}`);
    }
  }
}

export function profileCapabilityHint(profile = 'cpu_safe') {
  if (profile === 'nvidia_gpu') return 'nvidia';
  if (profile === 'apple_metal') return 'apple';
  if (profile === 'amd_rocm') return 'amd';
  if (profile === 'vulkan') return 'vulkan';
  if (profile === 'intel_sycl') return 'intel';
  return 'cpu_safe';
}

export function readManagedEngineMetadata(root = managedEngineDir()) {
  const metadataPath = managedEngineMetadataPath(root);
  if (!fs.existsSync(metadataPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeManagedEngineMetadata(metadata, root = managedEngineDir()) {
  fs.writeFileSync(managedEngineMetadataPath(root), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

export function writeManagedPythonEngineMetadata(metadata) {
  writeManagedEngineMetadata(metadata, managedPythonDir());
}

export function listManagedEngineInstalls() {
  const roots = new Set();
  const profilesDir = path.join(managedEngineRootDir(), 'profiles');
  try {
    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.add(path.join(profilesDir, entry.name));
    }
  } catch {}

  const currentDir = managedEngineDir();
  try {
    if (fs.existsSync(currentDir)) roots.add(fs.realpathSync(currentDir));
  } catch {
    if (fs.existsSync(currentDir)) roots.add(currentDir);
  }

  return [...roots].map(root => {
    const binary = path.join(root, isWin ? 'llama-server.exe' : 'llama-server');
    const metadata = readManagedEngineMetadata(root);
    return {
      root,
      binary,
      metadata,
      profile: metadata?.profile || null,
      exists: fs.existsSync(binary),
    };
  }).filter(item => item.exists);
}

function pointCurrentManagedEngine(targetDir) {
  const currentDir = managedEngineDir();
  if (path.resolve(currentDir) === path.resolve(targetDir)) return;
  try {
    const stat = fs.lstatSync(currentDir);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      const metadata = readManagedEngineMetadata(currentDir);
      const legacyProfile = metadata?.profile;
      const legacyDir = legacyProfile ? managedEngineDir(legacyProfile) : null;
      if (legacyDir && path.resolve(legacyDir) !== path.resolve(targetDir) && !fs.existsSync(legacyDir)) {
        fs.mkdirSync(path.dirname(legacyDir), { recursive: true });
        fs.cpSync(currentDir, legacyDir, { recursive: true });
      }
    }
  } catch {}
  if (fs.existsSync(currentDir)) removeManagedEntry(currentDir);
  fs.mkdirSync(path.dirname(currentDir), { recursive: true });
  try {
    fs.symlinkSync(targetDir, currentDir, isWin ? 'junction' : 'dir');
  } catch {
    fs.cpSync(targetDir, currentDir, { recursive: true });
  }
}

export function removeManagedLlamaEngine(profile) {
  if (!LLAMA_ENGINE_PROFILES.includes(profile)) {
    throw new Error(`Unknown managed llama.cpp profile: ${profile}`);
  }
  const targetDir = assertManagedTarget(managedEngineDir(profile));
  const currentDir = assertManagedTarget(managedEngineDir());
  const configuredPath = String(process.env.LLAMA_BINARY_PATH || '').trim();
  const targetResolved = realPathOrResolved(targetDir);
  const selectedWasRemoved = configuredPath
    ? pathIsInside(realPathOrResolved(configuredPath), targetResolved)
    : false;

  let currentPointsToTarget = false;
  if (fs.existsSync(currentDir)) {
    currentPointsToTarget = realPathOrResolved(currentDir) === targetResolved
      || readManagedEngineMetadata(currentDir)?.profile === profile;
  }
  if (currentPointsToTarget) removeManagedEntry(currentDir);
  const removed = removeManagedEntry(targetDir);

  const fallback = listManagedEngineInstalls()
    .find(item => path.resolve(item.root) !== path.resolve(currentDir) && item.profile !== profile) || null;
  if (fallback && !fs.existsSync(currentDir)) pointCurrentManagedEngine(fallback.root);
  if (selectedWasRemoved) {
    persistRuntimeConfigValue('LLAMA_BINARY_PATH', fallback?.binary || AUTO_DETECT);
    if (!fallback) persistRuntimeConfigValue('LLAMA_GPU_LAYERS', '0');
  }

  return {
    runtime: 'binary',
    profile,
    removed,
    path: targetDir,
    fallback: fallback?.binary || null,
  };
}

export function removeManagedLlamaPython() {
  const targetDir = assertManagedTarget(managedPythonDir());
  const configuredPath = String(process.env.LLAMA_PYTHON_PATH || '').trim();
  const selectedWasRemoved = configuredPath
    ? pathIsInside(realPathOrResolved(configuredPath), realPathOrResolved(targetDir))
    : false;
  const removed = removeManagedEntry(targetDir);
  if (selectedWasRemoved) {
    persistRuntimeConfigValue('LLAMA_PYTHON_PATH', AUTO_DETECT);
    persistRuntimeConfigValue('LLAMA_GPU_LAYERS', '0');
  }
  return { runtime: 'python', removed, path: targetDir };
}

export function commandExists(cmd) {
  try {
    execSync(`${isWin ? 'where' : 'command -v'} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function expandWildcardPath(pattern) {
  if (!pattern.includes('*')) return [pattern];

  const parsed = path.parse(pattern);
  const parts = pattern.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let matches = [parsed.root || path.parse(process.cwd()).root];

  for (const part of parts) {
    if (!part.includes('*')) {
      matches = matches.map(base => path.join(base, part));
      continue;
    }
    const re = new RegExp(`^${part.split('*').map(escapeRegex).join('.*')}$`, isWin ? 'i' : '');
    const next = [];
    for (const base of matches) {
      try {
        for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
          if (re.test(entry.name)) next.push(path.join(base, entry.name));
        }
      } catch {}
    }
    matches = next;
  }
  return matches;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function knownLlamaPaths() {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return [
    managedLlamaBinaryPath(),
    managedLlamaBinaryPath('cpu_safe'),
    managedLlamaBinaryPath('apple_metal'),
    managedLlamaBinaryPath('nvidia_gpu'),
    managedLlamaBinaryPath('amd_rocm'),
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'llama-server.exe'),
    path.join(localAppData, 'Microsoft', 'WindowsApps', 'llama-server.exe'),
    path.join(localAppData, 'Microsoft', 'WinGet', 'Packages', '*', 'llama-server.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python*', 'Scripts', 'llama-server.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'llama.cpp', 'llama-server.exe'),
    path.join(localAppData, 'Programs', 'llama.cpp', 'llama-server.exe'),
    path.join(home, '.local', 'bin', 'llama-server.exe'),
    path.join(home, '.unsloth', 'llama.cpp', 'build', 'bin', isWin ? 'llama-server.exe' : 'llama-server'),
    path.join(home, '.unsloth', 'llama.cpp', isWin ? 'llama-server.exe' : 'llama-server'),
    path.join(home, '.local', 'bin', 'llama-server'),
    path.join(home, 'bin', 'llama-server'),
    '/usr/local/bin/llama-server',
    '/usr/bin/llama-server',
    '/usr/local/llama.cpp/bin/llama-server',
    '/opt/homebrew/bin/llama-server',
    '/usr/local/opt/llama.cpp/bin/llama-server',
  ];
}

export function verifyBinary(binary) {
  return verifyBinaryDetailed(binary).ok;
}

const DEFAULT_VERIFY_BINARY_TIMEOUT_MS = 30000;
const VERIFY_BINARY_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.ASYNCAT_LLAMA_VERIFY_TIMEOUT_MS || DEFAULT_VERIFY_BINARY_TIMEOUT_MS) || DEFAULT_VERIFY_BINARY_TIMEOUT_MS
);
const VERIFY_BINARY_OUTPUT_LIMIT = 4000;

function stringifyExecOutput(value) {
  if (value == null) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

function truncateVerifyOutput(value) {
  const text = stringifyExecOutput(value).trim();
  if (text.length <= VERIFY_BINARY_OUTPUT_LIMIT) return text;
  return `${text.slice(0, VERIFY_BINARY_OUTPUT_LIMIT)}\n... truncated ${text.length - VERIFY_BINARY_OUTPUT_LIMIT} chars`;
}

function runVerifyProbe(binary, arg) {
  const command = `${binary} ${arg}`;
  const startedAt = Date.now();
  const result = spawnSync(binary, [arg], {
    encoding: 'utf8',
    timeout: VERIFY_BINARY_TIMEOUT_MS,
    windowsHide: true,
  });
  const timedOut = result.error?.code === 'ETIMEDOUT' || /timed out/i.test(result.error?.message || '');
  return {
    command,
    ok: !result.error && result.status === 0,
    status: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    timedOut,
    durationMs: Date.now() - startedAt,
    timeoutMs: VERIFY_BINARY_TIMEOUT_MS,
    stdout: truncateVerifyOutput(result.stdout),
    stderr: truncateVerifyOutput(result.stderr),
    error: result.error?.message || null,
  };
}

function formatVerifyProbe(probe) {
  const lines = [
    `${probe.command}: ${probe.ok ? 'ok' : 'failed'}`,
    `exit=${probe.status ?? 'unknown'} signal=${probe.signal || 'none'} timedOut=${probe.timedOut ? 'yes' : 'no'} durationMs=${probe.durationMs ?? 'unknown'} timeoutMs=${probe.timeoutMs ?? 'unknown'}`,
  ];
  if (probe.stderr) lines.push(`stderr:\n${probe.stderr}`);
  if (probe.stdout) lines.push(`stdout:\n${probe.stdout}`);
  if (probe.error && !probe.stderr && !probe.stdout) lines.push(`error: ${probe.error}`);
  return lines.join('\n');
}

function formatVerifyDetail(probes) {
  return probes.map(formatVerifyProbe).join('\n\n');
}

export function verifyBinaryDetailed(binary) {
  const versionProbe = runVerifyProbe(binary, '--version');
  if (versionProbe.ok) {
    return {
      ok: true,
      acceptedProbe: '--version',
      probes: [versionProbe],
      detail: formatVerifyDetail([versionProbe]),
    };
  }

  const helpProbe = runVerifyProbe(binary, '--help');
  const probes = [versionProbe, helpProbe];
  return {
    ok: helpProbe.ok,
    acceptedProbe: helpProbe.ok ? '--help' : null,
    probes,
    detail: formatVerifyDetail(probes),
  };
}

function verifyBinaryError(binary) {
  return verifyBinaryDetailed(binary).detail || 'unknown verification failure';
}

export function findExistingLlamaServer() {
  const denEnv = readEnv(ENV_FILE);
  const envPath = (process.env.LLAMA_BINARY_PATH || denEnv.LLAMA_BINARY_PATH || '').trim();
  if (envPath && fs.existsSync(envPath)) {
    return { found: true, binary: envPath, source: 'LLAMA_BINARY_PATH' };
  }

  for (const pattern of knownLlamaPaths()) {
    for (const candidate of expandWildcardPath(pattern)) {
      if (fs.existsSync(candidate)) {
        return {
          found: true,
          binary: candidate,
          source: candidate === managedLlamaBinaryPath() ? 'Asyncat managed llama.cpp' : 'auto-detected',
        };
      }
    }
  }

  const pathNames = isWin
    ? ['llama-server.exe', 'llama-server', 'llama-cpp-server.exe', 'llama-cpp-server']
    : ['llama-server', 'llama-cpp-server'];
  for (const name of pathNames) {
    try {
      const out = execSync(`${isWin ? 'where' : 'command -v'} ${name}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const binary = out.trim().split(/\r?\n/)[0];
      if (binary) return { found: true, binary, source: 'PATH' };
    } catch {}
  }

  const configuredPython = (process.env.LLAMA_PYTHON_PATH || denEnv.LLAMA_PYTHON_PATH || '').trim();
  if (configuredPython && fs.existsSync(configuredPython) && pythonHasLlamaServer(configuredPython)) {
    return { found: true, binary: configuredPython, source: 'LLAMA_PYTHON_PATH', isPython: true };
  }

  const managedPython = managedPythonBinaryPath();
  if (fs.existsSync(managedPython) && pythonHasLlamaServer(managedPython)) {
    return { found: true, binary: managedPython, source: 'Asyncat Python venv', isPython: true };
  }

  const pythonCommands = isWin ? ['python', 'python3', 'py'] : ['python3', 'python'];
  for (const cmd of pythonCommands) {
    if (pythonHasLlamaServer(cmd)) {
      return { found: true, binary: cmd, source: 'existing llama-cpp-python', isPython: true };
    }
  }

  return { found: false, searched: [...knownLlamaPaths(), ...pathNames, configuredPython, managedPython, ...pythonCommands].filter(Boolean) };
}

function pythonHasLlamaServer(pythonCmd) {
  try {
    execFileSync(pythonCmd, ['-c', 'from llama_cpp.server.__main__ import main'], { stdio: 'ignore', timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

// Best-effort Intel GPU probe (Arc / Iris Xe / UHD). Linux uses lspci; Windows
// uses wmic when present. Returns null on macOS and when nothing is found, so it
// never overrides a discrete NVIDIA/AMD GPU (those are checked first).
function detectIntelGpu() {
  try {
    if (process.platform === 'linux') {
      const out = execSync('lspci', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
      const line = out.split('\n').find(l => /vga|3d|display/i.test(l) && /intel/i.test(l));
      if (line) {
        const name = /(arc|iris|xe|uhd)[^\]]*/i.exec(line)?.[0]?.trim();
        return { vendor: 'Intel', name: name || 'Intel GPU', vramGb: null };
      }
    } else if (isWin) {
      const out = execSync('wmic path win32_VideoController get name', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 });
      const line = out.split('\n').map(l => l.trim()).find(l => /intel/i.test(l));
      if (line) return { vendor: 'Intel', name: line, vramGb: null };
    }
  } catch {}
  return null;
}

export function detectGpu() {
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 },
    ).trim();
    if (out) {
      const [name, memMb] = out.split(/\r?\n/)[0].split(',').map(s => s.trim());
      return {
        vendor: 'NVIDIA',
        name,
        vramGb: Number.isFinite(Number(memMb)) ? +(Number(memMb) / 1024).toFixed(1) : null,
      };
    }
  } catch {}

  try {
    execSync('rocm-smi --showuse', { stdio: 'ignore', timeout: 3000 });
    return { vendor: 'AMD', name: 'AMD GPU with ROCm detected', vramGb: null };
  } catch {}

  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return { vendor: 'Apple', name: 'Apple Silicon / Metal', vramGb: null };
  }

  const intel = detectIntelGpu();
  if (intel) return intel;

  return null;
}

export function gpuAdvice(gpu = detectGpu()) {
  if (!gpu) return null;
  if (gpu.vendor === 'NVIDIA') {
    const vram = gpu.vramGb ? ` (${gpu.vramGb} GB VRAM)` : '';
    return `NVIDIA GPU detected: ${gpu.name}${vram}. Choose option [3] to build a CUDA runtime for full GPU acceleration.`;
  }
  if (gpu.vendor === 'Apple') {
    return 'Apple Silicon detected. Choose option [3] to build a Metal runtime for GPU acceleration.';
  }
  if (gpu.vendor === 'AMD') {
    return 'AMD GPU detected. Choose option [3] to build a ROCm runtime (requires ROCm drivers installed).';
  }
  if (gpu.vendor === 'Intel') {
    return 'Intel GPU detected. Install the Vulkan build for cross-vendor GPU acceleration, or build a SYCL runtime with the oneAPI toolkit.';
  }
  return null;
}

function githubApiHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'asyncat-installer',
  };
}

function formatByteSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(unit === 0 ? 0 : 1) : value.toFixed(2)} ${units[unit]}`;
}

function assetTagsFromName(name = '') {
  const lower = String(name).toLowerCase();
  const tags = [];
  if (/cuda|cublas/.test(lower)) tags.push('cuda');
  if (/rocm|hip/.test(lower)) tags.push('rocm');
  if (/metal/.test(lower)) tags.push('metal');
  if (/cpu/.test(lower)) tags.push('cpu');
  if (/vulkan/.test(lower)) tags.push('vulkan');
  if (/opencl/.test(lower)) tags.push('opencl');
  if (/sycl/.test(lower)) tags.push('sycl');
  if (/openvino/.test(lower)) tags.push('openvino');
  return tags;
}

function inferProfileFromAssetName(name = '', fallbackProfile = 'cpu_safe', platform = process.platform) {
  const tags = assetTagsFromName(name);
  if (tags.includes('cuda')) return 'nvidia_gpu';
  if (tags.includes('rocm')) return 'amd_rocm';
  if (tags.includes('metal')) return 'apple_metal';
  if (tags.includes('vulkan')) return 'vulkan';
  if (tags.includes('sycl') || tags.includes('openvino')) return 'intel_sycl';
  if (platform === 'darwin' && fallbackProfile === 'apple_metal') return 'apple_metal';
  return fallbackProfile;
}

function scoreLlamaReleaseAsset(asset, platform = process.platform, arch = process.arch, profile = 'cpu_safe') {
  const name = String(asset.name || '').toLowerCase();
  if (!asset.browser_download_url) return null;
  if (!/\.(zip|tar\.gz|tgz)$/.test(name)) return null;
  if (/sha256|checksums?|source|cmake|dev|devel|android|ios/.test(name)) return null;

  let score = 0;
  if (platform === 'win32') {
    if (!/(win|windows)/.test(name)) return null;
    score += 40;
  } else if (platform === 'darwin') {
    if (!/(macos|darwin|osx)/.test(name)) return null;
    score += 40;
  } else if (platform === 'linux') {
    if (!/(linux|ubuntu)/.test(name)) return null;
    score += 40;
  }

  if (arch === 'x64') {
    if (/(x64|x86_64|amd64)/.test(name)) score += 25;
    else if (/(arm64|aarch64)/.test(name)) return null;
  } else if (arch === 'arm64') {
    if (/(arm64|aarch64)/.test(name)) score += 25;
    else if (/(x64|x86_64|amd64)/.test(name)) return null;
  }

  if (/server/.test(name)) score += 4;
  if (/bin|binary/.test(name)) score += 4;
  if (/noavx/.test(name)) score -= 2;
  if (/avx2/.test(name)) score += 1;

  const hasCuda = /cuda|cublas/.test(name);
  const hasRocm = /rocm|hip/.test(name);
  const hasMetal = /metal/.test(name);
  const hasOtherGpu = /openvino|vulkan|kompute|sycl|opencl/.test(name);
  const hasAnyGpuTag = hasCuda || hasRocm || hasMetal || hasOtherGpu;

  if (profile === 'cpu_safe') {
    if (/cpu/.test(name)) score += 30;
    if (hasAnyGpuTag) score -= 100;
    return score;
  }

  if (profile === 'nvidia_gpu') {
    if (!hasCuda) return null;
    score += 40;
    if (/cu12|cuda12|cublas/.test(name)) score += 10;
    return score;
  }

  if (profile === 'amd_rocm') {
    if (!hasRocm) return null;
    score += 40;
    return score;
  }

  if (profile === 'apple_metal') {
    if (platform !== 'darwin') return null;
    if (hasMetal) score += 40;
    else if (!hasCuda && !hasRocm && !hasOtherGpu) score += 18;
    else return null;
    return score;
  }

  if (profile === 'vulkan') {
    // Cross-vendor GPU build: Intel Arc, AMD without ROCm, consumer NVIDIA,
    // Windows-on-ARM. Prebuilt assets exist for Windows and Linux only.
    if (!/vulkan/.test(name)) return null;
    score += 40;
    return score;
  }

  if (profile === 'intel_sycl') {
    // Intel Arc / Core Ultra iGPU. Prebuilt OpenVINO assets exist for Linux x64;
    // SYCL elsewhere comes from the Python compile path.
    if (!/sycl|openvino/.test(name)) return null;
    score += 40;
    return score;
  }

  return score;
}

export function rankLlamaReleaseAssets(assets, platform = process.platform, arch = process.arch, profile = 'cpu_safe') {
  return (assets || [])
    .map(asset => ({ asset, score: scoreLlamaReleaseAsset(asset, platform, arch, profile) }))
    .filter(item => item.score !== null)
    .sort((a, b) => b.score - a.score)
    .map(item => item.asset);
}

export function chooseLlamaReleaseAsset(assets, platform = process.platform, arch = process.arch, profile = 'cpu_safe') {
  return rankLlamaReleaseAssets(assets, platform, arch, profile)[0] || null;
}

export function buildReleaseCatalog(releases, platform = process.platform, arch = process.arch) {
  return (releases || []).map(release => {
    const assets = (release.assets || [])
      .filter(asset => /\.(zip|tar\.gz|tgz)$/i.test(String(asset.name || '')))
      .filter(asset => !/sha256|checksums?|source|cmake|dev|devel|android|ios/i.test(String(asset.name || '').toLowerCase()))
      .map(asset => {
        const profileScores = Object.fromEntries(
          LLAMA_ENGINE_PROFILES.map(profile => [profile, scoreLlamaReleaseAsset(asset, platform, arch, profile)])
        );
        const supportedProfiles = Object.entries(profileScores)
          .filter(([, score]) => score !== null)
          .sort((a, b) => b[1] - a[1])
          .map(([profile]) => profile);
        const suggestedProfile = inferProfileFromAssetName(asset.name, supportedProfiles[0] || 'cpu_safe', platform);
        return {
          name: asset.name,
          sizeBytes: asset.size || 0,
          sizeFormatted: formatByteSize(asset.size || 0),
          updatedAt: asset.updated_at || null,
          downloadUrl: asset.browser_download_url,
          tags: assetTagsFromName(asset.name),
          profileScores,
          supportedProfiles,
          suggestedProfile,
          compatible: supportedProfiles.length > 0,
        };
      })
      .sort((a, b) => {
        const aBest = Math.max(...Object.values(a.profileScores).filter(score => score !== null), -Infinity);
        const bBest = Math.max(...Object.values(b.profileScores).filter(score => score !== null), -Infinity);
        return bBest - aBest || a.name.localeCompare(b.name);
      });

    return {
      tagName: release.tag_name || release.name || 'latest',
      name: release.name || release.tag_name || 'latest',
      publishedAt: release.published_at || null,
      prerelease: Boolean(release.prerelease),
      draft: Boolean(release.draft),
      compatibleAssetCount: assets.filter(asset => asset.compatible).length,
      assets,
    };
  });
}

// Windows CUDA llama.cpp / stable-diffusion.cpp builds ship without the CUDA
// runtime DLLs; the release publishes a companion `cudart-*.zip` that must be
// extracted alongside the binary or it fails to launch with a missing-DLL error.
// Returns true when a companion was merged into targetDir.
async function installCudartCompanion(release, mainAssetName, targetDir, onProgress = null) {
  if (!isWin) return false;
  const lower = String(mainAssetName || '').toLowerCase();
  if (!/cu(da)?\d|cublas/.test(lower)) return false;

  const major = lower.match(/cu(?:da)?[ _-]?(\d+)/)?.[1] || null;
  const wantsX64 = /(x64|x86_64|amd64)/.test(lower);
  const companion = (release.assets || []).find(asset => {
    const n = String(asset.name || '').toLowerCase();
    if (!n.startsWith('cudart') || !asset.browser_download_url) return false;
    if (major && !new RegExp(`cu(?:da)?[ _-]?${major}`).test(n)) return false;
    if (wantsX64 && !/(x64|x86_64|amd64)/.test(n)) return false;
    return true;
  });
  if (!companion) return false;

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-cudart-'));
  const archivePath = path.join(tmpRoot, companion.name);
  const extractDir = path.join(tmpRoot, 'extract');
  try {
    onProgress?.({ phase: 'installing', message: `Downloading CUDA runtime (${companion.name})`, percent: 90 });
    await downloadFile(companion.browser_download_url, archivePath);
    extractArchive(archivePath, extractDir);
    // Merge the runtime DLLs into the engine dir without clearing it.
    fs.cpSync(extractDir, targetDir, { recursive: true });
    return true;
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

async function installManagedAsset(asset, release, profile = 'cpu_safe', onProgress = null) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-llama-'));
  const archivePath = path.join(tmpRoot, asset.name);
  const extractDir = path.join(tmpRoot, 'extract');
  const targetDir = managedEngineDir(profile);
  const stagingDir = assertManagedTarget(path.join(
    path.dirname(targetDir),
    `.${path.basename(targetDir)}.install-${randomUUID()}`,
  ));
  try {
    onProgress?.({
      phase: 'downloading',
      message: `Downloading ${asset.name}`,
      percent: 2,
      assetName: asset.name,
      releaseTag: release.tag_name || release.name || 'latest',
    });
    await downloadFile(asset.browser_download_url, archivePath, progress => {
      onProgress?.({
        phase: 'downloading',
        message: `Downloading ${asset.name}`,
        percent: Math.max(2, Math.min(72, progress.percent ?? 0)),
        downloadedBytes: progress.downloadedBytes,
        totalBytes: progress.totalBytes,
        assetName: asset.name,
        releaseTag: release.tag_name || release.name || 'latest',
      });
    });
    onProgress?.({
      phase: 'extracting',
      message: `Extracting ${asset.name}`,
      percent: 78,
      assetName: asset.name,
      releaseTag: release.tag_name || release.name || 'latest',
    });
    extractArchive(archivePath, extractDir);
    const serverBinary = findLlamaServerBinary(extractDir);
    if (!serverBinary) throw new Error(`Archive did not contain ${isWin ? 'llama-server.exe' : 'llama-server'}.`);

    onProgress?.({
      phase: 'installing',
      message: 'Installing managed engine files',
      percent: 86,
      assetName: asset.name,
      releaseTag: release.tag_name || release.name || 'latest',
    });
    fs.mkdirSync(path.dirname(stagingDir), { recursive: true });
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.cpSync(extractDir, stagingDir, { recursive: true });
    ensureLinuxSonameLinks(stagingDir);
    ensureDarwinDylibLinks(stagingDir);
    // Windows CUDA builds need the cudart companion DLLs before they can run
    // (the verification step below launches the binary).
    await installCudartCompanion(release, asset.name, stagingDir, onProgress);

    const stagedInstalled = path.join(stagingDir, isWin ? 'llama-server.exe' : 'llama-server');
    let copiedServer = findLlamaServerBinary(stagingDir);
    if (!copiedServer) {
      throw new Error(`Archive did not stage ${isWin ? 'llama-server.exe' : 'llama-server'}.`);
    }

    if (isWin && path.resolve(copiedServer) !== path.resolve(stagedInstalled)) {
      // Some Windows archives wrap the executable and its DLLs in a bin folder.
      // Flatten that folder so the stable managed path remains predictable.
      for (const entry of fs.readdirSync(path.dirname(copiedServer), { withFileTypes: true })) {
        const source = path.join(path.dirname(copiedServer), entry.name);
        const destination = path.join(stagingDir, entry.name);
        if (path.resolve(source) === path.resolve(destination)) continue;
        fs.cpSync(source, destination, { recursive: entry.isDirectory(), force: true });
      }
      copiedServer = stagedInstalled;
    } else if (!isWin) {
      let realServer = copiedServer;
      if (path.resolve(copiedServer) === path.resolve(stagedInstalled)) {
        realServer = path.join(stagingDir, 'llama-server.real');
        fs.renameSync(copiedServer, realServer);
      }
      installUnixLauncher(stagedInstalled, realServer, stagingDir);
    }

    if (!fs.existsSync(stagedInstalled)) {
      throw new Error(`Archive did not stage ${isWin ? 'llama-server.exe' : 'llama-server'} at its expected path.`);
    }
    if (!isWin) fs.chmodSync(stagedInstalled, 0o755);
    onProgress?.({
      phase: 'verifying',
      message: 'Verifying llama-server binary',
      percent: 93,
      assetName: asset.name,
      releaseTag: release.tag_name || release.name || 'latest',
    });
    const verification = verifyBinaryDetailed(stagedInstalled);
    if (!verification.ok) {
      const detail = verification.detail || verifyBinaryError(stagedInstalled);
      const err = new Error(`Downloaded ${stagedInstalled}, but llama-server verification failed:\n${detail}`);
      err.diagnostics = {
        type: 'llama-server-verification',
        binary: stagedInstalled,
        asset: asset.name,
        releaseTag: release.tag_name || release.name || 'latest',
        profile,
        verification,
      };
      throw err;
    }
    writeManagedEngineMetadata({
      profile,
      capabilityHint: profileCapabilityHint(profile),
      asset: asset.name,
      version: release.tag_name || release.name || 'latest',
      installedAt: new Date().toISOString(),
    }, stagingDir);
    swapManagedDirectory(stagingDir, targetDir);
    const installed = managedLlamaBinaryPath(profile);
    pointCurrentManagedEngine(targetDir);
    persistRuntimeConfigValue('LLAMA_BINARY_PATH', installed);
    onProgress?.({
      phase: 'complete',
      message: 'Managed engine installed successfully',
      percent: 100,
      assetName: asset.name,
      releaseTag: release.tag_name || release.name || 'latest',
    });
    return { binary: installed, asset: asset.name, version: release.tag_name || release.name || 'latest', profile };
  } finally {
    if (fs.existsSync(stagingDir)) removeManagedEntry(stagingDir);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

export async function fetchLatestLlamaRelease() {
  const res = await fetch(LLAMA_RELEASES_API, {
    headers: githubApiHeaders(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`GitHub releases API returned ${res.status}`);
  return res.json();
}

export async function fetchLlamaReleases(limit = 12) {
  const perPage = Math.max(1, Math.min(20, Number(limit) || 12));
  const res = await fetch(`${LLAMA_RELEASES_LIST_API}?per_page=${perPage}`, {
    headers: githubApiHeaders(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`GitHub releases API returned ${res.status}`);
  return res.json();
}

export async function fetchLlamaReleaseByTag(tag) {
  const encodedTag = encodeURIComponent(tag);
  const res = await fetch(`${LLAMA_RELEASES_LIST_API}/tags/${encodedTag}`, {
    headers: githubApiHeaders(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`GitHub release ${tag} returned ${res.status}`);
  return res.json();
}

export async function downloadFile(url, destination, onProgress = null) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'asyncat-installer' },
    signal: AbortSignal.timeout(900000),
  });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  if (!res.body) throw new Error('Download failed: empty response body');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const totalBytes = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const stream = fs.createWriteStream(destination);
  let downloadedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      downloadedBytes += chunk.length;
      if (!stream.write(chunk)) {
        await once(stream, 'drain');
      }
      onProgress?.({
        downloadedBytes,
        totalBytes,
        percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : null,
      });
    }
    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.end(resolve);
    });
  } catch (err) {
    stream.destroy();
    throw err;
  }
}

function extractArchive(archivePath, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  const lower = archivePath.toLowerCase();
  if (lower.endsWith('.zip')) {
    if (isWin) {
      execFileSync('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
        archivePath,
        destination,
      ], { stdio: 'ignore', timeout: 120000 });
    } else if (commandExists('unzip')) {
      execFileSync('unzip', ['-q', archivePath, '-d', destination], { stdio: 'ignore', timeout: 120000 });
    } else {
      throw new Error('unzip is required to extract the llama.cpp release archive.');
    }
    return;
  }

  execFileSync('tar', ['-xf', archivePath, '-C', destination], { stdio: 'ignore', timeout: 120000 });
}

function findLlamaServerBinary(dir) {
  const expected = isWin ? 'llama-server.exe' : 'llama-server';
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name === expected || (!isWin && entry.name === 'llama-cpp-server')) {
        return full;
      }
    }
  }
  return null;
}

function findLibraryDirs(root) {
  const dirs = new Set([root, path.join(root, 'bin'), path.join(root, 'lib')]);
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/\.so(\.|$)|\.dylib$/.test(entry.name)) {
        dirs.add(current);
      }
    }
  }
  return [...dirs].filter(dir => fs.existsSync(dir));
}

function ensureLinuxSonameLinks(root) {
  if (isWin || process.platform === 'darwin') return;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      const match = entry.name.match(/^(lib.+\.so)\.(\d+)\.\d+(?:\.\d+)*$/);
      if (!match) continue;
      ensureRelativeSymlink(path.join(current, match[1]), entry.name);
      ensureRelativeSymlink(path.join(current, `${match[1]}.${match[2]}`), entry.name);
    }
  }
}

function ensureDarwinDylibLinks(root) {
  if (isWin || process.platform !== 'darwin') return;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      const match = entry.name.match(/^(lib.+?)\.(\d+)\.\d+(?:\.\d+)*\.dylib$/);
      if (!match) continue;
      ensureRelativeSymlink(path.join(current, `${match[1]}.dylib`), entry.name);
      ensureRelativeSymlink(path.join(current, `${match[1]}.${match[2]}.dylib`), entry.name);
    }
  }
}

function ensureRelativeSymlink(linkPath, targetName) {
  const desiredTarget = targetName.split(path.sep).join('/');

  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return;

    const currentTarget = fs.readlinkSync(linkPath);
    const resolvedCurrent = path.resolve(path.dirname(linkPath), currentTarget);
    const resolvedDesired = path.resolve(path.dirname(linkPath), desiredTarget);
    if (resolvedCurrent === resolvedDesired) return;

    fs.unlinkSync(linkPath);
  } catch {}

  try {
    fs.symlinkSync(desiredTarget, linkPath);
  } catch {}
}

function installUnixLauncher(targetPath, realBinary, root = path.dirname(targetPath)) {
  const rel = path.relative(path.dirname(targetPath), realBinary).split(path.sep).join('/');
  const libExports = findLibraryDirs(root)
    .map(dir => `$DIR/${path.relative(root, dir).split(path.sep).join('/')}`)
    .map(value => value.replace(/\/$/, ''))
    .join(':');
  const script = [
    '#!/usr/bin/env sh',
    'set -eu',
    'DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    `LD_LIBRARY_PATH="${libExports}:\${LD_LIBRARY_PATH:-}"`,
    `DYLD_LIBRARY_PATH="${libExports}:\${DYLD_LIBRARY_PATH:-}"`,
    'export LD_LIBRARY_PATH',
    'export DYLD_LIBRARY_PATH',
    `exec "$DIR/${rel}" "$@"`,
    '',
  ].join('\n');
  fs.writeFileSync(targetPath, script, 'utf8');
  fs.chmodSync(targetPath, 0o755);
}

export async function installManagedLlamaServer(input = 'cpu_safe') {
  const options = typeof input === 'string'
    ? { profile: input }
    : { ...(input || {}) };
  const requestedProfile = options.profile || 'cpu_safe';
  const release = options.releaseTag
    ? await fetchLlamaReleaseByTag(options.releaseTag)
    : await fetchLatestLlamaRelease();

  let effectiveProfile = requestedProfile;
  let candidates = [];

  if (options.assetName) {
    const selectedAsset = (release.assets || []).find(asset => asset.name === options.assetName);
    if (!selectedAsset) {
      throw new Error(`Selected asset not found in release ${release.tag_name || release.name || 'latest'}: ${options.assetName}`);
    }
    effectiveProfile = inferProfileFromAssetName(selectedAsset.name, requestedProfile);
    const score = scoreLlamaReleaseAsset(selectedAsset, process.platform, process.arch, effectiveProfile);
    if (score === null) {
      throw new Error(`Selected asset ${selectedAsset.name} does not match ${process.platform}-${process.arch} for profile ${effectiveProfile}.`);
    }
    candidates = [selectedAsset];
  } else {
    candidates = rankLlamaReleaseAssets(release.assets || [], process.platform, process.arch, requestedProfile).slice(0, 5);
  }

  if (candidates.length === 0) {
    const compileHint = requestedProfile !== 'cpu_safe'
      ? ` No prebuilt ${requestedProfile} binary is published for ${process.platform}-${process.arch} (this is expected for CUDA on Linux) — use "Build GPU runtime" to compile from source instead.`
      : '';
    throw new Error(`No llama.cpp release asset matched ${process.platform}-${process.arch} for profile ${requestedProfile}.${compileHint} Or download manually from ${LLAMA_RELEASES_URL} and set LLAMA_BINARY_PATH.`);
  }

  const failures = [];
  const diagnostics = [];
  for (const asset of candidates) {
    const assetProfile = inferProfileFromAssetName(asset.name, effectiveProfile);
    try {
      return await installManagedAsset(asset, release, assetProfile, options.onProgress);
    } catch (e) {
      failures.push(`${asset.name}: ${e.message}`);
      diagnostics.push({
        asset: asset.name,
        message: e.message,
        diagnostics: e.diagnostics || null,
      });
    }
  }

  const err = new Error(`Tried ${candidates.length} llama.cpp release asset(s), but none verified:\n${failures.join('\n')}\nManual releases: ${LLAMA_RELEASES_URL}`);
  err.diagnostics = {
    type: 'llama-managed-install',
    releaseTag: release.tag_name || release.name || 'latest',
    profile: requestedProfile,
    failures: diagnostics,
  };
  throw err;
}

// ─── Generic managed runtime installer ────────────────────────────────────────
// Whisper and stable-diffusion.cpp use matching prebuilt release assets. Piper
// and MLX install their current Python packages into Asyncat-owned isolated
// environments. Every path is persisted through the same DB-backed config.

export const MANAGED_RUNTIME_SPECS = {
  piper: {
    id: 'piper',
    label: 'Piper (Text-to-Speech)',
    installer: 'python',
    packageName: 'piper-tts',
    importName: 'piper',
    projectUrl: 'https://github.com/OHF-Voice/piper1-gpl',
    license: 'GPL-3.0-or-later',
    dir: 'piper',
    binaryNames: ['piper'],
    envKey: 'PIPER_BINARY_PATH',
  },
  whisper: {
    id: 'whisper',
    label: 'Whisper (Speech-to-Text)',
    repo: 'ggml-org/whisper.cpp',
    dir: 'whisper.cpp',
    binaryNames: ['whisper-server', 'server', 'main'],
    envKey: 'WHISPER_BINARY_PATH',
  },
  sd: {
    id: 'sd',
    label: 'Image (stable-diffusion.cpp)',
    repo: 'leejet/stable-diffusion.cpp',
    dir: 'stable-diffusion.cpp',
    binaryNames: ['sd', 'sd-cli', 'stable-diffusion'],
    envKey: 'IMAGEGEN_BINARY_PATH',
    // stable-diffusion.cpp publishes CUDA / ROCm / Vulkan / Metal builds; pick the
    // one matching the detected GPU so image generation is hardware-accelerated.
    autoGpu: true,
  },
  mlx: {
    id: 'mlx',
    label: 'MLX LM',
    installer: 'python',
    packageName: 'mlx-lm',
    importName: 'mlx_lm',
    projectUrl: 'https://github.com/ml-explore/mlx-lm',
    dir: 'mlx',
    binaryNames: [],
    envKey: 'MLX_PYTHON_PATH',
    platforms: ['darwin-arm64', 'linux-x64', 'linux-arm64'],
  },
};

function managedRuntimeRoot(spec) {
  return path.join(asyncatHome(), spec.dir);
}

function runtimePlatformSupport(spec) {
  if (!spec.platforms?.length) return { supported: true, reason: null };
  const current = `${process.platform}-${process.arch}`;
  if (spec.platforms.includes(current)) return { supported: true, reason: null };
  return {
    supported: false,
    reason: spec.id === 'mlx'
      ? 'MLX LM is supported on Apple Silicon and Linux (CPU or NVIDIA CUDA).'
      : `${spec.label} is not supported on ${current}.`,
  };
}

function managedRuntimeMetadataPath(spec) {
  return path.join(managedRuntimeRoot(spec), MANAGED_RUNTIME_METADATA_FILE);
}

function readManagedRuntimeMetadata(spec) {
  try {
    return JSON.parse(fs.readFileSync(managedRuntimeMetadataPath(spec), 'utf8'));
  } catch {
    return null;
  }
}

function writeManagedRuntimeMetadata(spec, metadata, root = managedRuntimeRoot(spec)) {
  fs.writeFileSync(
    path.join(root, MANAGED_RUNTIME_METADATA_FILE),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
}

function managedRuntimeBinary(spec) {
  const root = managedRuntimeRoot(spec);
  if (spec.installer === 'python') {
    const venvDir = managedRuntimePythonDir(spec);
    return spec.id === 'piper' ? pythonConsoleScript(venvDir, 'piper') : pythonInVenv(venvDir);
  }
  return findBinaryByNames(root, spec.binaryNames);
}

export function listManagedRuntimes() {
  return Object.values(MANAGED_RUNTIME_SPECS).map(spec => {
    const support = runtimePlatformSupport(spec);
    const root = managedRuntimeRoot(spec);
    const binary = managedRuntimeBinary(spec);
    const metadata = readManagedRuntimeMetadata(spec);
    const configuredPath = String(process.env[spec.envKey] || '').trim();
    const configuredExists = Boolean(configuredPath && configuredPath !== AUTO_DETECT && fs.existsSync(configuredPath));
    const managedInstalled = Boolean(binary && fs.existsSync(binary));
    return {
      id: spec.id,
      label: spec.label,
      envKey: spec.envKey,
      license: spec.license || null,
      projectUrl: spec.projectUrl || null,
      platforms: spec.platforms || null,
      supported: support.supported,
      unsupportedReason: support.reason,
      managedInstalled,
      detected: managedInstalled || configuredExists,
      source: managedInstalled ? 'managed' : (configuredExists ? 'external' : 'missing'),
      managedRoot: root,
      managedPath: managedInstalled ? binary : null,
      configuredPath: configuredExists ? configuredPath : null,
      version: metadata?.version || null,
      installedAt: metadata?.installedAt || null,
      capability: metadata?.capability || null,
      isolation: spec.installer === 'python' ? 'python-venv' : 'managed-binary',
    };
  });
}

export function removeManagedRuntime(runtimeId) {
  const spec = MANAGED_RUNTIME_SPECS[runtimeId];
  if (!spec) throw new Error(`Unknown runtime: ${runtimeId}`);
  const targetDir = assertManagedTarget(managedRuntimeRoot(spec));
  const configuredPath = String(process.env[spec.envKey] || '').trim();
  const configuredWasManaged = configuredPath
    ? pathIsInside(realPathOrResolved(configuredPath), realPathOrResolved(targetDir))
    : false;
  const removed = removeManagedEntry(targetDir);
  if (configuredWasManaged) persistRuntimeConfigValue(spec.envKey, AUTO_DETECT);
  return { runtime: runtimeId, removed, path: targetDir };
}

// GPU tag patterns for the generic runtimes (Whisper / sd.cpp).
const RUNTIME_CAPABILITY_TAGS = {
  nvidia: /cuda|cublas/,
  amd:    /rocm|hip/,
  vulkan: /vulkan/,
  intel:  /sycl|openvino/,
};

// Map a detected GPU to the runtime build variant to download. Intel/unknown
// GPUs use Vulkan, the broadest prebuilt option across these engines.
export function runtimeCapabilityForGpu(gpu) {
  if (!gpu) return 'cpu_safe';
  if (gpu.vendor === 'NVIDIA') return 'nvidia';
  if (gpu.vendor === 'AMD') return 'amd';
  if (gpu.vendor === 'Apple') return 'apple';
  return 'vulkan';
}

function runtimeCapabilityLabel(capability) {
  return { nvidia: 'CUDA', amd: 'ROCm', vulkan: 'Vulkan', intel: 'SYCL', apple: 'Metal', cpu_safe: 'CPU' }[capability] || 'CPU';
}

function assetHasAnyGpuTag(lower) {
  return /cuda|cublas|hip|rocm|vulkan|sycl|openvino|opencl|kompute/.test(lower);
}

// Score a release asset for the current platform/arch and target capability.
// Returns null if it can't run here or doesn't match the requested variant.
// Generic across the runtimes (token-based, tolerant of naming).
function scoreRuntimeAsset(name, platform = process.platform, arch = process.arch, capability = 'cpu_safe', runtimeId = '') {
  const lower = String(name || '').toLowerCase();
  if (!/\.(zip|tar\.gz|tgz)$/.test(lower)) return null;
  if (/sha256|checksums?|\.sig$|source|\.asc$|debug/.test(lower)) return null;
  if (/^cudart/.test(lower)) return null; // CUDA runtime companion, installed separately

  let score = 0;
  if (platform === 'win32') {
    // whisper.cpp names its current 64-bit Windows archive
    // whisper-bin-x64.zip, without a separate Windows token.
    const whisperX64Alias = runtimeId === 'whisper' && /(?:^|[-_])x64(?:[-_.]|$)/.test(lower);
    if (!/(win|windows)/.test(lower) && !whisperX64Alias) return null;
    score += 40;
  } else if (platform === 'darwin') {
    if (!/(macos|darwin|osx|apple)/.test(lower)) return null;
    score += 40;
  } else if (platform === 'linux') {
    if (!/linux/.test(lower)) return null;
    score += 40;
  }

  if (arch === 'x64') {
    if (/(?:^|[-_])(win32|x86|i[3-6]86)(?:[-_.]|$)/.test(lower)) return null;
    if (/(x64|x86_64|amd64)/.test(lower)) score += 25;
    else if (/(arm64|aarch64)/.test(lower)) return null;
  } else if (arch === 'arm64') {
    if (/(?:^|[-_])(win32|x86|i[3-6]86)(?:[-_.]|$)/.test(lower)) return null;
    if (/(arm64|aarch64)/.test(lower)) score += 25;
    else if (/(x64|x86_64|amd64)/.test(lower)) return null;
  }

  if (capability === 'cpu_safe') {
    if (assetHasAnyGpuTag(lower)) return null;     // strictly a CPU build
    if (/blas/.test(lower)) score += 6;            // OpenBLAS CPU accel (bundled libs)
    if (/avx2/.test(lower)) score += 3;
    else if (/avx512/.test(lower)) score += 1;
    if (/noavx/.test(lower)) score -= 4;
  } else if (capability === 'apple') {
    if (/cuda|cublas|hip|rocm|vulkan|sycl|openvino/.test(lower)) return null; // macOS build is Metal
    score += 20;
  } else {
    const tag = RUNTIME_CAPABILITY_TAGS[capability];
    if (!tag || !tag.test(lower)) return null;
    score += 40;
  }
  if (/server/.test(lower)) score += 2;
  return score;
}

function findBinaryByNames(root, baseNames) {
  const wanted = [];
  for (const base of baseNames) {
    wanted.push(base);
    if (isWin) wanted.push(`${base}.exe`);
  }
  const matchesByPriority = new Map();
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      const idx = wanted.indexOf(entry.name);
      if (idx !== -1 && !matchesByPriority.has(idx)) matchesByPriority.set(idx, full);
    }
  }
  for (let i = 0; i < wanted.length; i++) {
    if (matchesByPriority.has(i)) return matchesByPriority.get(i);
  }
  return null;
}

function findPythonWithVenv() {
  const candidates = isWin
    ? ['python', 'python3', 'py']
    : [
        'python3',
        'python',
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
        '/usr/bin/python3',
      ];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['-c', 'import venv, sys; print(sys.executable)'], {
        stdio: 'ignore',
        timeout: 8000,
        windowsHide: true,
      });
      return candidate;
    } catch {}
  }
  return null;
}

function managedRuntimePythonDir(spec) {
  return path.join(asyncatHome(), spec.dir, 'python');
}

function pythonInVenv(venvDir) {
  return isWin
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');
}

function pythonConsoleScript(venvDir, name) {
  return isWin
    ? path.join(venvDir, 'Scripts', `${name}.exe`)
    : path.join(venvDir, 'bin', name);
}

function runManagedCommand(command, args, { timeoutMs = 20 * 60 * 1000, onLine = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let settled = false;
    let errorTail = '';
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Timed out while running ${path.basename(command)}.`));
    }, timeoutMs);
    const handleChunk = chunk => {
      const text = chunk.toString();
      errorTail = (errorTail + text).slice(-1200);
      if (onLine) {
        text.split(/[\r\n]+/).map(line => line.trim()).filter(Boolean).forEach(onLine);
      }
    };
    child.stdout.on('data', handleChunk);
    child.stderr.on('data', handleChunk);
    child.once('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code}: ${errorTail.trim()}`));
    });
  });
}

function managedPythonPackages(spec) {
  if (spec.id !== 'mlx' || process.platform !== 'linux') return [spec.packageName];
  const mlxPackage = detectGpu()?.vendor === 'NVIDIA' ? 'mlx[cuda12]' : 'mlx[cpu]';
  return [mlxPackage, spec.packageName];
}

function installedPythonPackageVersion(python, packageName) {
  try {
    return execFileSync(
      python,
      ['-c', `import importlib.metadata; print(importlib.metadata.version(${JSON.stringify(packageName)}))`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, windowsHide: true },
    ).trim() || null;
  } catch {
    return null;
  }
}

async function installManagedPythonRuntime(spec, report) {
  const support = runtimePlatformSupport(spec);
  if (!support.supported) throw new Error(support.reason);

  const systemPython = findPythonWithVenv();
  if (!systemPython) {
    throw new Error(`Python 3 with venv support is required to install ${spec.label}.`);
  }

  const root = managedRuntimeRoot(spec);
  const venvDir = managedRuntimePythonDir(spec);
  const backupVenv = assertManagedTarget(`${venvDir}.backup-${randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  let movedExisting = false;
  let preserveBackup = false;
  try {
    if (fs.existsSync(venvDir)) {
      fs.renameSync(venvDir, backupVenv);
      movedExisting = true;
    }
    report('preparing', `Creating an isolated Python environment for ${spec.label}`, 10);
    await runManagedCommand(systemPython, ['-m', 'venv', venvDir], { timeoutMs: 180000 });
    const python = pythonInVenv(venvDir);

    report('installing', `Installing the latest ${spec.label} environment`, 30);
    await runManagedCommand(python, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
      timeoutMs: 300000,
    });
    await runManagedCommand(
      python,
      ['-m', 'pip', 'install', '--upgrade', ...managedPythonPackages(spec)],
      {
        timeoutMs: 30 * 60 * 1000,
        onLine: line => {
          if (/collecting|downloading|installing collected|successfully installed/i.test(line)) {
            report('installing', line.slice(0, 160), 65);
          }
        },
      },
    );

    report('verifying', `Verifying ${spec.label}`, 92);
    await runManagedCommand(python, ['-c', `import ${spec.importName}`], { timeoutMs: 30000 });
    const installed = spec.id === 'piper' ? pythonConsoleScript(venvDir, 'piper') : python;
    if (!fs.existsSync(installed)) {
      throw new Error(`${spec.label} installed, but its executable was not found at ${installed}.`);
    }

    const version = installedPythonPackageVersion(python, spec.packageName) || 'managed-python';
    writeManagedRuntimeMetadata(spec, {
      runtime: spec.id,
      version,
      installer: 'python-venv',
      packages: managedPythonPackages(spec),
      installedAt: new Date().toISOString(),
    });
    persistRuntimeConfigValue(spec.envKey, installed);
    report('complete', `${spec.label} installed`, 100, { binary: installed, version });
    return {
      runtime: spec.id,
      binary: installed,
      envKey: spec.envKey,
      version,
      verified: true,
      license: spec.license || null,
      projectUrl: spec.projectUrl || null,
    };
  } catch (error) {
    if (fs.existsSync(venvDir)) {
      try {
        removeManagedEntry(venvDir);
      } catch (cleanupError) {
        preserveBackup = movedExisting;
        const recovery = movedExisting
          ? ` The previous environment remains at ${backupVenv}.`
          : '';
        throw new Error(`${error.message} The incomplete environment could not be removed: ${cleanupError.message}.${recovery}`);
      }
    }
    if (movedExisting && fs.existsSync(backupVenv)) {
      try {
        fs.renameSync(backupVenv, venvDir);
      } catch (restoreError) {
        preserveBackup = true;
        throw new Error(`${error.message} The previous environment remains at ${backupVenv} because rollback failed: ${restoreError.message}`);
      }
    }
    throw error;
  } finally {
    if (!preserveBackup && fs.existsSync(backupVenv)) {
      try {
        removeManagedEntry(backupVenv);
      } catch (cleanupError) {
        console.warn(`[runtime] Could not remove the previous ${spec.label} backup at ${backupVenv}: ${cleanupError.message}`);
      }
    }
  }
}

export async function installManagedRuntime(runtimeId, { onProgress = null, capability = null } = {}) {
  const spec = MANAGED_RUNTIME_SPECS[runtimeId];
  if (!spec) throw new Error(`Unknown runtime: ${runtimeId}`);

  const report = (phase, message, percent, extra = {}) =>
    onProgress?.({ phase, message, percent, runtime: spec.id, ...extra });

  if (spec.installer === 'python') {
    return installManagedPythonRuntime(spec, report);
  }

  report('resolving', `Finding a ${spec.label} build for your system`, 2);
  const res = await fetch(`https://api.github.com/repos/${spec.repo}/releases/latest`, {
    headers: githubApiHeaders(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`GitHub releases API returned ${res.status} for ${spec.repo}`);
  const release = await res.json();

  // Pick the best variant for this machine: an explicit capability, else the
  // detected GPU when the engine ships GPU builds, else a portable CPU build.
  let targetCapability = capability || (spec.autoGpu ? runtimeCapabilityForGpu(detectGpu()) : 'cpu_safe');
  const rankFor = (cap) => (release.assets || [])
    .map(asset => ({ asset, score: scoreRuntimeAsset(asset.name, process.platform, process.arch, cap, spec.id) }))
    .filter(item => item.score !== null)
    .sort((a, b) => b.score - a.score)
    .map(item => item.asset);

  let ranked = rankFor(targetCapability);
  if (ranked.length === 0 && targetCapability !== 'vulkan' && targetCapability !== 'apple' && targetCapability !== 'cpu_safe') {
    targetCapability = 'vulkan'; // cross-vendor GPU build runs on NVIDIA/AMD/Intel too
    ranked = rankFor('vulkan');
  }
  if (ranked.length === 0 && targetCapability !== 'cpu_safe') {
    targetCapability = 'cpu_safe'; // no GPU build for this engine/platform — fall back
    ranked = rankFor('cpu_safe');
  }
  if (ranked.length === 0) {
    throw new Error(
      `No prebuilt ${spec.label} download is available for ${process.platform}-${process.arch}. ` +
      `Install it with your package manager or set ${spec.envKey}.`
    );
  }

  const asset = ranked[0];
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-${spec.id}-`));
  const archivePath = path.join(tmpRoot, asset.name);
  const extractDir = path.join(tmpRoot, 'extract');
  const targetDir = managedRuntimeRoot(spec);
  const stagingDir = assertManagedTarget(path.join(asyncatHome(), `.${spec.dir}.install-${randomUUID()}`));

  try {
    report('downloading', `Downloading ${asset.name}`, 5, { assetName: asset.name });
    await downloadFile(asset.browser_download_url, archivePath, p => {
      report('downloading', `Downloading ${asset.name}`, Math.max(5, Math.min(72, p.percent ?? 0)), {
        assetName: asset.name, downloadedBytes: p.downloadedBytes, totalBytes: p.totalBytes,
      });
    });

    report('extracting', `Extracting ${asset.name}`, 80, { assetName: asset.name });
    extractArchive(archivePath, extractDir);

    const staged = findBinaryByNames(extractDir, spec.binaryNames);
    if (!staged) {
      throw new Error(`The ${spec.label} archive did not contain ${spec.binaryNames.join(' / ')}.`);
    }

    report('installing', 'Installing engine files', 88);
    fs.mkdirSync(path.dirname(stagingDir), { recursive: true });
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.cpSync(extractDir, stagingDir, { recursive: true });
    ensureLinuxSonameLinks(stagingDir);
    ensureDarwinDylibLinks(stagingDir);
    // Windows CUDA image/audio builds need the cudart companion DLLs too.
    await installCudartCompanion(release, asset.name, stagingDir, onProgress);

    let stagedInstalled = findBinaryByNames(stagingDir, spec.binaryNames);
    if (!stagedInstalled) throw new Error(`Could not locate the installed ${spec.label} binary in the staged runtime.`);

    if (!isWin) {
      // Wrap with a launcher that exports bundled lib dirs so the binary can find
      // its .so/.dylib siblings regardless of the caller's working directory.
      const realBinary = `${stagedInstalled}.real`;
      fs.renameSync(stagedInstalled, realBinary);
      installUnixLauncher(stagedInstalled, realBinary, stagingDir);
      fs.chmodSync(realBinary, 0o755);
      fs.chmodSync(stagedInstalled, 0o755);
    }

    // Best-effort verification (these binaries don't all support --version cleanly).
    let verified = false;
    try { verified = verifyBinaryDetailed(stagedInstalled).ok; } catch { /* non-fatal */ }

    const version = release.tag_name || release.name || 'latest';
    writeManagedRuntimeMetadata(spec, {
      runtime: spec.id,
      version,
      asset: asset.name,
      capability: targetCapability,
      installer: 'managed-binary',
      verified,
      installedAt: new Date().toISOString(),
    }, stagingDir);
    const relativeBinary = path.relative(stagingDir, stagedInstalled);
    swapManagedDirectory(stagingDir, targetDir);
    const installed = path.join(targetDir, relativeBinary);
    persistRuntimeConfigValue(spec.envKey, installed);
    const variantLabel = runtimeCapabilityLabel(targetCapability);
    report('complete', `${spec.label} (${variantLabel}) installed`, 100, { binary: installed, verified, capability: targetCapability });
    return { runtime: spec.id, binary: installed, envKey: spec.envKey, version, verified, capability: targetCapability };
  } finally {
    if (fs.existsSync(stagingDir)) removeManagedEntry(stagingDir);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}
