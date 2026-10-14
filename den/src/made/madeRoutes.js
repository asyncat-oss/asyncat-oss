// den/src/made/madeRoutes.js
// /api/made: everything agents have made (madeIndex.js), and the files.

import express from 'express';
import fs from 'fs';
import path from 'path';
import { listMade, madeFile } from './madeIndex.js';

const router = express.Router();

// Pages and drawings an agent made may carry scripts, so they're served as
// text the app shows in a sandboxed frame, never run on this address.
const AS_TEXT = new Set(['.html', '.htm', '.svg', '.md', '.markdown', '.txt', '.csv', '.tsv', '.json', '.mmd', '.mermaid', '.js', '.ts', '.py', '.css', '.jsx', '.tsx', '.sh']);
const BINARY_TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };

// ?kind=picture&offset=300&limit=300 pages through one kind.
router.get('/', (req, res) => {
  try {
    const { kind, offset, limit } = req.query;
    res.json({ success: true, ...listMade(req.user.id, { kind: kind ? String(kind) : null, offset, limit: Math.min(500, Number(limit) || 300) }) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ?root=chats|project:<folderId>|cat:<catId>&name=<file>[&download=1]
router.get('/file', (req, res) => {
  const file = madeFile(req.user.id, String(req.query.root || ''), String(req.query.name || ''));
  if (!file) return res.status(404).json({ success: false, error: 'That file was not found.' });
  const ext = path.extname(file).toLowerCase();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', 'sandbox');
  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(file).replace(/"/g, '')}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    return fs.createReadStream(file).pipe(res);
  }
  if (AS_TEXT.has(ext)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return fs.createReadStream(file).pipe(res);
  }
  res.setHeader('Content-Type', BINARY_TYPES[ext] || 'application/octet-stream');
  return fs.createReadStream(file).pipe(res);
});

export default router;
