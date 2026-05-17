// integrations/google/googleCalendarRouter.js
import express from 'express';
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import {
  isConfigured,
  getAuthUrl,
  exchangeCode,
  getConnectedEmail,
  saveIntegration,
  deleteIntegration,
  getIntegrationStatus,
  revokeToken,
} from './googleCalendarService.js';

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8717';

const auth = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachDb(req, res, next);
  });
};

// GET /api/integrations/google/status
router.get('/status', auth, (req, res) => {
  const status = getIntegrationStatus(req.user.id);
  res.json({ success: true, configured: isConfigured(), ...status });
});

// GET /api/integrations/google/connect
// Returns the OAuth URL the client should redirect to.
router.get('/connect', auth, (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env.',
    });
  }
  // Encode user ID as state so we can match it on callback without a session
  const state = Buffer.from(JSON.stringify({ userId: req.user.id })).toString('base64url');
  const url = getAuthUrl(state);
  res.json({ success: true, url });
});

// GET /api/integrations/google/callback
// Google redirects here after the user grants permission.
// This route is NOT protected by verifyUser — the user is identified via the state param.
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}/settings/integrations?google_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/settings/integrations?google_error=missing_params`);
  }

  try {
    const { userId } = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    const tokens = await exchangeCode(code);
    const email  = await getConnectedEmail(tokens);
    saveIntegration(userId, tokens, email);
    res.redirect(`${FRONTEND_URL}/settings/integrations?google_connected=1`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${FRONTEND_URL}/settings/integrations?google_error=${encodeURIComponent(err.message)}`);
  }
});

// DELETE /api/integrations/google/disconnect
router.delete('/disconnect', auth, async (req, res) => {
  try {
    await revokeToken(req.user.id);
    deleteIntegration(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Google disconnect error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
