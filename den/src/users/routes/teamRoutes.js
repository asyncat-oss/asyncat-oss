// users/routes/teamRoutes.js
// /api/teams — lists the user's workspace (the app keeps one internal workspace)
import express from 'express';
import db from '../../db/client.js';

const router = express.Router();

// ── GET /api/teams ─────────────────────────────────────────────────────────────
// Returns workspaces owned by (or accessible to) the current user.
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const workspaces = db.prepare(
      `SELECT id, name, owner_id, emoji, created_at, updated_at
       FROM workspaces
       WHERE owner_id = ?
       ORDER BY name`
    ).all(userId);

    // Attach user_role so the frontend sorting logic still works
    const data = workspaces.map(w => ({
      ...w,
      user_role: 'owner',
      access_type: 'workspace',
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('[teams] GET / error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch workspaces' });
  }
});

export default router;
