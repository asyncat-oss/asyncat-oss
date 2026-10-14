// den/src/storage/attachmentStatic.js
// /files/<container>/<path>: files added to notes, older card attachments and
// profile pictures, from the uploads folder (STORAGE_PATH). Mounted once, at
// /files. Only a regular file really inside its container is sent: a link
// there is never followed.

import express from 'express';
import fs from 'fs';
import path from 'path';
import { runtimeUploadsPath } from '../config/runtimeConfig.js';
import { realInside } from './safeFs.js';

const router = express.Router();

const CONTAINERS = ['notes', 'kanban-attachments', 'profile-pictures'];

const TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** The file a request names, or null when it isn't a regular file inside its container. */
export function attachmentFile(container, relativePath) {
  if (!CONTAINERS.includes(container)) return null;
  const dir = path.join(runtimeUploadsPath(), container);
  const parts = String(relativePath || '').split('/');
  if (!parts.length || parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))) return null;
  const file = path.join(dir, ...parts);
  try {
    if (!fs.lstatSync(file).isFile()) return null;
  } catch {
    return null;
  }
  return realInside(dir, file) ? file : null;
}

// A RegExp route works in both Express 4 and Express 5. String wildcards use
// incompatible path-to-regexp syntaxes between those releases and can crash
// the entire backend while routes are being registered.
router.get(/^\/([^/]+)\/(.+)$/, (req, res) => {
  const container = req.params[0];
  if (!CONTAINERS.includes(container)) {
    return res.status(403).json({ success: false, error: 'Container not allowed' });
  }
  const file = attachmentFile(container, req.params[1]);
  if (!file) return res.status(404).json({ success: false, error: 'File not found' });

  const stat = fs.statSync(file);
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const stream = fs.createReadStream(file);
  stream.on('error', (err) => {
    console.error('File stream error:', err.message);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Stream error' });
  });
  stream.pipe(res);
});

export default router;
