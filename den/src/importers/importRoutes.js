// den/src/importers/importRoutes.js
// /api/import: chats and memories from ChatGPT and Claude exports. A file is
// read once for a preview; importing it then uses what was read.

import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import db from '../db/client.js';
import { importChats, importMemories, parseMemories, readExport, summarize } from './chatImport.js';

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const KEEP_MS = 30 * 60 * 1000;
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }).single('file');
const pending = new Map(); // token → { userId, data, at }

const router = express.Router();

function sendError(res, err) {
  res.status(Number(err?.status) || 500).json({ success: false, error: err?.message || 'Something went wrong.' });
}

function prune(now = Date.now()) {
  for (const [token, item] of pending) if (now - item.at > KEEP_MS) pending.delete(token);
}

/** A workspace of this user's, from ?workspaceId= when it is theirs. */
function workspaceOf(req) {
  const asked = String(req.query.workspaceId || '');
  if (!asked) return null;
  return db.prepare('SELECT id FROM workspaces WHERE id = ? AND owner_id = ?').get(asked, req.user.id)?.id || null;
}

// multipart "file": the export's .zip, or its conversations.json.
router.post('/chats/preview', (req, res) => upload(req, res, async (uploadError) => {
  if (uploadError) {
    const tooBig = uploadError.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ success: false, error: tooBig ? 'That file is over 1 GB. Unzip the export and pick the conversations.json inside it.' : uploadError.message });
  }
  if (!req.file) return res.status(400).json({ success: false, error: 'Pick the export file.' });
  try {
    const data = await readExport(await fs.promises.readFile(req.file.path));
    prune();
    const token = crypto.randomUUID();
    pending.set(token, { userId: req.user.id, data, at: Date.now() });
    res.json({ success: true, token, preview: summarize(req.user.id, data) });
  } catch (err) {
    sendError(res, err);
  } finally {
    fs.rm(req.file.path, { force: true }, () => {});
  }
}));

// { token, includeMemories }
router.post('/chats', (req, res) => {
  try {
    const item = pending.get(String(req.body?.token || ''));
    if (!item || item.userId !== req.user.id) {
      return res.status(410).json({ success: false, error: 'That file was read too long ago. Pick it again.' });
    }
    const workspaceId = workspaceOf(req);
    const chats = importChats(req.user.id, item.data, { workspaceId });
    const memories = req.body?.includeMemories && item.data.memories.length
      ? importMemories(req.user.id, item.data.memories, { workspaceId })
      : null;
    pending.delete(String(req.body.token));
    res.json({ success: true, chats, memories });
  } catch (err) {
    sendError(res, err);
  }
});

// { text } — memories pasted from ChatGPT (one per line), or a JSON list.
router.post('/memories', (req, res) => {
  try {
    const list = parseMemories(String(req.body?.text || ''));
    if (!list.length) return res.status(400).json({ success: false, error: 'Paste at least one memory.' });
    res.json({ success: true, ...importMemories(req.user.id, list, { workspaceId: workspaceOf(req) }) });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
