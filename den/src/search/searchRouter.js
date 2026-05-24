// den/src/search/searchRouter.js
// GET /api/search?q=<query>&limit=<n>&types=projects,notes,conversations,cards
// Full-text search across user-owned content using SQLite LIKE queries.

import express from 'express';
import db from '../db/client.js';
import { verifyUser } from '../auth/authMiddleware.js';

const router = express.Router();

// Extract a plain-text snippet from block-editor JSON or raw string content
function snippet(raw, query, maxLen = 110) {
  if (!raw) return '';
  let text = raw;
  try {
    const parsed = JSON.parse(raw);
    const walk = (node) => {
      if (!node) return '';
      if (typeof node === 'string') return node + ' ';
      if (Array.isArray(node)) return node.map(walk).join('');
      if (node.text != null) return node.text + ' ';
      if (node.content) return walk(node.content);
      return '';
    };
    text = walk(parsed).replace(/\s+/g, ' ').trim();
  } catch { /* raw string */ }

  // Find match position for context
  const lower = text.toLowerCase();
  const q = (query || '').toLowerCase().split(/\s+/).filter(Boolean)[0] || '';
  const idx = q ? lower.indexOf(q) : 0;
  const start = Math.max(0, idx - 30);
  const slice = text.slice(start, start + maxLen);
  return (start > 0 ? '…' : '') + slice + (text.length > start + maxLen ? '…' : '');
}

router.get('/', verifyUser, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.json({ results: [], query: q, total: 0 });
  }

  const userId = req.user.id;
  const rawLimit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 5));
  const rawTypes = req.query.types
    ? String(req.query.types).split(',').map(t => t.trim())
    : ['projects', 'notes', 'conversations', 'cards'];

  const like = `%${q}%`;
  const results = [];

  try {
    // ── Projects ─────────────────────────────────────────────────────────────
    if (rawTypes.includes('projects')) {
      const rows = db.prepare(`
        SELECT id, name, description, emoji, updated_at
        FROM projects
        WHERE (created_by = ? OR owner_id = ?)
          AND is_archived = 0
          AND (name LIKE ? OR description LIKE ?)
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(userId, userId, like, like, rawLimit);

      rows.forEach(r => results.push({
        _type: 'project',
        id: r.id,
        title: r.name,
        description: r.description || '',
        emoji: r.emoji || '📁',
        updatedAt: r.updated_at,
      }));
    }

    // ── Notes ────────────────────────────────────────────────────────────────
    if (rawTypes.includes('notes')) {
      const rows = db.prepare(`
        SELECT id, title, content, projectid, updatedat
        FROM notes
        WHERE createdby = ?
          AND isarchived = 0
          AND (title LIKE ? OR content LIKE ?)
        ORDER BY updatedat DESC
        LIMIT ?
      `).all(userId, like, like, rawLimit);

      rows.forEach(r => results.push({
        _type: 'note',
        id: r.id,
        title: r.title || 'Untitled Note',
        snippet: snippet(r.content, q),
        projectId: r.projectid || null,
        updatedAt: r.updatedat,
      }));
    }

    // ── Conversations ────────────────────────────────────────────────────────
    if (rawTypes.includes('conversations')) {
      const rows = db.prepare(`
        SELECT id, title, updated_at
        FROM conversations
        WHERE user_id = ?
          AND deleted_at IS NULL
          AND title LIKE ?
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(userId, like, rawLimit);

      rows.forEach(r => results.push({
        _type: 'conversation',
        id: r.id,
        title: r.title || 'Untitled',
        updatedAt: r.updated_at,
      }));
    }

    // ── Cards (Kanban) ───────────────────────────────────────────────────────
    if (rawTypes.includes('cards')) {
      const rows = db.prepare(`
        SELECT c.id, c.title, c.description, c.priority, c.updatedAt,
               col.projectId
        FROM Cards c
        LEFT JOIN Columns col ON c.columnId = col.id
        WHERE c.createdBy = ?
          AND (c.title LIKE ? OR c.description LIKE ?)
        ORDER BY c.updatedAt DESC
        LIMIT ?
      `).all(userId, like, like, rawLimit);

      rows.forEach(r => results.push({
        _type: 'card',
        id: r.id,
        title: r.title || 'Untitled Task',
        snippet: snippet(r.description, q),
        priority: r.priority,
        projectId: r.projectId || null,
        updatedAt: r.updatedAt,
      }));
    }

    // Sort all results by updatedAt desc, then slice to limit
    results.sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || '')
    );

    res.json({ results: results.slice(0, rawLimit * rawTypes.length), query: q, total: results.length });
  } catch (err) {
    console.error('[search] query error:', err.message);
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

export default router;
