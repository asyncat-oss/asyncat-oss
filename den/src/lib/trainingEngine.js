// trainingEngine.js — Training / fine-tuning Python venv manager
// Creates and manages a SEPARATE Python virtual environment for LoRA training.
// Venv lives at ~/.asyncat/training/python (NOT the llama.cpp venv) to avoid
// dependency conflicts between inference and training stacks.
//
// GPU-aware pip install:
//   NVIDIA  → torch (CUDA wheel), transformers, peft, trl, datasets, accelerate,
//             bitsandbytes, + best-effort unsloth
//   Apple   → mlx-lm
//   CPU     → torch (CPU wheel), transformers, peft, trl, datasets, accelerate

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execFile, exec } from 'child_process';
import { promisify } from 'util';
import { asyncatHome } from './localEngine.js';
import { detectGpuInfo } from '../ai/controllers/ai/llamaServerManager.js';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const isWin = process.platform === 'win32';

// ── Streaming subprocess helper (non-blocking) ────────────────────────────────
// All venv/pip operations MUST run through this instead of a *Sync child_process
// call. Node is single-threaded — a blocking exec*Sync call here freezes the
// entire backend (HTTP server, health checks, everything) for the call's full
// duration, which for `pip install torch` can be many minutes.

// Strips ANSI escape codes (color/cursor control) that pip's rich progress
// bars emit — without this, raw escape sequences leak into the UI as text.
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

function runCommandStreaming(cmd, args, options = {}, timeoutMs = 120000, onLine = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Timed out: ${cmd} ${args.join(' ')}`)); }, timeoutMs);
    const onChunk = (chunk) => {
      if (!onLine) return;
      // pip redraws its progress bar in place with \r (no \n), so split on
      // both to get each redraw as its own "line".
      chunk.toString().replace(ANSI_RE, '').split(/[\r\n]+/)
        .filter(l => l.trim()).forEach(l => onLine(l.trim()));
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

// ── Path helpers ──────────────────────────────────────────────────────────────

export function managedTrainingDir() {
  return path.join(asyncatHome(), 'training');
}

export function managedTrainingPythonDir() {
  return path.join(managedTrainingDir(), 'python');
}

export function managedTrainingPythonPath() {
  if (isWin) return path.join(managedTrainingPythonDir(), 'Scripts', 'python.exe');
  return path.join(managedTrainingPythonDir(), 'bin', 'python');
}

export function trainingOutputDir() {
  const dir = path.join(managedTrainingDir(), 'outputs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Backend detection ─────────────────────────────────────────────────────────

export function detectTrainingBackend(gpu) {
  if (!gpu) return 'cpu';
  if (gpu.vendor === 'NVIDIA') return 'cuda';
  if (gpu.vendor === 'Apple') return 'mlx';
  // AMD ROCm is out of v1 scope — treat as CPU with a warning
  return 'cpu';
}

// ── Venv readiness check ──────────────────────────────────────────────────────

export async function isTrainingEnvReady(backend = null) {
  const python = managedTrainingPythonPath();
  if (!fs.existsSync(python)) return false;

  try {
    const checkImport = backend === 'mlx' ? 'import mlx_lm' : 'import transformers, peft, trl';
    await execFileAsync(python, ['-c', checkImport], { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

// ── Disk space check ──────────────────────────────────────────────────────────

export async function checkDiskSpace(targetPath = null) {
  const checkPath = targetPath || asyncatHome();
  try {
    if (isWin) {
      const drive = path.parse(path.resolve(checkPath)).root;
      const { stdout: out } = await execAsync(
        `wmic logicaldisk where DeviceID="${drive.replace('\\', '')}" get FreeSpace /format:value`,
        { timeout: 5000 }
      );
      const match = out.match(/FreeSpace=(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    }
    const { stdout } = await execFileAsync('df', ['-B1', '--output=avail', path.resolve(checkPath)], { timeout: 5000 });
    const lines = (stdout || '').trim().split('\n');
    const last = lines[lines.length - 1]?.trim();
    return last ? parseInt(last, 10) : null;
  } catch {
    return null;
  }
}

// ── Full readiness report ─────────────────────────────────────────────────────

export async function getTrainingReadiness() {
  const gpu = await detectGpuInfo();
  const backend = detectTrainingBackend(gpu);
  const envReady = await isTrainingEnvReady(backend);
  const python = managedTrainingPythonPath();
  const venvExists = fs.existsSync(python);
  const freeBytes = await checkDiskSpace();
  const freeGb = freeBytes ? +(freeBytes / 1e9).toFixed(1) : null;

  // Estimate venv install size
  const estimatedVenvSizeGb = backend === 'cuda' ? 8 : backend === 'mlx' ? 2 : 4;
  const diskOk = freeGb === null || freeGb > estimatedVenvSizeGb + 2; // +2GB headroom

  // VRAM warnings
  let vramWarning = null;
  if (backend === 'cuda' && gpu?.vramGb) {
    if (gpu.vramGb < 4) {
      vramWarning = 'Less than 4GB VRAM detected. Only very small models (<1B) are practical for training. Consider using a cloud GPU service.';
    } else if (gpu.vramGb < 6) {
      vramWarning = 'Less than 6GB VRAM detected. Only small models (1-3B) with 4-bit QLoRA are realistic.';
    } else if (gpu.vramGb < 8) {
      vramWarning = '6-8GB VRAM: 7B models with 4-bit QLoRA should work, but larger models will need more VRAM.';
    }
  }

  let cpuWarning = null;
  if (backend === 'cpu') {
    cpuWarning = 'No GPU detected. CPU training is extremely slow — useful only for testing the pipeline with tiny models (<1B). For real training, use a machine with an NVIDIA GPU.';
  }

  return {
    gpu: gpu ? { vendor: gpu.vendor, name: gpu.name, vramGb: gpu.vramGb ?? null } : null,
    backend,
    envReady,
    venvExists,
    pythonPath: python,
    disk: {
      freeGb,
      estimatedVenvSizeGb,
      ok: diskOk,
    },
    warnings: [vramWarning, cpuWarning].filter(Boolean),
    canInstall: diskOk,
    canTrain: envReady && diskOk,
  };
}

// ── Find system Python ────────────────────────────────────────────────────────

async function findSystemPython() {
  const candidates = isWin
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const { stdout } = await execFileAsync(cmd, ['--version'], { timeout: 5000 });
      // Verify it's Python 3.9+
      const match = (stdout || '').match(/Python (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        if (major >= 3 && minor >= 9) return cmd;
      }
    } catch { /* skip */ }
  }
  return null;
}

// ── Venv installation ─────────────────────────────────────────────────────────

export async function installTrainingVenv({ backend = 'cpu', onProgress = null } = {}) {
  const pythonCmd = await findSystemPython();
  if (!pythonCmd) {
    throw new Error('Python 3.9+ is required but not found. Install Python from python.org and try again.');
  }

  const venvDir = managedTrainingPythonDir();
  const streamLine = (phase) => (line) => onProgress?.({ phase, message: line.slice(0, 140) });

  onProgress?.({ phase: 'creating_venv', message: 'Creating Python virtual environment…', percent: 5 });
  fs.mkdirSync(path.dirname(venvDir), { recursive: true });
  await runCommandStreaming(pythonCmd, ['-m', 'venv', venvDir], {}, 120000);

  const python = managedTrainingPythonPath();
  if (!fs.existsSync(python)) {
    throw new Error(`Failed to create Python venv at ${venvDir}`);
  }

  onProgress?.({ phase: 'upgrading_pip', message: 'Upgrading pip…', percent: 10 });
  await runCommandStreaming(python, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'], {}, 120000);

  if (backend === 'mlx') {
    onProgress?.({ phase: 'installing', message: 'Installing mlx-lm for Apple Silicon training…', percent: 20 });
    await runCommandStreaming(python, ['-m', 'pip', 'install', 'mlx-lm'], {}, 600000, streamLine('installing'));
    onProgress?.({ phase: 'complete', message: 'MLX training environment ready.', percent: 100 });
    return { python, backend: 'mlx' };
  }

  // CUDA or CPU path
  const packages = ['transformers', 'peft', 'trl', 'datasets', 'accelerate', 'safetensors'];

  if (backend === 'cuda') {
    onProgress?.({ phase: 'installing_torch', message: 'Installing PyTorch with CUDA support…', percent: 15 });
    try {
      await runCommandStreaming(python, [
        '-m', 'pip', 'install', 'torch',
        '--index-url', 'https://download.pytorch.org/whl/cu124',
      ], {}, 1800000, streamLine('installing_torch'));
    } catch (err) {
      // Fallback 1: Try standard PyPI install (pip install torch)
      onProgress?.({ phase: 'installing_torch', message: 'CUDA wheel index failed. Trying standard PyPI index…', percent: 25 });
      try {
        await runCommandStreaming(python, ['-m', 'pip', 'install', 'torch'], {}, 1800000, streamLine('installing_torch'));
      } catch (err2) {
        throw new Error('Failed to install PyTorch. Make sure your Python version is supported by PyTorch and you have an active internet connection.');
      }
    }

    onProgress?.({ phase: 'installing_training', message: 'Installing training libraries (transformers, peft, trl)…', percent: 50 });
    await runCommandStreaming(python, ['-m', 'pip', 'install', ...packages, 'bitsandbytes'], {}, 600000, streamLine('installing_training'));

    // Best-effort Unsloth — don't fail if it doesn't install
    onProgress?.({ phase: 'installing_unsloth', message: 'Installing Unsloth (optional, for faster training)…', percent: 80 });
    try {
      await runCommandStreaming(python, ['-m', 'pip', 'install', 'unsloth'], {}, 300000, streamLine('installing_unsloth'));
      onProgress?.({ phase: 'complete', message: 'CUDA training environment ready (with Unsloth).', percent: 100 });
      return { python, backend: 'cuda', unsloth: true };
    } catch {
      // Unsloth failed — not fatal, plain transformers+peft+trl still works
      onProgress?.({ phase: 'complete', message: 'CUDA training environment ready (without Unsloth — plain transformers+peft+trl).', percent: 100 });
      return { python, backend: 'cuda', unsloth: false };
    }
  }

  // CPU fallback
  onProgress?.({ phase: 'installing_torch', message: 'Installing PyTorch (CPU-only)…', percent: 15 });
  try {
    await runCommandStreaming(python, [
      '-m', 'pip', 'install', 'torch',
      '--index-url', 'https://download.pytorch.org/whl/cpu',
    ], {}, 1200000, streamLine('installing_torch'));
  } catch (err) {
    // Fallback 1: Try standard PyPI install (pip install torch)
    onProgress?.({ phase: 'installing_torch', message: 'CPU wheel index failed. Trying standard PyPI index…', percent: 25 });
    try {
      await runCommandStreaming(python, ['-m', 'pip', 'install', 'torch'], {}, 1200000, streamLine('installing_torch'));
    } catch (err2) {
      throw new Error('Failed to install PyTorch (CPU). Make sure you have an active internet connection.');
    }
  }

  onProgress?.({ phase: 'installing_training', message: 'Installing training libraries…', percent: 50 });
  await runCommandStreaming(python, ['-m', 'pip', 'install', ...packages], {}, 600000, streamLine('installing_training'));

  onProgress?.({ phase: 'complete', message: 'CPU training environment ready. Note: CPU training is very slow.', percent: 100 });
  return { python, backend: 'cpu' };
}

// ── Uninstall venv ────────────────────────────────────────────────────────────

export function removeTrainingVenv() {
  const venvDir = managedTrainingPythonDir();
  if (fs.existsSync(venvDir)) {
    fs.rmSync(venvDir, { recursive: true, force: true });
  }
}
