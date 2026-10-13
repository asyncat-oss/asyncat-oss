// den/src/training/guideRoutes.js
// /api/training/guide: Models → Training as steps. Pick data, see what fits
// and how long it takes, train, then use the adapter in llama.cpp and
// compare answers with it off and on.

import express from 'express';
import fs from 'fs';
import path from 'path';
import { getTrainingJob, getTrainingReadiness, startTrainingJob } from '../ai/controllers/ai/trainingJobManager.js';
import { getStatus as llamaStatus } from '../ai/controllers/ai/llamaServerManager.js';
import { getModelsDir } from '../ai/controllers/ai/modelManager.js';
import { managedTrainingPythonPath } from '../lib/trainingEngine.js';
import { buildDataset, datasetsDir, trainingSources } from './trainingData.js';
import { GUIDED_MODELS, guidedModel, planFor, recommendModel } from './trainingPlan.js';
import { compareAnswers, convertAdapter, getAdapter, listAdapters, removeAdapter, setAdapterActive } from './adapters.js';

const router = express.Router();

function sendError(res, err) {
  res.status(Number(err?.status) || 500).json({ success: false, error: err?.message || 'Something went wrong.' });
}

/** A downloaded GGUF file by name, in the models folder or a folder inside it. */
export function findGguf(file, root = getModelsDir(), depth = 3) {
  const direct = path.join(root, file);
  if (fs.existsSync(direct)) return direct;
  if (depth <= 0) return null;
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return null; }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const found = findGguf(file, path.join(root, entry.name), depth - 1);
    if (found) return found;
  }
  return null;
}

function ggufUrl(model) {
  return `https://huggingface.co/${model.gguf.repo}/resolve/main/${model.gguf.file}`;
}

router.get('/sources', (req, res) => {
  try {
    res.json({ success: true, sources: trainingSources(req.user.id) });
  } catch (err) {
    sendError(res, err);
  }
});

// { ratedChats, notes, projectIds, name }
router.post('/dataset', (req, res) => {
  try {
    const body = req.body || {};
    const dataset = buildDataset(req.user.id, {
      ratedChats: Boolean(body.ratedChats),
      notes: Boolean(body.notes),
      projectIds: Array.isArray(body.projectIds) ? body.projectIds.map(String) : [],
      name: body.name,
    });
    res.json({ success: true, dataset });
  } catch (err) {
    sendError(res, err);
  }
});

// ?examples=&tokens= from the dataset step.
router.get('/plan', async (req, res) => {
  try {
    const readiness = await getTrainingReadiness();
    const gpu = readiness.gpu ? { ...readiness.gpu, backend: readiness.backend } : { backend: readiness.backend };
    const data = { examples: Number(req.query.examples) || 0, tokens: Number(req.query.tokens) || 0 };
    const models = GUIDED_MODELS.map((model) => {
      const ggufPath = findGguf(model.gguf.file);
      return {
        id: model.id,
        label: model.label,
        note: model.note,
        paramsB: model.paramsB,
        trainRepo: model.train.repo,
        gguf: { ...model.gguf, path: ggufPath, url: ggufUrl(model) },
        plan: planFor(model, { gpu, data, have: { envReady: readiness.envReady, ggufPath } }),
      };
    });
    res.json({ success: true, readiness, recommended: recommendModel(gpu), models });
  } catch (err) {
    sendError(res, err);
  }
});

// { modelId, datasetPath, name, epochs? } — the download OK was given in the UI.
router.post('/train', async (req, res) => {
  try {
    const body = req.body || {};
    const model = guidedModel(body.modelId);
    if (!model) return res.status(400).json({ success: false, error: 'Pick one of the listed models.' });
    const datasetPath = path.resolve(String(body.datasetPath || ''));
    if (path.dirname(datasetPath) !== path.resolve(datasetsDir()) || !fs.existsSync(datasetPath)) {
      return res.status(400).json({ success: false, error: 'Build the training data first.' });
    }
    const readiness = await getTrainingReadiness();
    if (readiness.backend === 'mlx') {
      return res.status(409).json({ success: false, error: "On a Mac the trained adapter can't be loaded into llama.cpp yet, so these steps don't work there. The Advanced form trains with MLX." });
    }
    if (!readiness.envReady) return res.status(409).json({ success: false, error: 'Install the training tools first.' });
    const gpu = readiness.gpu ? { ...readiness.gpu, backend: readiness.backend } : { backend: readiness.backend };
    const lines = fs.readFileSync(datasetPath, 'utf8').split('\n').filter(Boolean).length;
    const plan = planFor(model, { gpu, data: { examples: lines, tokens: 0 }, have: { envReady: true, ggufPath: 'n/a' } });
    if (plan.fit === 'no' && !body.anyway) {
      return res.status(409).json({ success: false, error: `${model.label} needs about ${model.vramGb} GB of GPU memory, more than this GPU has. Pick a smaller model.` });
    }
    const job = startTrainingJob({
      userId: req.user.id,
      name: String(body.name || `${model.label} on my data`).slice(0, 120),
      baseModel: model.train.repo,
      datasetPath,
      backend: readiness.backend,
      epochs: Math.min(5, Math.max(1, parseInt(body.epochs, 10) || plan.epochs)),
      lr: 2e-4,
      rank: 16,
      alpha: 32,
      batchSize: 2,
      maxSeqLen: 1024,
      extra: { guidedModel: model.id },
    });
    res.json({ success: true, job });
  } catch (err) {
    sendError(res, err);
  }
});

function adapterView(adapter) {
  const status = llamaStatus();
  const model = guidedModel(adapter.modelId);
  return {
    ...adapter,
    modelLabel: model?.label || adapter.baseGguf,
    ggufPath: findGguf(adapter.baseGguf),
    loaded: status.status === 'ready' && status.adapter?.id === adapter.id,
  };
}

router.get('/adapters', (_req, res) => {
  try {
    const status = llamaStatus();
    res.json({ success: true, adapters: listAdapters().map(adapterView), server: { status: status.status, model: status.model, adapter: status.adapter || null } });
  } catch (err) {
    sendError(res, err);
  }
});

// { jobId, name } — turn a finished guided job into a llama.cpp adapter.
router.post('/adapters', async (req, res) => {
  try {
    const job = getTrainingJob(String(req.body?.jobId || ''), req.user.id);
    if (!job) return res.status(404).json({ success: false, error: 'That training job was not found.' });
    if (job.status !== 'completed') return res.status(409).json({ success: false, error: 'That training job has not finished.' });
    const model = guidedModel(job.hyperparams?.guidedModel);
    if (!model) return res.status(400).json({ success: false, error: 'Only jobs started from the guided steps can be used this way.' });
    const adapter = await convertAdapter({
      adapterDir: job.outputDir,
      name: req.body?.name || job.name,
      modelId: model.id,
      baseGguf: model.gguf.file,
      jobId: job.id,
      python: managedTrainingPythonPath(),
    });
    res.json({ success: true, adapter: adapterView(adapter) });
  } catch (err) {
    sendError(res, err);
  }
});

// { active } — switched on, the adapter loads whenever its model does.
router.post('/adapters/:id/active', (req, res) => {
  try {
    res.json({ success: true, adapter: adapterView(setAdapterActive(req.params.id, Boolean(req.body?.active))) });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/adapters/:id', (req, res) => {
  try {
    if (llamaStatus().adapter?.id === req.params.id) {
      return res.status(409).json({ success: false, error: 'That adapter is loaded. Load the model without it first.' });
    }
    if (!removeAdapter(req.params.id)) return res.status(404).json({ success: false, error: 'That adapter was not found.' });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// { prompt } — the same question with the adapter off and on.
router.post('/adapters/:id/compare', async (req, res) => {
  try {
    const adapter = getAdapter(req.params.id);
    if (!adapter) return res.status(404).json({ success: false, error: 'That adapter was not found.' });
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ success: false, error: 'Type a question to compare.' });
    const status = llamaStatus();
    if (status.status !== 'ready' || status.adapter?.id !== adapter.id) {
      return res.status(409).json({ success: false, error: `Load ${adapter.name} first.` });
    }
    res.json({ success: true, ...(await compareAnswers({ prompt: prompt.slice(0, 4000), adapter, port: status.port })) });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
