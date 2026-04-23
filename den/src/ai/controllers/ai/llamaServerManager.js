// llamaServerManager.js — Native llama.cpp server lifecycle manager
// Spawns llama-server as a child process, serves GGUF models via OpenAI-compat API
// on http://127.0.0.1:8765/v1 — no Ollama/LM Studio dependency required.
//
// Binary resolution order:
//   1. LLAMA_BINARY_PATH env var (set in .env for custom installs)
//   2. Well-known absolute paths (unsloth, homebrew, standard Linux paths)
//   3. PATH-based lookup (which llama-server)
//   4. llama-cpp-python server (python3 -m llama_cpp.server)
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
      return { found: true, binary: envPath, path: envPath, source: 'LLAMA_BINARY_PATH env var' };
    }
    // Env var was set but path doesn't exist — warn but continue searching
    console.warn(`[llamaServer] LLAMA_BINARY_PATH="${envPath}" does not exist, falling through to auto-detect`);
  }

  const home = os.homedir();

  // 2. Well-known absolute paths (no PATH needed)
  //    Covers: unsloth installs, homebrew, standard Linux locations
  //    Also includes Windows paths for llama-server binaries
  const absolutePaths = [
    // Windows llama-server locations
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
    // Handle glob patterns for Windows Python paths
    if (p.includes('Python*')) {
      const baseDir = path.dirname(p);
      const baseName = path.basename(p);
      try {
        const entries = fs.readdirSync(baseDir);
        for (const entry of entries) {
          if (entry.startsWith('Python')) {
            const fullPath = path.join(baseDir, entry, baseName.replace('*', ''));
            if (fs.existsSync(fullPath)) {
              return { found: true, binary: fullPath, path: fullPath, source: 'auto-detected' };
            }
          }
        }
      } catch { /* skip */ }
    } else if (fs.existsSync(p)) {
      return { found: true, binary: p, path: p, source: 'auto-detected' };
    }
  }

  // 3. PATH-based lookup
  const pathNames = ['llama-server', 'llama-cpp-server'];
  for (const name of pathNames) {
    try {
      // Use 'where' on Windows, 'which' on Unix
      const cmd = IS_WIN ? `where "${name}" 2>nul` : `which "${name}" 2>/dev/null`;
      const { stdout } = await execAsync(cmd);
      const p = stdout.trim().split('\n')[0]; // Take first match on Windows
      if (p) return { found: true, binary: p, path: p, source: 'PATH' };
    } catch { /* not found */ }
  }

  // 4. llama-cpp-python python package (pip install llama-cpp-python[server])
  // Try both python and python3 - Windows typically uses 'python'
  const pythonCommands = IS_WIN ? ['python', 'python3', 'py'] : ['python3', 'python'];
  for (const pythonCmd of pythonCommands) {
    try {
      await execAsync(`${pythonCmd} -c "import llama_cpp" 2>/dev/null`);
      return {
        found:    true,
        binary:   pythonCmd,
        path:     pythonCmd,
        source:   'llama-cpp-python package',
        isPython: true,
        pythonCmd, // Store the working command for spawning
      };
    } catch { /* not installed */ }
  }

  return {
    found:    false,
    searched: [...absolutePaths, ...pathNames, 'python3 llama-cpp-python'],
    hint:     'Set LLAMA_BINARY_PATH=/path/to/llama-server in your .env file, or install via pip install llama-cpp-python[server]',
  };
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
    throw new Error(
      'llama-server binary not found.\n\n' +
      'Install options:\n' +
      '  pip install llama-cpp-python[server]  (easiest, uses your existing Python)\n' +
      '  Download llama.cpp release binary from https://github.com/ggml-org/llama.cpp/releases\n\n' +
      'Then set LLAMA_BINARY_PATH=/full/path/to/llama-server in your .env file.'
    );
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
    // On Windows, use shell: true for better compatibility
    proc = spawn(pythonCmd, [
      PYTHON_WRAPPER_PATH,
      '--model',         modelPath,
      '--host',          LLAMA_HOST,
      '--port',          String(LLAMA_PORT),
      '--n_ctx',         ctxSize,
      '--n_gpu_layers',  nGpuLayers,
      '--n_threads',     nThreads,
    ], { stdio: ['ignore', 'pipe', 'pipe'], detached: false, shell: IS_WIN });
  } else {
    // On Windows, use shell: true and also add .exe extension if not present
    const binaryPath = binInfo.binary.endsWith('.exe') ? binInfo.binary : binInfo.binary;
    proc = spawn(binaryPath, [
      '-m',         modelPath,
      '--host',     LLAMA_HOST,
      '--port',     String(LLAMA_PORT),
      '--ctx-size', ctxSize,
      '-ngl',       nGpuLayers,
      '--threads',  nThreads,
      // Note: intentionally NOT passing --log-disable so we capture startup errors
    ], { stdio: ['ignore', 'pipe', 'pipe'], detached: false, shell: IS_WIN });
  }

  state.proc = proc;
  emit({ pid: proc.pid });

  proc.stdout?.on('data', d => d.toString().split('\n').forEach(pushLog));
  proc.stderr?.on('data', d => d.toString().split('\n').forEach(pushLog));

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
          // Query /props for n_ctx_train so the UI can cap the context size slider
          let ctxTrain = null;
          try {
            const propsCtrl  = new AbortController();
            const propsTimer = setTimeout(() => propsCtrl.abort(), 2500);
            const propsRes   = await fetch(`http://${LLAMA_HOST}:${LLAMA_PORT}/props`, { signal: propsCtrl.signal });
            clearTimeout(propsTimer);
            if (propsRes.ok) {
              const props = await propsRes.json().catch(() => ({}));
              ctxTrain = props.n_ctx_train || null;
            }
          } catch { /* non-critical — older llama-server versions may not expose /props */ }
          emit({ status: 'ready', ctxTrain });
          return;
        }
        // Still loading weights — keep waiting
      }
      // 503 = loading model, anything else = keep waiting
    } catch { /* server not accepting connections yet — normal during startup */ }

    await sleep(POLL_INTERVAL);
  }

  const err = 'Model load timed out (3 min). The model may be too large for your hardware, or try a smaller quantization (Q4_K_M instead of Q8).';
  emit({ status: 'error', error: err });
  await stopServer({ preserveState: true }).catch(() => {});
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
