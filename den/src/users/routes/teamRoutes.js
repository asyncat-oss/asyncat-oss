// users/routes/teamRoutes.js
// /api/teams — workspace CRUD + member helpers (maps "teams" → "workspaces" table)
import express from 'express';
import { auth } from '../middleware/auth.js';
import db from '../../db/client.js';
import { randomUUID } from 'crypto';

const router = express.Router();

// ── GET /api/teams ─────────────────────────────────────────────────────────────
// Returns workspaces owned by (or accessible to) the current user.
router.get('/', auth, (req, res) => {
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

// ── GET /api/teams/:teamId ─────────────────────────────────────────────────────
router.get('/:teamId', auth, (req, res) => {
  try {
    const ws = db.prepare(
      `SELECT id, name, owner_id, emoji, created_at, updated_at
       FROM workspaces WHERE id = ? AND owner_id = ?`
    ).get(req.params.teamId, req.user.id);

    if (!ws) return res.status(404).json({ success: false, error: 'Workspace not found' });
    res.json({ success: true, data: ws });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch workspace' });
  }
});

// ── POST /api/teams ────────────────────────────────────────────────────────────
router.post('/', auth, (req, res) => {
  try {
    const { name, emoji } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const id = randomUUID();
    db.prepare(
      `INSERT INTO workspaces (id, name, owner_id, emoji, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(id, name, req.user.id, emoji || null);

    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: ws });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create workspace' });
  }
});

// ── PUT /api/teams/:teamId ─────────────────────────────────────────────────────
router.put('/:teamId', auth, (req, res) => {
  try {
    const { name, emoji, description } = req.body;
    const { teamId } = req.params;

    const ws = db.prepare('SELECT id FROM workspaces WHERE id = ? AND owner_id = ?')
      .get(teamId, req.user.id);
    if (!ws) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const updates = [];
    const params = [];
    if (name        !== undefined) { updates.push('name = ?');        params.push(name); }
    if (emoji       !== undefined) { updates.push('emoji = ?');       params.push(emoji); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (!updates.length) return res.status(400).json({ success: false, error: 'Nothing to update' });

    updates.push("updated_at = datetime('now')");
    params.push(teamId, req.user.id);

    db.prepare(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = ? AND owner_id = ?`).run(...params);
    const updated = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(teamId);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update workspace' });
  }
});

// ── DELETE /api/teams/:teamId ──────────────────────────────────────────────────
// Deletes the workspace. Projects cascade via FK. Only the owner can delete.
router.delete('/:teamId', auth, (req, res) => {
  try {
    const { teamId } = req.params;

    const ws = db.prepare('SELECT id, name FROM workspaces WHERE id = ? AND owner_id = ?')
      .get(teamId, req.user.id);
    if (!ws) return res.status(404).json({ success: false, error: 'Workspace not found' });

    db.transaction(() => {
      db.prepare('DELETE FROM mcp_auth_codes WHERE workspace_id = ?').run(teamId);
      db.prepare('DELETE FROM mcp_access_tokens WHERE workspace_id = ?').run(teamId);
      db.prepare('DELETE FROM agent_patterns WHERE workspace_id = ?').run(teamId);

      // Projects and workspace-owned rows are deleted automatically via ON DELETE CASCADE.
      db.prepare('DELETE FROM workspaces WHERE id = ? AND owner_id = ?').run(teamId, req.user.id);
    })();

    res.json({ success: true, message: `Workspace "${ws.name}" deleted` });
  } catch (err) {
    console.error('[teams] DELETE error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete workspace' });
  }
});

// ── POST /api/teams/:teamId/leave ──────────────────────────────────────────────
// Local account build: the current user is always the owner, so leaving is not allowed.
router.post('/:teamId/leave', auth, (req, res) => {
  const ws = db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(req.params.teamId);
  if (!ws) return res.status(404).json({ success: false, error: 'Workspace not found' });
  if (ws.owner_id === req.user.id) {
    return res.status(400).json({ success: false, error: 'You are the owner — delete the workspace instead.' });
  }
  res.json({ success: true, message: 'Left workspace' });
});

// ── GET /api/teams/:teamId/members ─────────────────────────────────────────────
// Local account build: the only "member" is the owner.
router.get('/:teamId/members', auth, (req, res) => {
  try {
    const ws = db.prepare('SELECT id, owner_id FROM workspaces WHERE id = ?')
      .get(req.params.teamId);
    if (!ws) return res.status(404).json({ success: false, error: 'Workspace not found' });

    const owner = db.prepare('SELECT id, email, name, profile_picture FROM users WHERE id = ?')
      .get(ws.owner_id);

    const members = owner ? [{ ...owner, role: 'owner', status: 'active' }] : [];
    res.json({ success: true, data: members });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch members' });
  }
});

export default router;
