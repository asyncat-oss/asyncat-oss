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

// ── GET /hf-search — search HuggingFace GGUF models ─────────────────────────
router.get('/hf-search', verifyUser, async (req, res) => {
  try {
    const { q = '', filter = 'gguf', sort = 'trending', page = 0 } = req.query;
    const query = encodeURIComponent(q || 'text generation gguf');
    const url = `https://huggingface.co/api/models?search=${query}&filter=${filter}&sort=${sort}&direction=-1&page=${page}&full=true`;

    const hfRes = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!hfRes.ok) {
      throw new Error(`HF API ${hfRes.status}: ${hfRes.statusText}`);
    }

    const data = await hfRes.json();

    const models = (Array.isArray(data) ? data : []).map(m => ({
      id: m.id,
      repoId: m.id,
      repo: m.repoId || m.id,
      modelId: m.modelId || m.id,
      author: m.author || m.id.split('/')[0],
     downloads: m.downloads || 0,
      likes: m.likes || 0,
      tags: (m.tags || []).filter(t => !t.startsWith('license:')),
      pipeline_tag: m.pipeline_tag || '',
      created: m.createdAt || null,
      updated: m.lastModified || null,
      private: m.private || false,
    }));

    res.json({ success: true, models, count: models.length });
  } catch (err) {
    console.error('HF search error:', err.message);
    res.status(500).json({ success: false, error: 'HuggingFace search failed', details: err.message });
  }
});

// ── GET /recommended-models — curated list of good GGUF models ───────────────
router.get('/recommended-models', verifyUser, async (req, res) => {
  try {
    const catalog = [
      {
        repoId: 'unsloth/gemma-4-E4B-it-GGUF',
        name: 'Gemma 4 E4B',
        description: 'Google\'s latest Gemma 4 with 4.5B effective params. Multimodal (text + image + audio), 128K context, excellent reasoning. Best for laptops with 8-12GB VRAM.',
        architecture: 'gemma4',
        modalities: ['text', 'image', 'audio'],
        params: '4.5B eff',
        quantizations: ['Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'],
        defaultQuant: 'Q4_K_M',
        sizeBytes: 9 * 1024 * 1024 * 1024,
        vram: '~9GB',
        hardwareTier: 'mid',
        tags: ['google', 'gemma4', 'multimodal', 'vision', 'audio', 'reasoning'],
        trending: true,
        features: ['thinking', 'function calling', 'multimodal'],
      },
      {
        repoId: 'unsloth/gemma-4-26B-A4B-it-GGUF',
        name: 'Gemma 4 26B-A4B (MoE)',
        description: 'Google\'s MoE Gemma 4 — 25B total params, 3.8B active. Exceptional reasoning (88% on AIME 2026), 256K context, multimodal (text + image). Best balance of power and speed.',
        architecture: 'gemma4',
        modalities: ['text', 'image'],
        params: '25B / 3.8B active',
        quantizations: ['Q3_K_M', 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'],
        defaultQuant: 'Q4_K_M',
        sizeBytes: 17 * 1024 * 1024 * 1024,
        vram: '~17GB',
        hardwareTier: 'high',
        tags: ['google', 'gemma4', 'moe', 'vision', 'reasoning', 'coding'],
        trending: true,
        features: ['thinking', 'function calling', 'long-context', 'multimodal'],
      },
      {
        repoId: 'HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive',
        name: 'Qwen 3.5-9B Uncensored',
        description: 'Qwen 3.5 9B with all safety filters removed. 0 refusals, 100% capability. Hybrid Gated DeltaNet architecture, 262K context, multimodal (text+image+video). New architecture (2026).',
        architecture: 'qwen35',
        modalities: ['text', 'image', 'video'],
        params: '9B',
        quantizations: ['Q4_K_M', 'Q6_K', 'Q8_0', 'BF16'],
        defaultQuant: 'Q4_K_M',
        sizeBytes: 5.3 * 1024 * 1024 * 1024,
        vram: '~5.3GB',
        hardwareTier: 'entry',
        tags: ['qwen', 'qwen35', 'uncensored', 'multimodal', 'coding'],
        trending: true,
        features: ['uncensored', 'multimodal', 'fast'],
      },
      {
        repoId: 'unsloth/Qwen3.6-35B-A3B-GGUF',
        name: 'Qwen 3.6-35B-A3B (MoE)',
        description: 'Alibaba\'s newest (Apr 2026). 35B total / 3B active MoE. Best-in-class agentic coding (73.4% on SWE-bench), thinking preservation across conversations, tool calling mastery. 262K context.',
        architecture: 'qwen36moe',
        modalities: ['text', 'image', 'video'],
        params: '35B / 3B active',
        quantizations: ['Q3_K_M', 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'],
        defaultQuant: 'Q4_K_M',
        sizeBytes: 22 * 1024 * 1024 * 1024,
        vram: '~22GB',
        hardwareTier: 'high',
        tags: ['qwen', 'qwen36', 'moe', 'coding', 'agentic', 'thinking'],
        trending: true,
        features: ['thinking', 'function calling', 'agentic', 'long-context', 'multimodal'],
      },
      {
        repoId: 'unsloth/Qwen3.5-7B-Instruct-GGUF',
        name: 'Qwen 3.5-7B',
        description: 'Qwen 3.5 7B — proven, stable, fast. 32K context, strong multilingual support (29+ languages), excellent coding. The reliable workhorse.',
        architecture: 'qwen25',
        modalities: ['text'],
        params: '7B',
        quantizations: ['Q2_K', 'Q3_K_M', 'Q4_0', 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'],
        defaultQuant: 'Q4_K_M',
        sizeBytes: 4.7 * 1024 * 1024 * 1024,
        vram: '~4.7GB',
        hardwareTier: 'entry',
        tags: ['qwen', 'qwen25', 'coding', 'multilingual'],
        trending: false,
        features: ['fast', 'multilingual', 'stable'],
      },
      {
        repoId: 'unsloth/gemma-4-31B-it-GGUF',
        name: 'Gemma 4 31B Dense',
        description: 'Google\'s dense 31B Gemma 4. Most powerful Gemma variant at 85.2% MMLU Pro. 256K context, vision + text. Needs a beefy GPU (24-30GB VRAM).',
        architecture: 'gemma4',
        modalities: ['text', 'image'],
        params: '30.7B',
        quantizations: ['Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'],
        defaultQuant: 'Q5_K_M',
        sizeBytes: 30 * 1024 * 1024 * 1024,
        vram: '~30GB',
        hardwareTier: 'beefy',
        tags: ['google', 'gemma4', 'dense', 'vision', 'reasoning'],
        trending: false,
        features: ['thinking', 'function calling', 'long-context', 'multimodal'],
      },
      {
        repoId: 'prism-ml/Bonsai-8B-gguf',
        name: 'Bonsai 8B',
        description: 'Efficient 8B model optimized for consumer hardware. Fast inference, good quality, low VRAM requirement. Great for everyday tasks.',
        architecture: 'bonsai',
        modalities: ['text'],
        params: '8B',
        quantizations: ['Q4_K_M', 'Q5_K_M', 'Q6_K'],
        defaultQuant: 'Q4_K_M',
        sizeBytes: 5 * 1024 * 1024 * 1024,
        vram: '~5GB',
        hardwareTier: 'entry',
        tags: ['bonsai', 'efficient', 'fast'],
        trending: true,
        features: ['fast', 'low-vram'],
      },
      {
        repoId: 'unsloth/Qwen3.5-14B-Instruct-GGUF',
        name: 'Qwen 3.5-14B',
        description: 'Qwen 3.5 14B dense model. Good balance between capability and hardware requirements. 32K context, strong coding and math.',
        architecture: 'qwen25',
        modalities: ['text'],
        params: '14B',
        quantizations: ['Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'],
        defaultQuant: 'Q4_K_M',
        sizeBytes: 9 * 1024 * 1024 * 1024,
        vram: '~9GB',
        hardwareTier: 'mid',
        tags: ['qwen', 'qwen25', 'coding', 'balanced'],
        trending: false,
        features: ['coding', 'math', 'balanced'],
      },
    ];

    res.json({ success: true, models: catalog, count: catalog.length });
  } catch (err) {
    console.error('Recommended models error:', err);
    res.status(500).json({ success: false, error: 'Failed to get recommended models' });
  }
});

// ── GET /hf-repo/:repoId/files — list GGUF files in a HF repo ─────────────────
router.get('/hf-repo/:repoId/files', verifyUser, async (req, res) => {
  try {
    const { repoId } = req.params;
    const url = `https://huggingface.co/api/models/${repoId}/tree/main?recursive=true`;

    const hfRes = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!hfRes.ok) {
      throw new Error(`HF API ${hfRes.status}`);
    }

    const data = await hfRes.json();

    const ggufFiles = (Array.isArray(data) ? data : [])
      .filter(f => f.path.endsWith('.gguf') || f.path.endsWith('.bin'))
      .map(f => ({
        path: f.path,
        filename: f.path.split('/').pop(),
        size: f.size || 0,
        sizeFormatted: f.size ? formatBytes(f.size) : 'unknown',
        type: f.type === 'directory' ? 'dir' : 'file',
      }));

    res.json({ success: true, files: ggufFiles, repoId });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch repo files', details: err.message });
  }
});

// ── GET /hf-download-url — get direct CDN URL for a HF file ───────────────────
router.get('/hf-download-url', verifyUser, async (req, res) => {
  try {
    const { repoId, filename } = req.query;
    if (!repoId || !filename) {
      return res.status(400).json({ success: false, error: 'repoId and filename required' });
    }

    const url = `https://huggingface.co/${repoId}/resolve/main/${encodeURIComponent(filename)}`;
    const headRes = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });

    if (!headRes.ok) {
      throw new Error(`File not found or inaccessible: ${repoId}/${filename}`);
    }

    const contentLength = headRes.headers.get('content-length');
    res.json({
      success: true,
      url,
      filename,
      size: contentLength ? parseInt(contentLength, 10) : 0,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to get download URL', details: err.message });
  }
});

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

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
