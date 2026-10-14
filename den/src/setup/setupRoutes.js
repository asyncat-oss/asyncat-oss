// den/src/setup/setupRoutes.js
// /api/setup: the first-run setup. Whether the app opens it, marking it
// finished or skipped, and "Run a model on this computer" (what it offers
// here, and starting the download). The download's progress and Cancel are
// the setup job routes under /api/media/setup.

import express from 'express';
import { latestSetupJob } from '../media/setupJobs.js';
import { markSetupDone, setupStatus } from './setupState.js';
import { SETUP_KIND, localModelPlan, startLocalModelSetup } from './localModelSetup.js';

const router = express.Router();

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  if (status >= 500) console.error('[setup]', err);
  res.status(status).json({ success: false, error: err?.message || 'Something went wrong.', ...(err?.job ? { job: err.job } : {}) });
}

// With the latest "Run a model on this computer" download, so a setup opened
// again (or reloaded) shows one that is still going.
router.get('/', (req, res) => {
  try {
    res.json({ success: true, setup: setupStatus(req.user.id), job: latestSetupJob(SETUP_KIND) });
  } catch (err) {
    sendError(res, err);
  }
});

// { done: true } when it is finished or skipped; { done: false } offers it again.
router.put('/', (req, res) => {
  try {
    markSetupDone(req.body?.done);
    res.json({ success: true, setup: setupStatus(req.user.id) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/local', async (_req, res) => {
  try {
    res.json({ success: true, plan: await localModelPlan(), job: latestSetupJob(SETUP_KIND) });
  } catch (err) {
    sendError(res, err);
  }
});

// { modelId } — one of the models GET /local offers.
router.post('/local', async (req, res) => {
  try {
    res.status(202).json({ success: true, job: await startLocalModelSetup({ modelId: req.body?.modelId, userId: req.user.id }) });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
