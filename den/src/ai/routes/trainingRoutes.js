// trainingRoutes.js — REST + SSE routes for the fine-tuning subsystem
// Mounted at /api/training in index.js.

import express from 'express';
import { verifyUser as jwtVerify } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import {
  startTrainingJob,
  getTrainingJob,
  listTrainingJobs,
  stopTrainingJob,
  deleteTrainingJob,
  subscribeJob,
  startInstallJob,
  getInstallJob,
  getTrainingReadiness,
  removeTrainingVenv,
  getJobMetrics,
} from '../controllers/ai/trainingJobManager.js';
import { getDatasetsDir } from '../../agent/tools/datasetTools.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// ── Auth middleware ──────────────────────────────────────────────────────────

const authenticate = (req, res, next) => {
  jwtVerify(req, res, (err) => {
    if (err) return;
    attachDb(req, res, () => next());
  });
};

router.use(authenticate);

// ── GET /readiness — GPU, VRAM, venv, disk status ───────────────────────────

router.get('/readiness', async (req, res) => {
  try {
    const readiness = await getTrainingReadiness();
    res.json({ success: true, ...readiness });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /env/install-jobs — start training venv installation ───────────────

router.post('/env/install-jobs', (req, res) => {
  try {
    const { backend } = req.body || {};
    const job = startInstallJob({ backend: backend || 'cpu' });
    res.json({ success: true, job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /env/install-jobs/:id — poll install status ─────────────────────────

router.get('/env/install-jobs/:id', (req, res) => {
  const job = getInstallJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Install job not found' });
  res.json({ success: true, job });
});

// ── DELETE /env — uninstall training venv ────────────────────────────────────

router.delete('/env', (req, res) => {
  try {
    removeTrainingVenv();
    res.json({ success: true, message: 'Training environment removed.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /jobs — create and start a training job ────────────────────────────

router.post('/jobs', (req, res) => {
  try {
    const {
      name, baseModel, datasetPath, backend,
      epochs, lr, rank, alpha, batchSize, maxSeqLen,
    } = req.body || {};

    if (!name || !baseModel || !datasetPath) {
      return res.status(400).json({
        success: false,
        error: 'name, baseModel, and datasetPath are required.',
      });
    }

    const job = startTrainingJob({
      userId: req.user.id,
      name: String(name).slice(0, 200),
      baseModel: String(baseModel),
      datasetPath: String(datasetPath),
      backend: backend || 'cuda',
      epochs: parseInt(epochs) || 3,
      lr: parseFloat(lr) || 2e-4,
      rank: parseInt(rank) || 16,
      alpha: parseInt(alpha) || 32,
      batchSize: parseInt(batchSize) || 4,
      maxSeqLen: parseInt(maxSeqLen) || 2048,
    });

    res.json({ success: true, job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── GET /jobs — list training jobs ──────────────────────────────────────────

router.get('/jobs', (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const jobs = listTrainingJobs(req.user.id, limit);
    res.json({ success: true, jobs, count: jobs.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /jobs/:id — get a single job ────────────────────────────────────────

router.get('/jobs/:id', (req, res) => {
  const job = getTrainingJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ success: true, job });
});

// ── GET /jobs/:id/metrics — full metrics history for charts ─────────────────

router.get('/jobs/:id/metrics', (req, res) => {
  const metrics = getJobMetrics(req.params.id, req.user.id);
  if (metrics === null) return res.status(404).json({ success: false, error: 'Job not found' });
  res.json({ success: true, metrics, count: metrics.length });
});

// ── GET /datasets — local JSONL datasets for the dataset picker ─────────────

router.get('/datasets', (req, res) => {
  try {
    const dir = getDatasetsDir();
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
      .map(f => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        return {
          filename: f,
          path: full,
          sizeMb: +(stat.size / 1024 / 1024).toFixed(2),
          modifiedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    res.json({ success: true, datasetsDir: dir, files, count: files.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /jobs/:id/stream — SSE live progress ────────────────────────────────

router.get('/jobs/:id/stream', (req, res) => {
  const job = getTrainingJob(req.params.id, req.user.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Send current state immediately
  res.write(`data: ${JSON.stringify({ type: 'snapshot', job })}\n\n`);

  // Subscribe to live updates
  const unsubscribe = subscribeJob(req.params.id, (payload) => {
    if (res.destroyed || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    res.flush?.();
  });

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    res.write(': ping\n\n');
    res.flush?.();
  }, 30000);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// ── POST /jobs/:id/stop — cancel a running job ─────────────────────────────

router.post('/jobs/:id/stop', (req, res) => {
  try {
    const stopped = stopTrainingJob(req.params.id, req.user.id);
    res.json({ success: stopped });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /jobs/:id — delete a job record ──────────────────────────────────

router.delete('/jobs/:id', (req, res) => {
  try {
    const deleted = deleteTrainingJob(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Job not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
