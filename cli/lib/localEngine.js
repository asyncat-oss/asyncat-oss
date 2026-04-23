import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync, execSync } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { ROOT, readEnv, setKey } from './env.js';

export const LLAMA_RELEASES_API = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest';
export const LLAMA_RELEASES_URL = 'https://github.com/ggml-org/llama.cpp/releases';
export const MISSING_ENGINE_MESSAGE = 'Local engine missing. Run asyncat install --local-engine, set LLAMA_BINARY_PATH, or choose /provider for Ollama, LM Studio, or cloud.';

const isWin = process.platform === 'win32';

export function asyncatHome() {
  if (isWin) {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Asyncat');
  }
  return path.join(os.homedir(), '.asyncat');
}

export function managedEngineDir() {
  return path.join(asyncatHome(), 'llama.cpp', 'current');
}

export function managedLlamaBinaryPath() {
  return path.join(managedEngineDir(), isWin ? 'llama-server.exe' : 'llama-server');
}

export function managedPythonDir() {
  return path.join(asyncatHome(), 'llama.cpp', 'python');
}

export function managedPythonBinaryPath() {
  if (isWin) return path.join(managedPythonDir(), 'Scripts', 'python.exe');
  return path.join(managedPythonDir(), 'bin', 'python');
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
    path.join(home, 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'llama-server.exe'),
    path.join(localAppData, 'Microsoft', 'WindowsApps', 'llama-server.exe'),
    path.join(localAppData, 'Microsoft', 'WinGet', 'Packages', '*', 'llama-server.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'Python', 'Python*', 'Scripts', 'llama-server.exe'),
    path.join(home, 'AppData', 'Local', 'Programs', 'llama.cpp', 'llama-server.exe'),
    path.join(localAppData, 'Programs', 'llama.cpp', 'llama-server.exe'),
    path.join(home, '.local', 'bin', 'llama-server.exe'),
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

export function verifyBinary(binary) {
  try {
    execFileSync(binary, ['--version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    try {
      execFileSync(binary, ['--help'], { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

function verifyBinaryError(binary) {
  try {
    execFileSync(binary, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
    return '';
  } catch (versionErr) {
    try {
      execFileSync(binary, ['--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
      return '';
    } catch (helpErr) {
      const stderr = helpErr.stderr || versionErr.stderr || '';
      const stdout = helpErr.stdout || versionErr.stdout || '';
      const text = `${stderr}\n${stdout}`.trim();
      return text || helpErr.message || versionErr.message || 'unknown verification failure';
    }
  }
}

export function findExistingLlamaServer() {
  const denEnv = readEnv('den/.env');
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

  return null;
}

export function gpuAdvice(gpu = detectGpu()) {
  if (!gpu) return null;
  if (gpu.vendor === 'NVIDIA') {
    const vram = gpu.vramGb ? ` (${gpu.vramGb} GB VRAM)` : '';
    return `NVIDIA GPU detected: ${gpu.name}${vram}. Asyncat keeps CPU-safe defaults; for CUDA builds use a CUDA llama.cpp binary, or an Asyncat Python venv with CMAKE_ARGS="-DGGML_CUDA=on" python -m pip install "llama-cpp-python[server]".`;
  }
  if (gpu.vendor === 'Apple') {
    return 'Apple Silicon detected. Use the managed macOS llama.cpp build first, then set LLAMA_GPU_LAYERS in den/.env if you want Metal offload.';
  }
  if (gpu.vendor === 'AMD') {
    return 'AMD/ROCm detected. ROCm llama.cpp builds are advanced/manual; keep LLAMA_GPU_LAYERS=0 unless you configure a ROCm-capable build.';
  }
  return null;
}

function scoreLlamaReleaseAsset(asset, platform = process.platform, arch = process.arch) {
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
  if (/cpu/.test(name)) score += 30;
  if (/noavx/.test(name)) score -= 2;
  if (/avx2/.test(name)) score += 1;
  if (/openvino|cuda|cublas|rocm|vulkan|kompute|sycl|opencl|hip|metal/.test(name)) score -= 100;

  return score;
}

export function rankLlamaReleaseAssets(assets, platform = process.platform, arch = process.arch) {
  return (assets || [])
    .map(asset => ({ asset, score: scoreLlamaReleaseAsset(asset, platform, arch) }))
    .filter(item => item.score !== null)
    .sort((a, b) => b.score - a.score)
    .map(item => item.asset);
}

export function chooseLlamaReleaseAsset(assets, platform = process.platform, arch = process.arch) {
  return rankLlamaReleaseAssets(assets, platform, arch)[0] || null;
}

async function installManagedAsset(asset, release) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-llama-'));
  const archivePath = path.join(tmpRoot, asset.name);
  const extractDir = path.join(tmpRoot, 'extract');
  try {
    await downloadFile(asset.browser_download_url, archivePath);
    extractArchive(archivePath, extractDir);
    const serverBinary = findLlamaServerBinary(extractDir);
    if (!serverBinary) throw new Error(`Archive did not contain ${isWin ? 'llama-server.exe' : 'llama-server'}.`);

    fs.rmSync(managedEngineDir(), { recursive: true, force: true });
    fs.mkdirSync(managedEngineDir(), { recursive: true });
    fs.cpSync(extractDir, managedEngineDir(), { recursive: true });
    ensureLinuxSonameLinks(managedEngineDir());

    const installed = managedLlamaBinaryPath();
    const copiedServer = findLlamaServerBinary(managedEngineDir());
    if (!copiedServer) {
      throw new Error(`Archive did not install ${isWin ? 'llama-server.exe' : 'llama-server'} into ${managedEngineDir()}.`);
    }

    if (!isWin) {
      let realServer = copiedServer;
      if (path.resolve(copiedServer) === path.resolve(installed)) {
        realServer = path.join(managedEngineDir(), 'llama-server.real');
        fs.renameSync(copiedServer, realServer);
      }
      installUnixLauncher(installed, realServer, managedEngineDir());
    }

    if (!fs.existsSync(installed)) {
      throw new Error(`Archive did not install ${isWin ? 'llama-server.exe' : 'llama-server'} into ${managedEngineDir()}.`);
    }
    if (!isWin) fs.chmodSync(installed, 0o755);
    if (!verifyBinary(installed)) {
      const detail = verifyBinaryError(installed);
      fs.rmSync(managedEngineDir(), { recursive: true, force: true });
      throw new Error(`Installed ${installed}, but llama-server verification failed: ${detail}.`);
    }
    setKey('den/.env', 'LLAMA_BINARY_PATH', installed);
    return { binary: installed, asset: asset.name, version: release.tag_name || release.name || 'latest' };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

export async function fetchLatestLlamaRelease() {
  const res = await fetch(LLAMA_RELEASES_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'asyncat-installer',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`GitHub releases API returned ${res.status}`);
  return res.json();
}

export async function downloadFile(url, destination) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'asyncat-installer' },
    signal: AbortSignal.timeout(900000),
  });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  if (!res.body) throw new Error('Download failed: empty response body');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destination));
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
      const match = entry.name.match(/^(lib.+\.so)\.(\d+)\.\d+(?:\.\d+)*$/);
      if (!match) continue;
      const soname = path.join(current, `${match[1]}.${match[2]}`);
      try {
        const stat = fs.lstatSync(soname);
        if (stat.isSymbolicLink() && !fs.existsSync(soname)) {
          fs.unlinkSync(soname);
        } else {
          continue;
        }
      } catch {}
      try {
        fs.symlinkSync(entry.name, soname);
      } catch {}
    }
  }
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
    'export LD_LIBRARY_PATH',
    `exec "$DIR/${rel}" "$@"`,
    '',
  ].join('\n');
  fs.writeFileSync(targetPath, script, 'utf8');
  fs.chmodSync(targetPath, 0o755);
}

export async function installManagedLlamaServer() {
  const release = await fetchLatestLlamaRelease();
  const candidates = rankLlamaReleaseAssets(release.assets || []).slice(0, 5);
  if (candidates.length === 0) {
    throw new Error(`No llama.cpp release asset matched ${process.platform}-${process.arch}. Download manually from ${LLAMA_RELEASES_URL} and set LLAMA_BINARY_PATH.`);
  }

  const failures = [];
  for (const asset of candidates) {
    try {
      return await installManagedAsset(asset, release);
    } catch (e) {
      failures.push(`${asset.name}: ${e.message}`);
      fs.rmSync(managedEngineDir(), { recursive: true, force: true });
    }
  }

  throw new Error(`Tried ${candidates.length} llama.cpp release asset(s), but none verified:\n${failures.join('\n')}\nManual releases: ${LLAMA_RELEASES_URL}`);
}

export function writeLlamaBinaryEnv(binaryPath) {
  setKey('den/.env', 'LLAMA_BINARY_PATH', binaryPath);
}

export function installPythonVenvFallback(pythonCmd) {
  fs.mkdirSync(path.dirname(managedPythonDir()), { recursive: true });
  execFileSync(pythonCmd, ['-m', 'venv', managedPythonDir()], { cwd: ROOT, stdio: 'ignore', timeout: 120000 });
  const python = managedPythonBinaryPath();
  execFileSync(python, ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: ROOT, stdio: 'ignore', timeout: 120000 });
  execFileSync(python, ['-m', 'pip', 'install', 'llama-cpp-python[server]'], { cwd: ROOT, stdio: 'ignore', timeout: 600000 });
  setKey('den/.env', 'LLAMA_PYTHON_PATH', python);
  return python;
}
