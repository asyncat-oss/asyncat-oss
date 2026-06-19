// integrations/integrationsRouter.js
// Central mount point for all third-party integrations.
// Add a new integration by creating integrations/{name}/{name}Router.js
// and mounting it here.

import express from 'express';
import githubRouter from './github/githubRouter.js';
import obsidianRouter from './obsidian/obsidianRouter.js';
import rssRouter from './rss/rssRouter.js';
import mailRouter from './mail/mailRouter.js';
import notificationRouter from './notifications/notificationRouter.js';

const router = express.Router();

router.use('/github', githubRouter);
router.use('/obsidian', obsidianRouter);
router.use('/rss', rssRouter);
router.use('/mail', mailRouter);
router.use('/notifications', notificationRouter);

// GET /api/integrations — list all integrations
router.get('/', (req, res) => {
  res.json({
    success: true,
    integrations: ['github', 'obsidian', 'rss', 'mail', 'notifications'],
  });
});

export default router;
