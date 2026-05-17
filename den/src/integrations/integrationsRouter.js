// integrations/integrationsRouter.js
// Central mount point for all third-party integrations.
// Add a new integration by creating integrations/{name}/{name}Router.js
// and mounting it here.

import express from 'express';
import googleCalendarRouter from './google/googleCalendarRouter.js';
import githubRouter from './github/githubRouter.js';
import outlookRouter from './outlook/outlookRouter.js';
import obsidianRouter from './obsidian/obsidianRouter.js';

const router = express.Router();

router.use('/google', googleCalendarRouter);
router.use('/github', githubRouter);
router.use('/outlook', outlookRouter);
router.use('/obsidian', obsidianRouter);

// GET /api/integrations — list all integrations
router.get('/', (req, res) => {
  res.json({
    success: true,
    integrations: ['google_calendar', 'github', 'outlook', 'obsidian'],
  });
});

export default router;
