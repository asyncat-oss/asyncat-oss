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
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const IS_WIN = process.platform === 'win32';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_WRAPPER_PATH = path.resolve(__dirname, '../../../../scripts/llama_cpp_server_wrapper.py');

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

async function detectGpuAdvice() {
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
        advice: `NVIDIA GPU detected: ${name}${vram}. Asyncat keeps CPU-safe defaults; for CUDA builds use a CUDA llama.cpp binary or an Asyncat Python venv with CMAKE_ARGS="-DGGML_CUDA=on" python -m pip install "llama-cpp-python[server]".`,
      };
    }
  } catch {}

  try {
    await execAsync('rocm-smi --showuse', { timeout: 3000 });
    return {
      vendor: 'AMD',
      name: 'AMD GPU with ROCm detected',
      advice: 'AMD/ROCm detected. ROCm llama.cpp builds are advanced/manual; keep LLAMA_GPU_LAYERS=0 unless you configure a ROCm-capable build.',
    };
  } catch {}

  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return {
      vendor: 'Apple',
      name: 'Apple Silicon / Metal',
      advice: 'Apple Silicon detected. Use the managed macOS llama.cpp build first, then set LLAMA_GPU_LAYERS in den/.env if you want Metal offload.',
    };
  }

  return null;
}

async function withDiagnostics(result) {
  return {
    managedPath: managedLlamaBinaryPath(),
    managedPythonPath: managedPythonBinaryPath(),
    gpu: await detectGpuAdvice(),
    ...result,
  };
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
    ctxSize:    state.ctxSize ?? parseInt(process.env.LLAMA_CTX_SIZE ?? '8192', 10),
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

  const safeFilename = path.basename(modelFilename);
  const modelPath    = path.join(modelsDir, safeFilename);

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
  const ctxSize    = ctxSizeOverride ? String(ctxSizeOverride) : (process.env.LLAMA_CTX_SIZE ?? '8192');

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
        if (Array.isArray(json.data)) {
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
