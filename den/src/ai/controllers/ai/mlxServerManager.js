// mlxServerManager.js — MLX model lifecycle manager for Apple Silicon
// Scans well-known HuggingFace and MLX directories for .safetensors model dirs,
// and manages the mlx_lm.server process (OpenAI-compatible on port 8766).
//
// All exported functions are safe no-ops on non-Apple-Silicon platforms.
// State machine: idle → loading → ready (or error)

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import db from '../../../db/client.js';

const execAsync = promisify(exec);

// ── Platform guard ────────────────────────────────────────────────────────────
export const IS_APPLE_SILICON =
  process.platform === 'darwin' && process.arch === 'arm64';

const MLX_PORT = parseInt(process.env.MLX_SERVER_PORT ?? '8766', 10);
const MLX_HOST = '127.0.0.1';
const LOAD_TIMEOUT_MS = 120_000; // 2 min — first MLX load can be slow
const POLL_INTERVAL_MS = 800;

// ── State ─────────────────────────────────────────────────────────────────────
let serverProcess = null;
let serverState = {
  status: 'idle', // idle | loading | ready | error
  model: null,    // model name (dir basename)
  modelPath: null,
  port: MLX_PORT,
  error: null,
  pid: null,
};
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) {
    try { fn(serverState); } catch {}
  }
}

function setState(patch) {
  serverState = { ...serverState, ...patch };
  notify();
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getStatus() {
  return { ...serverState, available: IS_APPLE_SILICON };
}

// ── Scan logic ────────────────────────────────────────────────────────────────

/**
 * Returns candidate scan directories in priority order.
 * All paths use os.homedir() so they automatically work for any user.
 */
function scanDirectories() {
  const home = os.homedir();
  const candidates = [
    // HuggingFace default cache (most common)
    path.join(home, '.cache', 'huggingface', 'hub'),
    // User-configured override
    ...(process.env.MLX_MODELS_PATH ? [process.env.MLX_MODELS_PATH] : []),
    // Common manual locations
    path.join(home, 'mlx_models'),
    path.join(home, 'models'),
    path.join(home, 'Documents', 'models'),
    path.join(home, 'Downloads', 'models'),
  ];
  return candidates.filter(Boolean);
}

/**
 * Checks if a directory looks like a valid MLX model.
 * Must have config.json AND at least one .safetensors file.
 */
function isValidMlxModelDir(dirPath) {
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return false;

    const entries = fs.readdirSync(dirPath);
    const hasConfig = entries.some(e => e === 'config.json');
    const hasWeights = entries.some(e => e.endsWith('.safetensors') || e.endsWith('.pt') || e.endsWith('.bin'));
    if (hasConfig && hasWeights) return true;

    // Check for HuggingFace snapshots
    if (entries.includes('snapshots')) {
      const snapDir = path.join(dirPath, 'snapshots');
      const snaps = fs.readdirSync(snapDir);
      for (const snap of snaps) {
        if (isValidMlxModelDir(path.join(snapDir, snap))) return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Resolve the actual model directory (handles HF Hub snapshots)
 */
function resolveMlxModelDir(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath);
    
    // Always prefer snapshots if they exist (standard HF Hub cache)
    if (entries.includes('snapshots')) {
      const snapDir = path.join(dirPath, 'snapshots');
      try {
        const snaps = fs.readdirSync(snapDir).filter(s => !s.startsWith('.'));
        if (snaps.length > 0) {
          // Sort snapshots by mtime to pick the most recent if there are multiple
          const snapStats = snaps.map(s => ({
            name: s,
            mtime: fs.statSync(path.join(snapDir, s)).mtimeMs
          }));
          snapStats.sort((a, b) => b.mtime - a.mtime);
          
          const bestSnap = snapStats[0].name;
          const fullSnapPath = path.join(snapDir, bestSnap);
          if (isValidMlxModelDir(fullSnapPath)) return resolveMlxModelDir(fullSnapPath);
        }
      } catch (e) {}
    }

    if (entries.includes('config.json')) return dirPath;
  } catch (e) {}
  
  return dirPath;
}

/**
 * Read model config.json for display metadata.
 */
function readModelConfig(modelPath) {
  try {
    const configPath = path.join(modelPath, 'config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Friendly display name from a HuggingFace snapshot path like:
 *   ~/.cache/huggingface/hub/models--mlx-community--Llama.../snapshots/abc123/
 * → "mlx-community/Llama..."
 */
function extractFriendlyName(dirPath) {
  // HuggingFace cache pattern: models--<org>--<repo>/snapshots/<hash>
  const parts = dirPath.split(path.sep);
  const hubIdx = parts.findIndex(p => p === 'hub');
  if (hubIdx !== -1 && parts[hubIdx + 1]?.startsWith('models--')) {
    const repoSlug = parts[hubIdx + 1].replace(/^models--/, '').replace(/--/g, '/');
    return repoSlug;
  }
  return path.basename(dirPath);
}

/**
 * Recursively search a directory up to `maxDepth` levels for valid MLX model dirs.
 */
function findMlxModelsIn(rootDir, maxDepth = 4, depth = 0) {
  const found = [];
  if (depth > maxDepth) return found;
  if (!fs.existsSync(rootDir)) return found;

  // Check if this is a valid MLX dir (possibly a Hub dir)
  if (isValidMlxModelDir(rootDir)) {
    const resolved = resolveMlxModelDir(rootDir);
    found.push(resolved);
    return found; // don't recurse into a valid model dir
  }

  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Skip hidden dirs (except .cache at depth 0)
    if (entry.name.startsWith('.') && depth > 0) continue;
    const subPath = path.join(rootDir, entry.name);
    const subFound = findMlxModelsIn(subPath, maxDepth, depth + 1);
    found.push(...subFound);
  }

  return found;
}

// Simple in-memory cache for MLX model list
let cachedMlxModels = null;
let lastMlxScan = 0;
const MLX_CACHE_TTL = 10000; // 10 seconds

/**
 * List all locally detected MLX models across all scan directories.
 */
export function listMlxModels() {
  if (!IS_APPLE_SILICON) return [];

  const now = Date.now();
  if (cachedMlxModels && (now - lastMlxScan < MLX_CACHE_TTL)) {
    return cachedMlxModels;
  }

  const seen = new Set();
  const results = [];

  const scanDirs = scanDirectories();
  try {
    const customEntries = db.prepare("SELECT path FROM custom_model_paths WHERE type = 'mlx'").all();
    for (const entry of customEntries) {
      if (!scanDirs.includes(entry.path)) scanDirs.push(entry.path);
    }
  } catch {}

  for (const scanRoot of scanDirs) {
    const dirs = findMlxModelsIn(scanRoot);
    for (const modelPath of dirs) {
      const realPath = (() => { try { return fs.realpathSync(modelPath); } catch { return modelPath; } })();
      if (seen.has(realPath)) continue;
      seen.add(realPath);

      const config = readModelConfig(modelPath);
      const friendlyName = extractFriendlyName(modelPath);
      const dirName = path.basename(modelPath);

      // Estimate total size from .safetensors files
      let sizeBytes = 0;
      try {
        const entries = fs.readdirSync(modelPath);
        for (const entry of entries) {
          if (entry.endsWith('.safetensors')) {
            try {
              sizeBytes += fs.statSync(path.join(modelPath, entry)).size;
            } catch {}
          }
        }
      } catch {}

      results.push({
        id: realPath,
        name: friendlyName,
        dirName,
        path: modelPath,
        realPath,
        architecture: config.model_type || config.architectures?.[0] || 'unknown',
        contextLength: config.max_position_embeddings || 
                       config.max_seq_len || 
                       config.model_max_length || 
                       config.n_positions || null,
        quantization: config.quantization_config?.quant_type || null,
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
        isRunning: serverState.modelPath === realPath && serverState.status !== 'idle',
      });
    }
  }

  // Update results with custom names and include unmatched custom paths
  try {
    const customEntries = db.prepare("SELECT id, name, path FROM custom_model_paths WHERE type = 'mlx'").all();
    
    // Normalize path helper
    const norm = (p) => p ? p.replace(/\/+$/, '') : '';

    // First, update existing results found by scanner
    for (const res of results) {
      const resPath = norm(res.path);
      const resRealPath = norm(res.realPath);
      
      const custom = customEntries.find(c => {
        const cPath = norm(c.path);
        // Direct match or the custom path resolves to this scanner result
        if (cPath === resPath || cPath === resRealPath) return true;
        
        try {
          const resolvedCPath = norm(resolveMlxModelDir(c.path));
          return resolvedCPath === resPath || resolvedCPath === resRealPath;
        } catch {
          return false;
        }
      });
      
      if (custom) {
        res.id = custom.id;
        res.name = custom.name;
        res.isExternal = true;
      }
    }

    // Second, add custom paths that the scanner missed
    for (const custom of customEntries) {
      const cPath = norm(custom.path);
      const resolvedCPath = norm(resolveMlxModelDir(custom.path));
      
      const found = results.some(res => {
        const resPath = norm(res.path);
        const resRealPath = norm(res.realPath);
        return resPath === cPath || resRealPath === cPath || 
               resPath === resolvedCPath || resRealPath === resolvedCPath;
      });
      
      if (!found) {
        let pathExists = false;
        let isDir = false;
        try {
          const stat = fs.statSync(custom.path);
          pathExists = true;
          isDir = stat.isDirectory();
        } catch {}
        
        results.push({
          id: custom.id,
          name: custom.name,
          dirName: path.basename(custom.path),
          path: custom.path,
          realPath: custom.path,
          architecture: 'unknown',
          contextLength: null,
          quantization: null,
          sizeBytes: 0,
          sizeFormatted: '0 B',
          isExternal: true,
          isMissing: !pathExists,
          isInvalid: pathExists && !isDir,
          isRunning: serverState.modelPath === custom.path && serverState.status !== 'idle',
        });
      }
    }
  } catch (err) {
    console.error('Error updating MLX custom paths:', err);
  }

  cachedMlxModels = results;
  lastMlxScan = now;
  return results;
}

// ── mlx_lm availability check ─────────────────────────────────────────────────

let _mlxAvailableCache = null; // null = unchecked, true/false = result

export async function isMlxAvailable() {
  if (!IS_APPLE_SILICON) return false;
  if (_mlxAvailableCache !== null) return _mlxAvailableCache;

  try {
    await execAsync('python3 -m mlx_lm.server --help 2>/dev/null', { timeout: 5000 });
    _mlxAvailableCache = true;
  } catch {
    // mlx_lm might still be installed; --help exits with code 1 on some versions
    try {
      await execAsync('python3 -c "import mlx_lm" 2>/dev/null', { timeout: 5000 });
      _mlxAvailableCache = true;
    } catch {
      _mlxAvailableCache = false;
    }
  }
  return _mlxAvailableCache;
}

// ── Server lifecycle ──────────────────────────────────────────────────────────

async function pollUntilReady(timeoutMs = LOAD_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://${MLX_HOST}:${MLX_PORT}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

export async function startServer(modelPath) {
  if (!IS_APPLE_SILICON) {
    throw new Error('MLX is only supported on Apple Silicon (macOS arm64).');
  }

  const mlxOk = await isMlxAvailable();
  if (!mlxOk) {
    throw new Error('mlx_lm is not installed. Run: pip install mlx-lm');
  }

  // Stop any running server first
  await stopServer();

  const resolvedPath = resolveMlxModelDir(modelPath);
  const realPath = (() => { try { return fs.realpathSync(resolvedPath); } catch { return resolvedPath; } })();

  if (!isValidMlxModelDir(realPath)) {
    throw new Error(`Not a valid MLX model directory: ${modelPath}`);
  }

  const modelName = extractFriendlyName(realPath);
  setState({ status: 'loading', model: modelName, modelPath: realPath, error: null });

  console.info('[mlxServer] Starting server for:', modelName);

  const proc = spawn('python3', [
    '-m', 'mlx_lm.server',
    '--model', realPath,
    '--port', String(MLX_PORT),
    '--host', MLX_HOST,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  serverProcess = proc;

  proc.stdout.on('data', d => {
    const line = d.toString().trim();
    if (line) console.info('[mlxServer]', line);
  });
  proc.stderr.on('data', d => {
    const line = d.toString().trim();
    if (line) console.info('[mlxServer]', line);
  });

  proc.on('exit', (code, signal) => {
    console.info(`[mlxServer] Process exited — code=${code} signal=${signal}`);
    if (serverState.status !== 'idle') {
      setState({
        status: code === 0 || signal === 'SIGTERM' ? 'idle' : 'error',
        error: code !== 0 && signal !== 'SIGTERM' ? `Server exited with code ${code}` : null,
        pid: null,
      });
    }
    if (serverProcess === proc) serverProcess = null;
  });

  setState({ pid: proc.pid });

  // Poll until the HTTP server is accepting connections
  const ready = await pollUntilReady();
  if (!ready) {
    await stopServer();
    throw new Error(`MLX server did not become ready within ${LOAD_TIMEOUT_MS / 1000}s`);
  }

  setState({ status: 'ready' });
  console.info('[mlxServer] Ready —', modelName, `on port ${MLX_PORT}`);
  return { port: MLX_PORT, model: modelName, modelPath: realPath };
}

export async function stopServer() {
  if (!serverProcess) {
    setState({ status: 'idle', model: null, modelPath: null, error: null, pid: null });
    return;
  }

  console.info('[mlxServer] Stopping server...');
  const proc = serverProcess;
  serverProcess = null;

  try {
    proc.kill('SIGTERM');
    // Give it 3s to exit gracefully, then SIGKILL
    await new Promise(resolve => {
      const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 3000);
      proc.once('exit', () => { clearTimeout(t); resolve(); });
    });
  } catch {}

  setState({ status: 'idle', model: null, modelPath: null, error: null, pid: null });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1e6;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

export function clearCache() {
  cachedMlxModels = null;
  lastMlxScan = 0;
}

export { MLX_PORT };
