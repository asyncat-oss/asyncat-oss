// den/src/events/eventsRouter.js
// GET /api/events: the app's live updates as Server-Sent Events (see
// lib/appEvents.js). One stream per open window.

import express from 'express';
import { subscribeAppEvents } from '../lib/appEvents.js';

const router = express.Router();
const HEARTBEAT_MS = 25_000;

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Skips the compression middleware, which would hold events back.
  res.setHeader('Content-Encoding', 'identity');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  req.socket?.setTimeout?.(0);
  res.write('retry: 3000\n: connected\n\n');

  const userId = req.user?.id || null;
  const off = subscribeAppEvents((event) => {
    if (event.userId && userId && event.userId !== userId) return;
    if (res.writableEnded) return;
    const { userId: _owner, ...visible } = event;
    res.write(`id: ${event.id}\ndata: ${JSON.stringify(visible)}\n\n`);
  });
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  req.on('close', () => {
    clearInterval(heartbeat);
    off();
  });
});

export default router;
