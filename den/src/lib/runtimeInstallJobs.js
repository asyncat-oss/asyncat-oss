// runtimeInstallJobs.js — background install jobs for managed runtimes
// (Piper / Whisper / stable-diffusion.cpp / MLX). Mirrors the llama engine install-job
// pattern: start returns immediately, the client polls for progress.
import { randomUUID } from 'crypto';
import { installManagedRuntime, MANAGED_RUNTIME_SPECS } from './localEngine.js';
import { invalidateSystemDependencyCache } from './systemDeps.js';

const jobs = new Map();            // jobId -> job
const activeByRuntime = new Map(); // runtimeId -> jobId

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    runtime: job.runtime,
    status: job.status,
    progress: job.progress,
    error: job.error,
    result: job.result,
  };
}

/**
 * Start installing a runtime in the background.
 *   beforeSwap()   runs right before the new copy replaces the old one (stop
 *                  what runs from it); until then everything keeps working
 *   afterFinish()  runs when the job ends, however it ends (start it again)
 */
export function startRuntimeInstallJob(runtimeId, { beforeSwap = null, afterFinish = null } = {}) {
  if (!MANAGED_RUNTIME_SPECS[runtimeId]) {
    throw new Error(`Unknown runtime: ${runtimeId}`);
  }

  const existingId = activeByRuntime.get(runtimeId);
  const existing = existingId ? jobs.get(existingId) : null;
  if (existing && (existing.status === 'queued' || existing.status === 'running')) {
    throw new Error(`A ${runtimeId} install is already running.`);
  }

  const id = randomUUID();
  const job = {
    id,
    runtime: runtimeId,
    status: 'running',
    progress: { percent: 0, message: 'Starting…', phase: 'resolving' },
    error: null,
    result: null,
    createdAt: Date.now(),
    abort: new AbortController(),
  };
  jobs.set(id, job);
  activeByRuntime.set(runtimeId, id);

  installManagedRuntime(runtimeId, {
    signal: job.abort.signal,
    beforeSwap,
    onProgress: (p) => {
      const phase = p.phase || job.progress.phase;
      job.progress = {
        percent: p.percent ?? job.progress.percent,
        message: p.message || job.progress.message,
        phase,
        // Bytes so far and in total while something downloads.
        downloadedBytes: phase === 'downloading' ? (p.downloadedBytes ?? job.progress.downloadedBytes ?? null) : null,
        totalBytes: phase === 'downloading' ? (p.totalBytes ?? job.progress.totalBytes ?? null) : null,
      };
    },
  })
    .then((result) => {
      job.status = 'complete';
      job.result = result;
      job.progress = { percent: 100, message: `${MANAGED_RUNTIME_SPECS[runtimeId].label} installed`, phase: 'complete' };
    })
    .catch((err) => {
      if (err?.cancelled) {
        job.status = 'cancelled';
        job.error = null;
        job.progress = { ...job.progress, message: 'Install cancelled', phase: 'cancelled', downloadedBytes: null, totalBytes: null };
        return;
      }
      job.status = 'error';
      job.error = err.message || 'Install failed';
    })
    .finally(() => {
      invalidateSystemDependencyCache();
      Promise.resolve(afterFinish?.()).catch((error) => {
        console.warn(`[runtime] Could not start ${runtimeId} again after its install:`, error.message);
      });
    });

  return publicJob(job);
}

export function getRuntimeInstallJob(id) {
  return publicJob(jobs.get(id));
}

/**
 * Stop a running install. A download in progress keeps its partial file, so
 * installing again continues it; the installed copy is never touched.
 */
export function cancelRuntimeInstallJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status !== 'queued' && job.status !== 'running') {
    throw Object.assign(new Error('This install has already finished.'), { code: 'NOT_RUNNING' });
  }
  job.progress = { ...job.progress, message: 'Cancelling…' };
  job.abort.abort();
  return publicJob(job);
}

/** Stop every running install (used when the backend shuts down). */
export function cancelAllRuntimeInstallJobs() {
  for (const job of jobs.values()) {
    if (job.status === 'queued' || job.status === 'running') job.abort.abort();
  }
}

/** The install running for a runtime, or null, so a page can pick it up again. */
export function activeRuntimeInstallJob(runtimeId) {
  const id = activeByRuntime.get(runtimeId);
  const job = id ? jobs.get(id) : null;
  return job && (job.status === 'queued' || job.status === 'running') ? publicJob(job) : null;
}

export function isRuntimeInstallActive(runtimeId) {
  return Boolean(activeRuntimeInstallJob(runtimeId));
}
