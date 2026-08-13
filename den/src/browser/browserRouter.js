import express from 'express';
import { randomUUID } from 'crypto';
import db from '../db/client.js';

const router = express.Router();
const MAX_LIMIT = 500;

function isRecordableUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

router.get('/history', (req, res) => {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || 100));
  const query = String(req.query.q || '').trim();
  const rows = query
    ? db.prepare(`
        SELECT id, url, title, visited_at AS visitedAt
        FROM browser_history
        WHERE user_id = ? AND (url LIKE ? OR title LIKE ?)
        ORDER BY visited_at DESC
        LIMIT ?
      `).all(req.user.id, `%${query}%`, `%${query}%`, limit)
    : db.prepare(`
        SELECT id, url, title, visited_at AS visitedAt
        FROM browser_history
        WHERE user_id = ?
        ORDER BY visited_at DESC
        LIMIT ?
      `).all(req.user.id, limit);
  res.json({ success: true, history: rows });
});

router.post('/history', (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!isRecordableUrl(url)) {
    return res.status(400).json({ success: false, error: 'Only HTTP(S) pages can be added to browser history.' });
  }
  const id = randomUUID();
  const title = String(req.body?.title || '').trim().slice(0, 500);
  db.prepare(`
    INSERT INTO browser_history (id, user_id, url, title)
    VALUES (?, ?, ?, ?)
  `).run(id, req.user.id, url.slice(0, 8000), title);

  // Keep local history bounded without requiring manual maintenance.
  db.prepare(`
    DELETE FROM browser_history
    WHERE user_id = ? AND id NOT IN (
      SELECT id FROM browser_history WHERE user_id = ? ORDER BY visited_at DESC LIMIT 10000
    )
  `).run(req.user.id, req.user.id);
  return res.status(201).json({ success: true, id });
});

router.delete('/history/:id', (req, res) => {
  const result = db.prepare('DELETE FROM browser_history WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true, deleted: result.changes });
});

router.delete('/history', (req, res) => {
  const result = db.prepare('DELETE FROM browser_history WHERE user_id = ?').run(req.user.id);
  res.json({ success: true, deleted: result.changes });
});

export default router;
