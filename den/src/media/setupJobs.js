// den/src/media/setupJobs.js
// "Set up voice" and "Set up images" are a few steps in a row: engine
// installs (lib/runtimeInstallJobs.js, or an installer the step brings) and
// model downloads (modelManager.startDownload). A setup job runs them one
// after another in the backend, so it carries on when its page is closed,
// and reports one progress the screens follow live ('media.setup' events).

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { MODELS_DIR, cancelDownload, getDownloadStatus, startDownload } from '../ai/controllers/ai/modelManager.js';
import { cancelRuntimeInstallJob, getRuntimeInstallJob, isRuntimeInstallActive, startRuntimeInstallJob } from '../lib/runtimeInstallJobs.js';
import { listManagedRuntimes } from '../lib/localEngine.js';
import { publishAppEvent } from '../lib/appEvents.js';

const POLL_MS = 400;
const jobs = new Map();

function publicJob(job) {
  if (!job) return null;
  const { cancelCurrent, onComplete, ...rest } = job;
  return {
    ...rest,
    steps: job.steps.map(({ headers, check, installer, ...step }) => step),
  };
}

function publish(job) {
  publishAppEvent('media.setup', { job: publicJob(job) });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function engineFound(step) {
  try {
    if (step.check) return Boolean(await step.check());
    return Boolean(listManagedRuntimes().find((item) => item.id === step.runtimeId)?.detected);
  } catch {
    return false;
  }
}

// Engines from lib/runtimeInstallJobs.js. A step can bring its own installer
// of the same shape (the llama.cpp engine has install jobs of its own); `get`
// answers { status, progress: { percent, message, downloadedBytes,
// totalBytes }, error }.
const runtimeInstaller = {
  active: (step) => isRuntimeInstallActive(step.runtimeId),
  start: (step) => startRuntimeInstallJob(step.runtimeId),
  get: (id) => getRuntimeInstallJob(id),
  cancel: (id) => cancelRuntimeInstallJob(id),
};

async function runEngineStep(job, step) {
  if (await engineFound(step)) {
    step.status = 'skipped';
    step.detail = 'Already installed';
    return;
  }
  const installer = step.installer || runtimeInstaller;
  if (installer.active?.(step)) throw new Error(`${step.label} is already being installed. Wait for it to finish, then try again.`);
  const started = await installer.start(step);
  job.cancelCurrent = () => { try { installer.cancel(started.id); } catch { /* finished */ } };
  for (;;) {
    await sleep(POLL_MS);
    const state = installer.get(started.id);
    if (!state) throw new Error(`${step.label}: the install stopped.`);
    step.progress = state.progress?.percent ?? step.progress;
    step.detail = state.progress?.message || step.detail;
    step.downloaded = state.progress?.downloadedBytes ?? null;
    step.total = state.progress?.totalBytes ?? null;
    publish(job);
    if (state.status === 'complete') return;
    if (state.status === 'cancelled') throw Object.assign(new Error('Cancelled'), { cancelled: true });
    if (state.status === 'error') throw new Error(state.error || `${step.label} failed to install.`);
  }
}

async function runDownloadStep(job, step) {
  const target = path.join(MODELS_DIR, step.subDir || '', step.filename);
  if (fs.existsSync(target) && (!step.bytes || fs.statSync(target).size > 0)) {
    step.status = 'skipped';
    step.detail = 'Already on this computer';
    step.path = target;
    return;
  }
  const downloadId = await startDownload(step.url, step.filename, step.subDir, { headers: step.headers });
  job.cancelCurrent = () => { try { cancelDownload(downloadId); } catch { /* finished */ } };
  for (;;) {
    await sleep(POLL_MS);
    const state = getDownloadStatus(downloadId);
    if (!state) {
      // Finished downloads leave the list after a while; the file decides.
      if (fs.existsSync(target)) break;
      throw new Error(`${step.label}: the download stopped.`);
    }
    step.downloaded = state.downloaded || 0;
    step.total = state.total || step.bytes || null;
    step.progress = state.progress || 0;
    publish(job);
    if (state.status === 'complete') break;
    if (state.status === 'cancelled') throw Object.assign(new Error('Cancelled'), { cancelled: true });
    if (state.status === 'error') throw new Error(`${step.label}: ${state.error || 'the download failed'}.`);
  }
  step.path = target;
}

async function runJob(job) {
  try {
    for (const step of job.steps) {
      if (job.status === 'cancelled') return;
      job.current = step.key;
      step.status = 'running';
      step.progress = 0;
      publish(job);
      if (step.type === 'engine') await runEngineStep(job, step);
      else await runDownloadStep(job, step);
      job.cancelCurrent = null;
      if (step.status === 'running') {
        step.status = 'done';
        step.progress = 100;
      }
      publish(job);
    }
    job.current = null;
    job.result = await job.onComplete?.(job);
    job.status = 'complete';
  } catch (err) {
    const step = job.steps.find((item) => item.status === 'running');
    if (err?.cancelled || job.status === 'cancelled') {
      job.status = 'cancelled';
      if (step) step.status = 'cancelled';
    } else {
      job.status = 'error';
      job.error = err?.message || 'Setup failed.';
      if (step) {
        step.status = 'error';
        step.error = job.error;
      }
    }
  } finally {
    job.cancelCurrent = null;
    job.finishedAt = new Date().toISOString();
    publish(job);
  }
}

/**
 * Start a setup. `steps`: { key, label, type: 'engine', runtimeId, check,
 * installer } or { key, label, type: 'download', url, filename, subDir,
 * bytes, headers }.
 * `onComplete(job)` runs after the last step (save the choices) and its
 * result is kept on the job. `options` are what it was started with, kept
 * so "Try again" can start the same setup, also after a reload.
 */
export function startSetupJob({ kind, title, steps, onComplete = null, options = null }) {
  const running = [...jobs.values()].find((job) => job.kind === kind && job.status === 'running');
  if (running) throw Object.assign(new Error('A setup is already running.'), { status: 409, job: publicJob(running) });
  const job = {
    id: randomUUID(),
    kind,
    title,
    options,
    status: 'running',
    error: null,
    result: null,
    current: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: steps.map((step) => ({ status: 'waiting', progress: 0, detail: null, error: null, downloaded: null, total: step.bytes || null, ...step })),
    cancelCurrent: null,
    onComplete,
  };
  jobs.set(job.id, job);
  // Keep a few finished jobs to read back, not all of them.
  for (const [id, old] of jobs) {
    if (jobs.size <= 10) break;
    if (old.status !== 'running') jobs.delete(id);
  }
  runJob(job);
  return publicJob(job);
}

export function getSetupJob(id) {
  return publicJob(jobs.get(id));
}

/** The running setup of a kind, or the last one. */
export function latestSetupJob(kind) {
  const list = [...jobs.values()].filter((job) => job.kind === kind);
  return publicJob(list.find((job) => job.status === 'running') || list.at(-1) || null);
}

export function cancelSetupJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status !== 'running') return publicJob(job);
  job.status = 'cancelled';
  job.cancelCurrent?.();
  publish(job);
  return publicJob(job);
}
