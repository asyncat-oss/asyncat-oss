// providerRoutes.js — AI provider management API
// GET  /api/ai/providers/detect        — auto-detect running local providers
// GET  /api/ai/providers/config        — get user's saved provider config
// PUT  /api/ai/providers/config        — save user's provider config
// POST /api/ai/providers/test          — test a provider URL + model
// GET  /api/ai/providers/stats         — hardware + running model stats
// POST /api/ai/providers/models        — list models for a given URL

import express from 'express';
import { verifyUser } from '../../auth/authMiddleware.js';
import db from '../../db/client.js';
import {
  detectProviders,
  testCustomProvider,
  testProviderConnection,
  getProviderStats,
  KNOWN_PROVIDERS,
} from '../controllers/ai/providerManager.js';
import {
  listModels,
  getModel,
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

const LLAMA_BASE_URL = `http://127.0.0.1:${process.env.LLAMA_SERVER_PORT ?? '8765'}/v1`;
const LLAMA_MODEL_ID = 'local'; // model id reported to the OpenAI-compat client

const router = express.Router();

// ── GET /detect — probe all well-known local ports ────────────────────────────
router.get('/detect', verifyUser, async (req, res) => {
  try {
    const providers = await detectProviders();
    res.json({ success: true, providers });
  } catch (err) {
    console.error('Provider detect error:', err);
    res.status(500).json({ success: false, error: 'Failed to detect providers' });
  }
});

// ── GET /known — return the list of known providers (no probing) ──────────────
router.get('/known', verifyUser, (req, res) => {
  res.json({ success: true, providers: KNOWN_PROVIDERS });
});

// ── GET /config — load user's saved provider config ───────────────────────────
router.get('/config', verifyUser, (req, res) => {
  try {
    const row = db
      .prepare('SELECT * FROM ai_provider_config WHERE user_id = ?')
      .get(req.user.id);

    if (!row) {
      // Return the global .env defaults so the UI can show what's currently active
      return res.json({
        success: true,
        config: {
          providerType: 'cloud',
          providerId: null,
          baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
          model: process.env.AI_MODEL || 'gpt-4o',
          apiKey: null, // never expose the key
          isDefault: true,
        },
      });
    }

    res.json({
      success: true,
      config: {
        providerType: row.provider_type,
        providerId: row.provider_id,
        baseUrl: row.base_url,
        model: row.model,
        apiKey: null, // never expose stored key
        hasCustomApiKey: !!row.api_key,
        isDefault: false,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    console.error('Get provider config error:', err);
    res.status(500).json({ success: false, error: 'Failed to load provider config' });
  }
});

// ── PUT /config — save user's provider config ─────────────────────────────────
router.put('/config', verifyUser, (req, res) => {
  try {
    const { providerType, providerId, baseUrl, model, apiKey } = req.body;

    if (!providerType || !['cloud', 'local', 'custom'].includes(providerType)) {
      return res.status(400).json({ success: false, error: 'Invalid providerType. Must be cloud, local, or custom.' });
    }

    if (!baseUrl || !model) {
      return res.status(400).json({ success: false, error: 'baseUrl and model are required' });
    }

    const now = new Date().toISOString();

    // Upsert
    db.prepare(`
      INSERT INTO ai_provider_config (user_id, provider_type, provider_id, base_url, model, api_key, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        provider_type = excluded.provider_type,
        provider_id   = excluded.provider_id,
        base_url      = excluded.base_url,
        model         = excluded.model,
        api_key       = CASE WHEN excluded.api_key IS NOT NULL THEN excluded.api_key ELSE api_key END,
        updated_at    = excluded.updated_at
    `).run(req.user.id, providerType, providerId || null, baseUrl, model, apiKey || null, now);

    res.json({ success: true, message: 'Provider config saved' });
  } catch (err) {
    console.error('Save provider config error:', err);
    res.status(500).json({ success: false, error: 'Failed to save provider config' });
  }
});

// ── DELETE /config — reset to global .env defaults ───────────────────────────
router.delete('/config', verifyUser, (req, res) => {
  try {
    db.prepare('DELETE FROM ai_provider_config WHERE user_id = ?').run(req.user.id);
    res.json({ success: true, message: 'Provider config reset to defaults' });
  } catch (err) {
    console.error('Delete provider config error:', err);
    res.status(500).json({ success: false, error: 'Failed to reset provider config' });
  }
});

// ── POST /test — test a provider URL + model ──────────────────────────────────
router.post('/test', verifyUser, async (req, res) => {
  try {
    const { baseUrl, model } = req.body;

    if (!baseUrl || !model) {
      return res.status(400).json({ success: false, error: 'baseUrl and model are required' });
    }

    const result = await testProviderConnection(baseUrl, model);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Test provider error:', err);
    res.status(500).json({ success: false, error: 'Test failed' });
  }
});

// ── POST /models — list models for a given URL ────────────────────────────────
router.post('/models', verifyUser, async (req, res) => {
  try {
    const { baseUrl } = req.body;

    if (!baseUrl) {
      return res.status(400).json({ success: false, error: 'baseUrl is required' });
    }

    const result = await testCustomProvider(baseUrl);
    res.json({ success: true, reachable: result.reachable, models: result.models, latencyMs: result.latencyMs });
  } catch (err) {
    console.error('List models error:', err);
    res.status(500).json({ success: false, error: 'Failed to list models' });
  }
});

// ── GET /stats — hardware + running model stats ───────────────────────────────
router.get('/stats', verifyUser, async (req, res) => {
  try {
    // Load user's current provider config to get Ollama URL if applicable
    const row = db
      .prepare('SELECT * FROM ai_provider_config WHERE user_id = ?')
      .get(req.user.id);

    const providerConfig = row
      ? { providerId: row.provider_id, baseUrl: row.base_url, model: row.model }
      : { providerId: null, baseUrl: null, model: null };

    const stats = await getProviderStats(providerConfig);
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error('Provider stats error:', err);
    res.status(500).json({ success: false, error: 'Failed to get hardware stats' });
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

    // Validate URL
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
// NOTE: EventSource cannot send Authorization headers, so this endpoint
// accepts a JWT token via ?token= query param as a fallback.
router.get('/local-models/downloads/:downloadId/stream', async (req, res) => {
  const { downloadId } = req.params;

  // Auth: try cookie/header first (verifyUser already ran for other routes),
  // but for SSE we need to handle it manually since EventSource can't set headers.
  // The verifyUser middleware is NOT applied here — we do it inline.
  const { verifyUser: _verify } = await import('../../auth/authMiddleware.js');

  // Try to authenticate via the token query param if no cookie/header auth
  const tokenFromQuery = req.query.token;
  if (tokenFromQuery && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${tokenFromQuery}`;
  }

  // Verify auth inline
  let authed = false;
  await new Promise((resolve) => {
    _verify(req, res, (err) => {
      if (!err) authed = true;
      resolve();
    });
  });

  if (!authed) {
    // Response already sent by verifyUser
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Poll download status every 500ms
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
// EventSource can't send auth headers — accept ?token= query param as fallback.
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

  // Send current state immediately
  send(getLlamaStatus());

  // Subscribe to future state changes
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

    // Respond immediately — loading happens in background; client polls /status/stream
    res.json({ success: true, message: 'Server starting…', filename });

    // Start in background (non-blocking)
    startServer(filename, MODELS_DIR, ctxSize).then(() => {
      // Auto-save provider config for this user so future chats use the built-in server
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

    // Clear the user's built-in provider config (revert to defaults)
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
