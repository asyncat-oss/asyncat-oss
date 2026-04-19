// providerRoutes.js — AI provider management API
// GET  /api/ai/providers/stats              — hardware stats
// GET  /api/ai/providers/local-models/*     — downloaded model management
// POST /api/ai/providers/server/*           — built-in llama.cpp server control

import express from 'express';
import { verifyUser } from '../../auth/authMiddleware.js';
import { getProviderStats } from '../controllers/ai/providerManager.js';
import {
  listModels,
  deleteModel,
  startDownload,
  cancelDownload,
  getDownloadStatus,
  listActiveDownloads,
  getStorageInfo,
  MODELS_DIR,
} from '../controllers/ai/modelManager.js';
import {
  startServer,
  stopServer,
  getStatus as getLlamaStatus,
  checkBinary,
  subscribe as llamaSubscribe,
} from '../controllers/ai/llamaServerManager.js';
import db from '../../db/client.js';

const LLAMA_BASE_URL = `http://127.0.0.1:${process.env.LLAMA_SERVER_PORT ?? '8765'}/v1`;

const router = express.Router();

router.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
  });
  next();
});

// ── GET /stats — hardware stats ───────────────────────────────────────────────
router.get('/stats', verifyUser, async (req, res) => {
  try {
    const stats = await getProviderStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error('Provider stats error:', err);
    res.status(500).json({ success: false, error: 'Failed to get hardware stats' });
  }
});

// ── GET /config — get user provider config ──────────────────────────────────
router.get('/config', verifyUser, (req, res) => {
  try {
    const row = db.prepare('SELECT provider_type, provider_id, base_url, model FROM ai_provider_config WHERE user_id = ?').get(req.user.id);
    if (row) {
      res.json(row);
    } else {
      res.json({ provider_type: 'local', provider_id: 'llamacpp-builtin', base_url: '', model: '' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MODEL MANAGER ROUTES — /api/ai/providers/local-models/*
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /local-models — list all downloaded models ────────────────────────────
router.get('/local-models', verifyUser, (req, res) => {
  try {
    const models = listModels();
    const storage = getStorageInfo();
    res.json({ success: true, models, storage });
  } catch (err) {
    console.error('List local models error:', err);
    res.status(500).json({ success: false, error: 'Failed to list models' });
  }
});

// ── GET /local-models/storage — disk usage info ───────────────────────────────
router.get('/local-models/storage', verifyUser, (req, res) => {
  try {
    const storage = getStorageInfo();
    res.json({ success: true, ...storage });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to get storage info' });
  }
});

// ── DELETE /local-models/:filename — delete a model file ─────────────────────
router.delete('/local-models/:filename', verifyUser, (req, res) => {
  try {
    const { filename } = req.params;
    deleteModel(filename);
    res.json({ success: true, message: `Deleted ${filename}` });
  } catch (err) {
    console.error('Delete model error:', err);
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    res.status(500).json({ success: false, error: 'Failed to delete model' });
  }
});

// ── POST /local-models/download — start a model download ─────────────────────
router.post('/local-models/download', verifyUser, async (req, res) => {
  try {
    const { url, filename } = req.body;

    if (!url || !filename) {
      return res.status(400).json({ success: false, error: 'url and filename are required' });
    }

    try { new URL(url); } catch {
      return res.status(400).json({ success: false, error: 'Invalid URL' });
    }

    const downloadId = await startDownload(url, filename);
    res.json({ success: true, downloadId, message: 'Download started' });
  } catch (err) {
    console.error('Start download error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to start download' });
  }
});

// ── GET /local-models/downloads — list active downloads ──────────────────────
router.get('/local-models/downloads', verifyUser, (req, res) => {
  try {
    const downloads = listActiveDownloads();
    res.json({ success: true, downloads });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list downloads' });
  }
});

// ── GET /local-models/downloads/:downloadId — get download status ─────────────
router.get('/local-models/downloads/:downloadId', verifyUser, (req, res) => {
  try {
    const status = getDownloadStatus(req.params.downloadId);
    if (!status) {
      return res.status(404).json({ success: false, error: 'Download not found' });
    }
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to get download status' });
  }
});

// ── DELETE /local-models/downloads/:downloadId — cancel a download ────────────
router.delete('/local-models/downloads/:downloadId', verifyUser, (req, res) => {
  try {
    cancelDownload(req.params.downloadId);
    res.json({ success: true, message: 'Download cancelled' });
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ success: false, error: err.message });
    }
    res.status(500).json({ success: false, error: 'Failed to cancel download' });
  }
});

// ── GET /local-models/downloads/:downloadId/stream — SSE progress stream ──────
router.get('/local-models/downloads/:downloadId/stream', async (req, res) => {
  const { downloadId } = req.params;
  const { verifyUser: _verify } = await import('../../auth/authMiddleware.js');

  const tokenFromQuery = req.query.token;
  if (tokenFromQuery && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${tokenFromQuery}`;
  }

  let authed = false;
  await new Promise((resolve) => {
    _verify(req, res, (err) => {
      if (!err) authed = true;
      resolve();
    });
  });

  if (!authed) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const interval = setInterval(() => {
    const status = getDownloadStatus(downloadId);
    if (!status) {
      sendEvent({ type: 'error', error: 'Download not found' });
      clearInterval(interval);
      res.end();
      return;
    }
    sendEvent({ type: 'progress', ...status });
    if (status.status === 'complete' || status.status === 'error' || status.status === 'cancelled') {
      clearInterval(interval);
      setTimeout(() => res.end(), 500);
    }
  }, 500);

  req.on('close', () => clearInterval(interval));
});

// ══════════════════════════════════════════════════════════════════════════════
// BUILT-IN LLAMA.CPP SERVER ROUTES — /api/ai/providers/server/*
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /server/check — does llama-server binary exist? ───────────────────────
router.get('/server/check', verifyUser, async (req, res) => {
  try {
    const result = await checkBinary();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /server/status — current server state ─────────────────────────────────
router.get('/server/status', verifyUser, (req, res) => {
  res.json({ success: true, ...getLlamaStatus() });
});

// ── GET /server/status/stream — SSE stream while model is loading ─────────────
router.get('/server/status/stream', async (req, res) => {
  const { verifyUser: _verify } = await import('../../auth/authMiddleware.js');
  const tokenFromQuery = req.query.token;
  if (tokenFromQuery && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${tokenFromQuery}`;
  }

  let authed = false;
  await new Promise(resolve => {
    _verify(req, res, err => { if (!err) authed = true; resolve(); });
  });
  if (!authed) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send(getLlamaStatus());

  const unsub = llamaSubscribe(snap => {
    send(snap);
    if (snap.status === 'ready' || snap.status === 'error' || snap.status === 'idle') {
      setTimeout(() => { try { res.end(); } catch {} }, 300);
    }
  });

  req.on('close', () => unsub());
});

// ── POST /server/start — load a model into the built-in server ────────────────
router.post('/server/start', verifyUser, async (req, res) => {
  try {
    const { filename, ctxSize } = req.body;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'filename is required' });
    }

    res.json({ success: true, message: 'Server starting…', filename });

    startServer(filename, MODELS_DIR, ctxSize).then(() => {
      const now = new Date().toISOString();
      try {
        db.prepare(`
          INSERT INTO ai_provider_config (user_id, provider_type, provider_id, base_url, model, api_key, updated_at)
          VALUES (?, 'local', 'llamacpp-builtin', ?, ?, NULL, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            provider_type = 'local',
            provider_id   = 'llamacpp-builtin',
            base_url      = excluded.base_url,
            model         = excluded.model,
            updated_at    = excluded.updated_at
        `).run(req.user.id, LLAMA_BASE_URL, filename, now);
      } catch (dbErr) {
        console.error('[llamaServer] Failed to auto-save provider config:', dbErr);
      }
    }).catch(err => {
      console.error('[llamaServer] Start failed:', err.message);
    });

  } catch (err) {
    console.error('Server start error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /server/stop — unload the model and stop the server ──────────────────
router.post('/server/stop', verifyUser, async (req, res) => {
  try {
    await stopServer();

    const current = db
      .prepare("SELECT provider_id FROM ai_provider_config WHERE user_id = ?")
      .get(req.user.id);

    if (current?.provider_id === 'llamacpp-builtin') {
      db.prepare('DELETE FROM ai_provider_config WHERE user_id = ?').run(req.user.id);
    }

    res.json({ success: true, message: 'Server stopped' });
  } catch (err) {
    console.error('Server stop error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
