// trainingJobManager.js — Training job lifecycle controller
// Spawns train_lora.py, captures JSON-line progress from stdout, persists
// state to the training_jobs DB table, and provides SSE subscribers for
// live frontend updates.

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../../../db/client.js';
import {
  managedTrainingPythonPath,
  trainingOutputDir,
  installTrainingVenv,
  isTrainingEnvReady,
  getTrainingReadiness,
  removeTrainingVenv,
} from '../../../lib/trainingEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TRAIN_SCRIPT = path.join(__dirname, 'scripts', 'train_lora.py');

// ── In-memory state ─────────────────────────────────────────────────────────

/** Active training processes keyed by job ID */
const activeJobs = new Map();

/** SSE subscribers per job: jobId → Set<(payload) => void> */
const sseSubscribers = new Map();

/** In-memory install jobs (mirrors llamaServerManager pythonInstallJobs) */
const installJobs = new Map();

// ── Prepared statements ─────────────────────────────────────────────────────

const stmts = {
  insert: db.prepare(`
    INSERT INTO training_jobs (id, user_id, name, base_model, dataset_path,
      method, backend, hyperparams, status, progress, output_dir)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', '{}', ?)
  `),
  get: db.prepare('SELECT * FROM training_jobs WHERE id = ?'),
  getForUser: db.prepare('SELECT * FROM training_jobs WHERE id = ? AND user_id = ?'),
  list: db.prepare('SELECT * FROM training_jobs WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?'),
  updateStatus: db.prepare(`
    UPDATE training_jobs SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),
  updateProgress: db.prepare(`
    UPDATE training_jobs SET progress = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),
  updateError: db.prepare(`
    UPDATE training_jobs SET status = 'failed', error = ?,
      completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),
  updateComplete: db.prepare(`
    UPDATE training_jobs SET status = 'completed', output_dir = ?, checkpoint_dir = ?,
      completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),
  updateStarted: db.prepare(`
    UPDATE training_jobs SET status = 'running',
      started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),
  updateCancelled: db.prepare(`
    UPDATE training_jobs SET status = 'cancelled',
      completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),
  updateCheckpoint: db.prepare(`
    UPDATE training_jobs SET checkpoint_dir = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `),
  delete: db.prepare('DELETE FROM training_jobs WHERE id = ? AND user_id = ?'),
  recoverRunning: db.prepare(`
    UPDATE training_jobs SET status = 'failed',
      error = 'Job interrupted by backend restart.',
      completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE status IN ('queued', 'running')
  `),
  insertMetric: db.prepare(`
    INSERT INTO training_metrics (job_id, step, loss, lr, grad_norm, perplexity, gpu_mem_gb, gpu_util_pct, cpu_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  listMetrics: db.prepare('SELECT * FROM training_metrics WHERE job_id = ? ORDER BY step ASC'),
};

// ── SSE helpers ─────────────────────────────────────────────────────────────

function notifySubscribers(jobId, payload) {
  const subs = sseSubscribers.get(jobId);
  if (!subs || subs.size === 0) return;
  for (const fn of subs) {
    try { fn(payload); } catch { /* subscriber error */ }
  }
}

export function subscribeJob(jobId, fn) {
  if (!sseSubscribers.has(jobId)) sseSubscribers.set(jobId, new Set());
  sseSubscribers.get(jobId).add(fn);
  return () => {
    const set = sseSubscribers.get(jobId);
    if (set) {
      set.delete(fn);
      if (set.size === 0) sseSubscribers.delete(jobId);
    }
  };
}

// ── Recovery ────────────────────────────────────────────────────────────────

export function recoverTrainingJobs() {
  try {
    const result = stmts.recoverRunning.run();
    return result.changes || 0;
  } catch (e) {
    console.warn('[training] Recovery failed:', e.message);
    return 0;
  }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export function getTrainingJob(id, userId = null) {
  const row = userId ? stmts.getForUser.get(id, userId) : stmts.get.get(id);
  if (!row) return null;
  return formatJob(row);
}

export function listTrainingJobs(userId, limit = 50) {
  const rows = stmts.list.all(userId, Math.min(limit, 200));
  return rows.map(formatJob);
}

export function deleteTrainingJob(id, userId) {
  // Stop if running
  if (activeJobs.has(id)) {
    stopTrainingJob(id, userId);
  }
  const result = stmts.delete.run(id, userId);
  return result.changes > 0;
}

export function getJobMetrics(id, userId) {
  // Ownership check — reuse getTrainingJob's user scoping rather than joining.
  if (!stmts.getForUser.get(id, userId)) return null;
  return stmts.listMetrics.all(id).map(row => ({
    step: row.step,
    loss: row.loss,
    lr: row.lr,
    gradNorm: row.grad_norm,
    perplexity: row.perplexity,
    gpuMemGb: row.gpu_mem_gb,
    gpuUtilPct: row.gpu_util_pct,
    cpuPct: row.cpu_pct,
    createdAt: row.created_at,
  }));
}

function formatJob(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    baseModel: row.base_model,
    datasetPath: row.dataset_path,
    method: row.method,
    backend: row.backend,
    hyperparams: safeJsonParse(row.hyperparams, {}),
    status: row.status,
    progress: safeJsonParse(row.progress, {}),
    outputDir: row.output_dir,
    checkpointDir: row.checkpoint_dir,
    diskUsageBytes: row.disk_usage_bytes,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str || '{}'); } catch { return fallback; }
}

// ── Start a training job ────────────────────────────────────────────────────

export function startTrainingJob({
  userId,
  name,
  baseModel,
  datasetPath,
  backend = 'cuda',
  epochs = 3,
  lr = 2e-4,
  rank = 16,
  alpha = 32,
  batchSize = 4,
  maxSeqLen = 2048,
}) {
  // Validate dataset exists
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset file not found: ${datasetPath}`);
  }

  // Validate python venv
  const python = managedTrainingPythonPath();
  if (!fs.existsSync(python)) {
    throw new Error('Training environment not installed. Install it first from the Training page.');
  }

  const id = randomUUID();
  const outputDir = path.join(trainingOutputDir(), `${id.slice(0, 8)}-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`);
  const hyperparams = { epochs, lr, rank, alpha, batchSize, maxSeqLen };

  // Insert DB row
  stmts.insert.run(id, userId, name, baseModel, datasetPath, 'lora', backend, JSON.stringify(hyperparams), outputDir);

  // Spawn Python process
  const proc = spawn(python, [
    TRAIN_SCRIPT,
    '--model', baseModel,
    '--dataset', datasetPath,
    '--output-dir', outputDir,
    '--backend', backend,
    '--epochs', String(epochs),
    '--lr', String(lr),
    '--rank', String(rank),
    '--alpha', String(alpha),
    '--batch-size', String(batchSize),
    '--max-seq-len', String(maxSeqLen),
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env },
  });

  activeJobs.set(id, { proc, outputDir });
  stmts.updateStarted.run(id);

  // ── Capture stdout (JSON lines) ─────────────────────────────────────────
  let stdoutBuffer = '';
  let lastDbWrite = 0;

  proc.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const payload = JSON.parse(line);
        // Notify SSE subscribers immediately
        notifySubscribers(id, payload);

        // Batch DB writes: every 10 steps (progress type) or always for status/error/complete
        if (payload.type === 'progress') {
          // Python already throttles emission to ~every 10 steps, so every
          // received point is cheap to persist — this is what feeds the charts.
          try {
            stmts.insertMetric.run(
              id, payload.step ?? 0, payload.loss ?? null, payload.lr ?? null,
              payload.gradNorm ?? null, payload.perplexity ?? null,
              payload.gpuMemGb ?? null, payload.gpuUtilPct ?? null, payload.cpuPct ?? null,
            );
          } catch { /* non-fatal — metrics history is a nice-to-have */ }

          const now = Date.now();
          if (now - lastDbWrite > 3000) { // Write the latest-snapshot column at most every 3 seconds
            lastDbWrite = now;
            stmts.updateProgress.run(JSON.stringify(payload), id);
          }
        } else if (payload.type === 'complete') {
          const finalDir = payload.outputDir || outputDir;
          stmts.updateComplete.run(finalDir, finalDir, id);
          notifySubscribers(id, { type: 'job_complete', ...payload });
        } else if (payload.type === 'stopped') {
          const checkpointDir = payload.checkpointDir || null;
          if (checkpointDir) stmts.updateCheckpoint.run(checkpointDir, id);
          stmts.updateCancelled.run(id);
          notifySubscribers(id, { type: 'job_stopped', ...payload });
        } else if (payload.type === 'error') {
          stmts.updateError.run(payload.message || 'Training failed', id);
          notifySubscribers(id, { type: 'job_error', ...payload });
        }
      } catch {
        // Not valid JSON — log line from Python, ignore
      }
    }
  });

  // ── Capture stderr ────────────────────────────────────────────────────────
  let stderrBuf = '';
  proc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
    // Only keep last 4KB of stderr for error reporting
    if (stderrBuf.length > 4096) {
      stderrBuf = stderrBuf.slice(-4096);
    }
  });

  // ── Process exit ──────────────────────────────────────────────────────────
  proc.on('exit', (code, signal) => {
    activeJobs.delete(id);

    // Check current status — it may already be set to completed/cancelled
    const row = stmts.get.get(id);
    if (row && (row.status === 'running' || row.status === 'queued')) {
      if (code === 0) {
        // If we haven't received a JSON "complete" event, mark complete anyway
        stmts.updateComplete.run(outputDir, outputDir, id);
        notifySubscribers(id, { type: 'job_complete', outputDir });
      } else {
        const errMsg = classifyTrainingError(stderrBuf, code);
        stmts.updateError.run(errMsg, id);
        notifySubscribers(id, { type: 'job_error', message: errMsg, code: 'PROCESS_EXIT' });
      }
    }

    // Clean up subscribers after a delay
    setTimeout(() => {
      sseSubscribers.delete(id);
    }, 10000);
  });

  proc.on('error', (err) => {
    activeJobs.delete(id);
    stmts.updateError.run(`Process spawn failed: ${err.message}`, id);
    notifySubscribers(id, { type: 'job_error', message: err.message, code: 'SPAWN_ERROR' });
  });

  return getTrainingJob(id);
}

// ── Stop a training job (graceful SIGTERM → SIGKILL) ────────────────────────

export function stopTrainingJob(id, userId = null) {
  const entry = activeJobs.get(id);
  if (!entry) {
    // Not running in memory — just update DB
    const row = userId ? stmts.getForUser.get(id, userId) : stmts.get.get(id);
    if (row && (row.status === 'queued' || row.status === 'running')) {
      stmts.updateCancelled.run(id);
    }
    return true;
  }

  const { proc } = entry;

  // Send SIGTERM (the Python script will save checkpoint and exit)
  try {
    proc.kill('SIGTERM');
  } catch { /* already dead */ }

  // If still alive after 15s, force kill (training checkpoint save can be slow)
  setTimeout(() => {
    try {
      if (!proc.killed) proc.kill('SIGKILL');
    } catch { /* already dead */ }
  }, 15000);

  return true;
}

// ── Stop all active training (for shutdown) ─────────────────────────────────

export async function stopAllTraining() {
  const promises = [];
  for (const [id, { proc }] of activeJobs) {
    try {
      proc.kill('SIGTERM');
      promises.push(
        new Promise(resolve => {
          proc.on('exit', resolve);
          setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch {}
            resolve();
          }, 5000);
        })
      );
    } catch { /* already dead */ }
  }
  if (promises.length > 0) {
    await Promise.all(promises);
  }
}

// ── Install job management (in-memory, mirrors llamaServerManager) ──────────

export function startInstallJob({ backend = 'cpu' }) {
  const jobId = randomUUID();
  const job = {
    id: jobId,
    status: 'running',
    phase: 'starting',
    message: 'Starting training environment installation…',
    percent: 0,
    error: null,
    backend,
    startedAt: new Date().toISOString(),
  };
  installJobs.set(jobId, job);

  // Run install in background
  (async () => {
    try {
      await installTrainingVenv({
        backend,
        onProgress: (update) => {
          Object.assign(job, update);
          if (update.percent) job.percent = update.percent;
        },
      });
      job.status = 'complete';
      job.percent = 100;
      job.message = 'Training environment installed successfully.';
    } catch (err) {
      job.status = 'error';
      job.error = err.message;
      job.message = `Installation failed: ${err.message}`;
    }
  })();

  return job;
}

export function getInstallJob(jobId) {
  return installJobs.get(jobId) || null;
}

// ── Error classification ────────────────────────────────────────────────────

function classifyTrainingError(stderr, exitCode) {
  const text = stderr || '';
  if (/out of memory|CUDA error.*out of memory|torch\.cuda\.OutOfMemoryError/i.test(text)) {
    return 'OOM: Out of GPU memory. Try: smaller batch_size (1), lower rank (8), shorter max_seq_len (512), or a smaller model.';
  }
  if (/ModuleNotFoundError|ImportError/i.test(text)) {
    const match = text.match(/No module named ['"]([^'"]+)['"]/);
    return `IMPORT: Missing Python module${match ? `: ${match[1]}` : ''}. Try reinstalling the training environment.`;
  }
  if (/KeyError|ValueError.*column/i.test(text)) {
    return 'DATASET: Dataset format error — the dataset columns could not be mapped. Check the JSONL format.';
  }
  if (/FileNotFoundError/i.test(text)) {
    return 'FILE: A required file was not found. The model or dataset may have been moved.';
  }
  if (/ConnectionError|HTTPError|requests\.exceptions/i.test(text)) {
    return 'NETWORK: Network error while downloading the model. Check your internet connection.';
  }
  if (/killed|signal 9/i.test(text)) {
    return 'KILLED: Training process was killed (likely by the OS OOM killer). The model is too large for available memory.';
  }
  // Return last few lines of stderr
  const lastLines = text.trim().split('\n').slice(-3).join(' ').slice(0, 300);
  return `Training exited (code=${exitCode}). ${lastLines || 'No error details available.'}`;
}

// ── Readiness (re-export for convenience) ───────────────────────────────────

export { getTrainingReadiness, isTrainingEnvReady, removeTrainingVenv };
