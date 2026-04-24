import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync, execSync } from 'child_process';
import { once } from 'events';
import { ROOT, readEnv, setKey } from './env.js';

export const LLAMA_RELEASES_API = 'https://api.github.com/repos/ggml-org/llama.cpp/releases/latest';
export const LLAMA_RELEASES_LIST_API = 'https://api.github.com/repos/ggml-org/llama.cpp/releases';
export const LLAMA_RELEASES_URL = 'https://github.com/ggml-org/llama.cpp/releases';
export const MISSING_ENGINE_MESSAGE = 'Local engine missing. Run asyncat install --local-engine, set LLAMA_BINARY_PATH, or choose /provider for Ollama, LM Studio, or cloud.';
export const MANAGED_ENGINE_METADATA_FILE = 'asyncat-engine.json';
export const LLAMA_ENGINE_PROFILES = ['cpu_safe', 'nvidia_gpu', 'apple_metal', 'amd_rocm'];

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

export function profileCapabilityHint(profile = 'cpu_safe') {
  if (profile === 'nvidia_gpu') return 'nvidia';
  if (profile === 'apple_metal') return 'apple';
  if (profile === 'amd_rocm') return 'amd';
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
  return tags;
}

function inferProfileFromAssetName(name = '', fallbackProfile = 'cpu_safe', platform = process.platform) {
  const tags = assetTagsFromName(name);
  if (tags.includes('cuda')) return 'nvidia_gpu';
  if (tags.includes('rocm')) return 'amd_rocm';
  if (tags.includes('metal')) return 'apple_metal';
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

async function installManagedAsset(asset, release, profile = 'cpu_safe', onProgress = null) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-llama-'));
  const archivePath = path.join(tmpRoot, asset.name);
  const extractDir = path.join(tmpRoot, 'extract');
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
    onProgress?.({
      phase: 'verifying',
      message: 'Verifying llama-server binary',
      percent: 93,
      assetName: asset.name,
      releaseTag: release.tag_name || release.name || 'latest',
    });
    if (!verifyBinary(installed)) {
      const detail = verifyBinaryError(installed);
      fs.rmSync(managedEngineDir(), { recursive: true, force: true });
      throw new Error(`Installed ${installed}, but llama-server verification failed: ${detail}.`);
    }
    writeManagedEngineMetadata({
      profile,
      capabilityHint: profileCapabilityHint(profile),
      asset: asset.name,
      version: release.tag_name || release.name || 'latest',
      installedAt: new Date().toISOString(),
    });
    setKey('den/.env', 'LLAMA_BINARY_PATH', installed);
    onProgress?.({
      phase: 'complete',
      message: 'Managed engine installed successfully',
      percent: 100,
      assetName: asset.name,
      releaseTag: release.tag_name || release.name || 'latest',
    });
    return { binary: installed, asset: asset.name, version: release.tag_name || release.name || 'latest', profile };
  } finally {
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
      const match = entry.name.match(/^(lib.+\.so)\.(\d+)\.\d+(?:\.\d+)*$/);
      if (!match) continue;
      ensureRelativeSymlink(path.join(current, match[1]), entry.name);
      ensureRelativeSymlink(path.join(current, `${match[1]}.${match[2]}`), entry.name);
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
    'export LD_LIBRARY_PATH',
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
    throw new Error(`No llama.cpp release asset matched ${process.platform}-${process.arch} for profile ${requestedProfile}. Download manually from ${LLAMA_RELEASES_URL} and set LLAMA_BINARY_PATH.`);
  }

  const failures = [];
  for (const asset of candidates) {
    try {
      const assetProfile = inferProfileFromAssetName(asset.name, effectiveProfile);
      return await installManagedAsset(asset, release, assetProfile, options.onProgress);
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
