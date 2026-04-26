// providerRoutes.js — AI provider management API
// GET  /api/ai/providers/stats              — hardware stats
// GET  /api/ai/providers/local-models/*     — downloaded model management
// POST /api/ai/providers/server/*           — built-in llama.cpp server control

import express from 'express';
import { randomUUID } from 'crypto';
import { verifyUser } from '../../auth/authMiddleware.js';
import { getProviderStats } from '../controllers/ai/providerManager.js';
import OpenAIClient from '../controllers/ai/openAIClient.js';
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
  getEngineAdvisor,
  getEngineInstallCatalog,
  selectEngine,
  installEngine,
  startEngineInstallJob,
  getEngineInstallJob,
  startPythonEngineInstallJob,
  getPythonEngineInstallJob,
  subscribe as llamaSubscribe,
} from '../controllers/ai/llamaServerManager.js';
import {
  LLAMA_BASE_URL,
  LLAMA_PROVIDER_ID,
  PROVIDER_CATALOG,
  getProviderPreset,
  normalizeBaseUrl,
  normalizeProviderType,
  parseSettings,
  providerRequiresBuiltinServer,
  providerSupportsTools,
  publicProvider,
} from '../controllers/ai/providerCatalog.js';
import db from '../../db/client.js';

const router = express.Router();

function saveBuiltinProviderConfig(userId, filename) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO ai_provider_config (user_id, profile_id, provider_type, provider_id, base_url, model, api_key, settings, supports_tools, updated_at)
    VALUES (?, NULL, 'local', 'llamacpp-builtin', ?, ?, NULL, '{}', 0, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      profile_id     = NULL,
      provider_type = 'local',
      provider_id   = 'llamacpp-builtin',
      base_url      = excluded.base_url,
      model         = excluded.model,
      api_key       = NULL,
      settings      = '{}',
      supports_tools = 0,
      updated_at    = excluded.updated_at
  `).run(userId, LLAMA_BASE_URL, filename, now);
}

function providerHeaders(providerId) {
  if (providerId === 'openrouter') {
    return {
      'HTTP-Referer': 'https://asyncat.local',
      'X-OpenRouter-Title': 'Asyncat',
    };
  }
  return undefined;
}

function normalizeProfilePayload(body = {}, existing = null) {
  const providerId = String(body.provider_id || body.providerId || existing?.provider_id || 'custom').trim();
  const preset = getProviderPreset(providerId) || getProviderPreset('custom');
  const settings = {
    ...parseSettings(preset?.settings),
    ...parseSettings(existing?.settings),
    ...parseSettings(body.settings),
  };
  const providerType = normalizeProviderType(body.provider_type || body.providerType || existing?.provider_type || preset.providerType, providerId);
  const supportsTools = body.supports_tools !== undefined
    ? Boolean(body.supports_tools)
    : body.supportsTools !== undefined
      ? Boolean(body.supportsTools)
      : existing?.supports_tools !== undefined
        ? Boolean(Number(existing.supports_tools))
        : Boolean(preset.supportsTools);

  return {
    name: String(body.name ?? existing?.name ?? preset.name ?? providerId).trim() || providerId,
    provider_type: providerType,
    provider_id: providerId,
    base_url: normalizeBaseUrl(body.base_url ?? body.baseUrl ?? existing?.base_url ?? preset.baseUrl ?? '', providerId),
    model: String(body.model ?? existing?.model ?? preset.model ?? '').trim(),
    api_key: Object.prototype.hasOwnProperty.call(body, 'api_key')
      ? String(body.api_key || '')
      : Object.prototype.hasOwnProperty.call(body, 'apiKey')
        ? String(body.apiKey || '')
        : existing?.api_key || '',
    settings,
    supports_tools: supportsTools ? 1 : 0,
  };
}

function rowByProfileId(userId, profileId) {
  return db.prepare('SELECT * FROM ai_provider_profiles WHERE user_id = ? AND id = ?').get(userId, profileId);
}

function clientForProvider(row) {
  const settings = parseSettings(row.settings);
  return new OpenAIClient({
    endpoint: normalizeBaseUrl(row.base_url, row.provider_id),
    apiKey: row.provider_type === 'local' ? (row.api_key || 'local') : (row.api_key || process.env.AI_API_KEY || 'not-configured'),
    defaultModel: row.model,
    providerId: row.provider_id,
    settings,
    defaultHeaders: providerHeaders(row.provider_id),
  });
}

async function withTimeout(promise, ms, label = 'Provider request') {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function listProviderModels(row) {
  if (row.provider_id === LLAMA_PROVIDER_ID) {
    return listModels().map(model => ({
      id: model.filename,
      name: model.name || model.filename,
      owned_by: 'local',
    }));
  }
  const client = clientForProvider(row);
  const result = await withTimeout(client.client.models.list(), 8000, 'Model list');
  const data = Array.isArray(result?.data) ? result.data : [];
  return data.map(model => ({
    id: model.id,
    name: model.id,
    owned_by: model.owned_by || model.owner || '',
  }));
}

async function testProvider(row) {
  if (row.provider_id === LLAMA_PROVIDER_ID) {
    const snap = getLlamaStatus();
    if (snap.status !== 'ready') {
      throw new Error(`Built-in llama.cpp is ${snap.status}; load a model first.`);
    }
    return `Built-in llama.cpp is ready with ${snap.model || row.model}.`;
  }

  const preset = getProviderPreset(row.provider_id);
  if (preset?.supportsModelList) {
    const models = await listProviderModels(row);
    return models.length ? `Connected. ${models.length} model${models.length === 1 ? '' : 's'} visible.` : 'Connected. No models were returned.';
  }

  const client = clientForProvider(row);
  const response = await withTimeout(client.client.chat.completions.create({
    model: row.model,
    messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
    max_completion_tokens: 8,
  }), 10000, 'Chat test');
  const text = response.choices?.[0]?.message?.content?.trim();
  return text ? `Connected. Test response: ${text.slice(0, 80)}` : 'Connected.';
}

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

// ── GET /catalog — built-in provider presets ────────────────────────────────
router.get('/catalog', verifyUser, (_req, res) => {
  res.json({ success: true, providers: PROVIDER_CATALOG });
});

// ── GET /config — get user provider config ──────────────────────────────────
router.get('/config', verifyUser, (req, res) => {
  try {
    const row = db.prepare('SELECT profile_id, provider_type, provider_id, base_url, model, settings, supports_tools FROM ai_provider_config WHERE user_id = ?').get(req.user.id);
    if (row) {
      res.json({ ...row, settings: parseSettings(row.settings), supports_tools: Boolean(row.supports_tools) });
    } else {
      res.json({ profile_id: null, provider_type: 'local', provider_id: LLAMA_PROVIDER_ID, base_url: LLAMA_BASE_URL, model: '', settings: {}, supports_tools: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Provider profiles — saved local/cloud/custom endpoints ──────────────────
router.get('/profiles', verifyUser, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM ai_provider_profiles WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
    const active = db.prepare('SELECT profile_id, provider_id, model, base_url, supports_tools FROM ai_provider_config WHERE user_id = ?').get(req.user.id);
    res.json({
      success: true,
      profiles: rows.map(publicProvider),
      active: active ? { ...active, supports_tools: Boolean(active.supports_tools) } : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/profiles', verifyUser, (req, res) => {
  try {
    const profile = normalizeProfilePayload(req.body || {});
    if (!profile.base_url && profile.provider_id !== LLAMA_PROVIDER_ID) {
      return res.status(400).json({ success: false, error: 'base_url is required' });
    }
    if (!profile.model && profile.provider_id !== LLAMA_PROVIDER_ID) {
      return res.status(400).json({ success: false, error: 'model is required' });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO ai_provider_profiles (
        id, user_id, name, provider_type, provider_id, base_url, model,
        api_key, settings, supports_tools, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user.id,
      profile.name,
      profile.provider_type,
      profile.provider_id,
      profile.base_url,
      profile.model,
      profile.api_key || null,
      JSON.stringify(profile.settings || {}),
      profile.supports_tools,
      now,
      now,
    );

    res.status(201).json({ success: true, profile: publicProvider(rowByProfileId(req.user.id, id)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/profiles/:id', verifyUser, (req, res) => {
  try {
    const existing = rowByProfileId(req.user.id, req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Profile not found' });

    const profile = normalizeProfilePayload(req.body || {}, existing);
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE ai_provider_profiles
      SET name = ?, provider_type = ?, provider_id = ?, base_url = ?, model = ?,
          api_key = ?, settings = ?, supports_tools = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      profile.name,
      profile.provider_type,
      profile.provider_id,
      profile.base_url,
      profile.model,
      profile.api_key || null,
      JSON.stringify(profile.settings || {}),
      profile.supports_tools,
      now,
      req.params.id,
      req.user.id,
    );

    res.json({ success: true, profile: publicProvider(rowByProfileId(req.user.id, req.params.id)) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/profiles/:id', verifyUser, (req, res) => {
  try {
    const existing = rowByProfileId(req.user.id, req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Profile not found' });

    const active = db.prepare('SELECT profile_id FROM ai_provider_config WHERE user_id = ?').get(req.user.id);
    if (active?.profile_id === req.params.id) {
      db.prepare('DELETE FROM ai_provider_config WHERE user_id = ?').run(req.user.id);
    }
    db.prepare('DELETE FROM ai_provider_profiles WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/profiles/:id/test', verifyUser, async (req, res) => {
  const row = rowByProfileId(req.user.id, req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'Profile not found' });

  const now = new Date().toISOString();
  try {
    const message = await testProvider(row);
    db.prepare(`
      UPDATE ai_provider_profiles
      SET last_test_status = 'ok', last_test_message = ?, last_test_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(message, now, now, req.params.id, req.user.id);
    res.json({ success: true, ok: true, message, profile: publicProvider(rowByProfileId(req.user.id, req.params.id)) });
  } catch (err) {
    const message = err.message || 'Connection test failed';
    db.prepare(`
      UPDATE ai_provider_profiles
      SET last_test_status = 'error', last_test_message = ?, last_test_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(message, now, now, req.params.id, req.user.id);
    res.status(400).json({ success: false, ok: false, error: message, profile: publicProvider(rowByProfileId(req.user.id, req.params.id)) });
  }
});

router.post('/profiles/:id/activate', verifyUser, async (req, res) => {
  try {
    const row = rowByProfileId(req.user.id, req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Profile not found' });

    if (req.body?.stopLocal === true && !providerRequiresBuiltinServer(row)) {
      const snap = getLlamaStatus();
      if (snap.status === 'ready' || snap.status === 'loading') {
        await stopServer();
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO ai_provider_config (
        user_id, profile_id, provider_type, provider_id, base_url, model,
        api_key, settings, supports_tools, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        profile_id = excluded.profile_id,
        provider_type = excluded.provider_type,
        provider_id = excluded.provider_id,
        base_url = excluded.base_url,
        model = excluded.model,
        api_key = excluded.api_key,
        settings = excluded.settings,
        supports_tools = excluded.supports_tools,
        updated_at = excluded.updated_at
    `).run(
      req.user.id,
      row.id,
      row.provider_type,
      row.provider_id,
      row.base_url,
      row.model,
      row.api_key || null,
      row.settings || '{}',
      providerSupportsTools(row) ? 1 : 0,
      now,
    );

    db.prepare('UPDATE ai_provider_profiles SET updated_at = ? WHERE id = ? AND user_id = ?').run(now, row.id, req.user.id);
    const active = db.prepare('SELECT profile_id, provider_type, provider_id, base_url, model, settings, supports_tools FROM ai_provider_config WHERE user_id = ?').get(req.user.id);
    res.json({ success: true, active: { ...active, settings: parseSettings(active.settings), supports_tools: Boolean(active.supports_tools) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/models', verifyUser, async (req, res) => {
  try {
    const profileId = req.query.profileId;
    let row = null;
    if (profileId) {
      row = rowByProfileId(req.user.id, profileId);
      if (!row) return res.status(404).json({ success: false, error: 'Profile not found' });
    } else {
      row = db.prepare('SELECT * FROM ai_provider_config WHERE user_id = ?').get(req.user.id);
      if (!row) return res.json({ success: true, models: [] });
    }

    res.json({ success: true, models: await listProviderModels(row) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
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

// ── GET /recommended-models — curated list of good GGUF models (public, static data)
router.get('/recommended-models', async (req, res) => {
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

// ── GET /server/engines — current engine, candidates, and recommendation ─────
router.get('/server/engines', verifyUser, async (_req, res) => {
  try {
    const result = await getEngineAdvisor();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /server/engines/catalog — release catalog for managed installs ──────
router.get('/server/engines/catalog', verifyUser, async (req, res) => {
  try {
    const force = String(req.query.refresh || '') === '1';
    const result = await getEngineInstallCatalog({ force });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = /GitHub releases API returned|GitHub release .* returned/i.test(err.message) ? 502 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ── POST /server/engines/select — switch engine and optionally retry model ───
router.post('/server/engines/select', verifyUser, async (req, res) => {
  try {
    const { runtime, path, retryModel, ctxSize } = req.body || {};
    if (!runtime || !path) {
      return res.status(400).json({ success: false, error: 'runtime and path are required' });
    }

    const result = await selectEngine({
      runtime,
      path,
      retryModel,
      ctxSize,
      modelsDir: MODELS_DIR,
    });

    if (result.retry?.attempted && result.retry?.success && retryModel) {
      const unsub = llamaSubscribe(snap => {
        if (snap.status === 'ready' && snap.model === retryModel) {
          unsub();
          try {
            saveBuiltinProviderConfig(req.user.id, retryModel);
          } catch (dbErr) {
            console.error('[llamaServer] Failed to auto-save provider config after engine switch:', dbErr);
          }
        } else if (snap.status === 'error' || snap.status === 'idle') {
          unsub();
        }
      });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[llamaServer] Engine switch failed:', err.message || err);
    const status = /required|not found|failed verification|does not provide/i.test(err.message) ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ── POST /server/engines/install — install managed engine and optionally retry ──
router.post('/server/engines/install', verifyUser, async (req, res) => {
  try {
    const { profile, releaseTag, assetName, retryModel, ctxSize } = req.body || {};
    const result = await installEngine({
      profile,
      releaseTag,
      assetName,
      retryModel,
      ctxSize,
      modelsDir: MODELS_DIR,
    });

    if (result.retry?.attempted && result.retry?.success && retryModel) {
      const unsub = llamaSubscribe(snap => {
        if (snap.status === 'ready' && snap.model === retryModel) {
          unsub();
          try {
            saveBuiltinProviderConfig(req.user.id, retryModel);
          } catch (dbErr) {
            console.error('[llamaServer] Failed to auto-save provider config after engine install:', dbErr);
          }
        } else if (snap.status === 'error' || snap.status === 'idle') {
          unsub();
        }
      });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[llamaServer] Managed engine install failed:', err.message || err);
    const status = /No llama\.cpp release asset matched|Download failed|extract|verification failed|required/i.test(err.message) ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ── POST /server/engines/install-jobs — start background managed install ─────
router.post('/server/engines/install-jobs', verifyUser, async (req, res) => {
  try {
    const { profile, releaseTag, assetName, retryModel, ctxSize } = req.body || {};
    const job = await startEngineInstallJob({
      profile,
      releaseTag,
      assetName,
      retryModel,
      ctxSize,
      modelsDir: MODELS_DIR,
    });
    res.status(202).json({ success: true, job });
  } catch (err) {
    const status = /already running/i.test(err.message) ? 409 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ── GET /server/engines/install-jobs/:id — poll managed install job status ───
router.get('/server/engines/install-jobs/:id', verifyUser, async (req, res) => {
  const job = getEngineInstallJob(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Install job not found' });
  }
  res.json({ success: true, job });
});

// ── POST /server/engines/python-install-jobs — start Python GPU runtime build ─
router.post('/server/engines/python-install-jobs', verifyUser, async (req, res) => {
  try {
    const { profile, retryModel, ctxSize } = req.body || {};
    const job = await startPythonEngineInstallJob({
      profile,
      retryModel,
      ctxSize,
      modelsDir: MODELS_DIR,
    });
    res.status(202).json({ success: true, job });
  } catch (err) {
    const status = /already running/i.test(err.message) ? 409 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// ── GET /server/engines/python-install-jobs/:id — poll Python build job ───────
router.get('/server/engines/python-install-jobs/:id', verifyUser, (req, res) => {
  const job = getPythonEngineInstallJob(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Python install job not found' });
  res.json({ success: true, job });
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

    const current = getLlamaStatus();
    if (current.status === 'loading') {
      return res.status(409).json({
        success: false,
        error: `A model is already loading: ${current.model || 'unknown'}. Please wait or stop it first.`,
      });
    }

    await startServer(filename, MODELS_DIR, ctxSize);

    const unsub = llamaSubscribe(snap => {
      if (snap.status === 'ready' && snap.model === filename) {
        unsub();
        try {
          saveBuiltinProviderConfig(req.user.id, filename);
        } catch (dbErr) {
          console.error('[llamaServer] Failed to auto-save provider config:', dbErr);
        }
      } else if (snap.status === 'error' || snap.status === 'idle') {
        unsub();
      }
    });

    res.json({ success: true, message: 'Server loading…', filename });

  } catch (err) {
    console.error('[llamaServer] Start failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /server/activate — mark the ready built-in server as the provider ───
router.post('/server/activate', verifyUser, async (req, res) => {
  try {
    const snap = getLlamaStatus();
    if (snap.status !== 'ready' || !snap.model) {
      return res.status(409).json({
        success: false,
        error: `Local model is not ready yet (status: ${snap.status}).`,
      });
    }

    try {
      saveBuiltinProviderConfig(req.user.id, snap.model);
      res.json({ success: true, model: snap.model, baseUrl: LLAMA_BASE_URL });
    } catch (dbErr) {
      console.error('[llamaServer] Failed to save provider config:', dbErr);
      res.status(500).json({ success: false, error: dbErr.message });
    }
  } catch (err) {
    console.error('Server activate error:', err);
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
