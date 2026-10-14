// den/src/search/searchRouter.js
// GET /api/search?q=<query>&limit=<n>&types=projects,notes,conversations
// The search palette (Ctrl+K): projects and notes by LIKE, chats by title
// and by what was said in them (messageIndex.js).

import express from 'express';
import db from '../db/client.js';
import { searchChats, indexingChats } from './messageIndex.js';

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

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.json({ results: [], query: q, total: 0 });
  }

  const userId = req.user.id;
  const rawLimit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 5));
  const rawTypes = req.query.types
    ? String(req.query.types).split(',').map(t => t.trim())
    : ['projects', 'notes', 'conversations'];

  const like = `%${q}%`;
  const results = [];
  // Chats still waiting to be indexed: the palette says some may be missing.
  let indexing = false;

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
        SELECT id, title, content, projectid, conversation_id, updatedat
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
        // The chat the note was created in, which is where it can be opened.
        conversationId: r.conversation_id || null,
        updatedAt: r.updatedat,
      }));
    }

    // ── Conversations ────────────────────────────────────────────────────────
    // Title matches first, then chats where a message matched, each with the
    // best message's snippet and its id, so the palette opens the chat at
    // the message it shows (even when the name matched too). A chat found
    // only by its name has neither and opens as usual. A third of the places
    // are kept for chats found by what was said, so names can't fill them.
    if (rawTypes.includes('conversations')) {
      const chats = searchChats(db, { userId, query: q, limit: rawLimit, hitsPerChat: 1, messageSlots: Math.floor(rawLimit / 3) });
      indexing = indexingChats(db);
      for (const chat of chats) {
        const hit = chat.hits[0] || null;
        results.push({
          _type: 'conversation',
          id: chat.id,
          title: chat.title || 'Untitled',
          updatedAt: chat.last_message_at || chat.updated_at,
          pinned: chat.is_pinned,
          titleMatch: chat.title_match,
          snippet: hit?.snippet || '',
          messageId: hit?.message_id || null,
          messageAt: hit?.at || null,
          matches: chat.hit_count,
        });
      }
    }

    // Each kind is already in its own order (newest, or best match first).
    res.json({ results: results.slice(0, rawLimit * rawTypes.length), query: q, total: results.length, indexing });
  } catch (err) {
    console.error('[search] query error:', err.message);
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

export default router;
