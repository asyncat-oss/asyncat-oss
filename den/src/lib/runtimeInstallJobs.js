// runtimeInstallJobs.js — background install jobs for managed runtimes
// (Piper / Whisper / stable-diffusion.cpp). Mirrors the llama engine install-job
// pattern: start returns immediately, the client polls for progress.
import { randomUUID } from 'crypto';
import { installManagedRuntime, MANAGED_RUNTIME_SPECS } from './localEngine.js';

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

export function startRuntimeInstallJob(runtimeId) {
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
  };
  jobs.set(id, job);
  activeByRuntime.set(runtimeId, id);

  installManagedRuntime(runtimeId, {
    onProgress: (p) => {
      job.progress = {
        percent: p.percent ?? job.progress.percent,
        message: p.message || job.progress.message,
        phase: p.phase || job.progress.phase,
      };
    },
  })
    .then((result) => {
      job.status = 'complete';
      job.result = result;
      job.progress = { percent: 100, message: `${MANAGED_RUNTIME_SPECS[runtimeId].label} installed`, phase: 'complete' };
    })
    .catch((err) => {
      job.status = 'error';
      job.error = err.message || 'Install failed';
    });

  return publicJob(job);
}

export function getRuntimeInstallJob(id) {
  return publicJob(jobs.get(id));
}
