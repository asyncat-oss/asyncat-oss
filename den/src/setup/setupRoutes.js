// den/src/setup/setupRoutes.js
// /api/setup: the first-run setup. Whether the app opens it, and marking it
// finished or skipped.

import express from 'express';
import { markSetupDone, setupStatus } from './setupState.js';

const router = express.Router();

function sendError(res, err) {
  const status = Number(err?.status) || 500;
  if (status >= 500) console.error('[setup]', err);
  res.status(status).json({ success: false, error: err?.message || 'Something went wrong.' });
}

router.get('/', (req, res) => {
  try {
    res.json({ success: true, setup: setupStatus(req.user.id) });
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

export default router;
