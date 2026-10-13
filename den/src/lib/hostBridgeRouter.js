/**
 * Routes the desktop app uses to talk to this backend. See hostBridge.js.
 */

import express from 'express';
import {
  emitHostEvent, settleHostRequest, tokenMatches, waitForHostMessages,
} from './hostBridge.js';

const router = express.Router();

// Only the desktop app's main process may call these: never a web page
// (those always send an Origin header), and only with the launch token.
router.use((req, res, next) => {
  if (req.headers.origin) return res.status(403).json({ success: false, error: 'Not available to web pages.' });
  if (!tokenMatches(req.headers['x-asyncat-host-token'])) {
    return res.status(401).json({ success: false, error: 'Unknown desktop host.' });
  }
  return next();
});

router.get('/next', async (req, res) => {
  const requested = Number.parseFloat(req.query.wait);
  const waitMs = Math.min(Math.max(Number.isFinite(requested) ? requested : 25, 0), 30) * 1000;
  const capabilities = String(req.query.capabilities || '').split(',').map((c) => c.trim()).filter(Boolean);
  const messages = await waitForHostMessages({ waitMs, capabilities });
  res.json({ success: true, messages });
});

router.post('/reply/:id', (req, res) => {
  const settled = settleHostRequest(req.params.id, {
    ok: req.body?.ok !== false,
    result: req.body?.result ?? null,
    error: req.body?.error || null,
  });
  res.json({ success: true, settled });
});

router.post('/event', (req, res) => {
  const type = String(req.body?.type || '');
  if (!/^[a-z][a-z0-9_.-]{0,63}$/i.test(type)) return res.status(400).json({ success: false, error: 'Bad event type.' });
  emitHostEvent(type, req.body?.payload || {});
  res.json({ success: true });
});

export default router;
