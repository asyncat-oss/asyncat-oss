// integrations/outlook/outlookRouter.js
import express from 'express';
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import {
  isConfigured,
  getAuthUrl,
  exchangeCode,
  getMicrosoftUser,
  saveIntegration,
  deleteIntegration,
  getIntegrationStatus,
} from './outlookService.js';

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8717';

const auth = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachDb(req, res, next);
  });
};

// GET /api/integrations/outlook/status
router.get('/status', auth, (req, res) => {
  const status = getIntegrationStatus(req.user.id);
  res.json({ success: true, configured: isConfigured(), ...status });
});

// GET /api/integrations/outlook/connect
router.get('/connect', auth, (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Outlook OAuth is not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to your .env.',
    });
  }
  const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64url');
  res.json({ success: true, url: getAuthUrl(state) });
});

// GET /api/integrations/outlook/callback
// Microsoft redirects here — not protected by verifyUser.
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(
      `${FRONTEND_URL}/settings/integrations?outlook_error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/settings/integrations?outlook_error=missing_params`);
  }

  try {
    const { userId } = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    const tokens = await exchangeCode(code);
    const user = await getMicrosoftUser(tokens.access_token);
    const email = user.mail || user.userPrincipalName || '';
    saveIntegration(userId, tokens, email);
    res.redirect(`${FRONTEND_URL}/settings/integrations?outlook_connected=1`);
  } catch (err) {
    console.error('Outlook OAuth callback error:', err);
    res.redirect(
      `${FRONTEND_URL}/settings/integrations?outlook_error=${encodeURIComponent(err.message)}`
    );
  }
});

// DELETE /api/integrations/outlook/disconnect
router.delete('/disconnect', auth, async (req, res) => {
  try {
    deleteIntegration(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Outlook disconnect error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
