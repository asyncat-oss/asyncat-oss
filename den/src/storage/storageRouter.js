// storage/storageRouter.js
// Static file serving for uploaded attachments.
// Serves files from STORAGE_PATH/{container}/ at /files/{container}/*

import express from 'express';
import path from 'path';
import fs from 'fs';
import { verifyUser } from '../auth/authMiddleware.js';
import { clearManagedUploads, getStorageSummary, getLogsSummary, clearLogs, readLogFile } from './storageService.js';

const router = express.Router();

const STORAGE_ROOT = process.env.STORAGE_PATH
  ? path.resolve(process.env.STORAGE_PATH)
  : path.resolve('data', 'uploads');

const ALLOWED_CONTAINERS = ['notes', 'kanban-attachments'];

const sanitizePath = (inputPath) => {
  return path.normalize(inputPath).replace(/^(\.\.(\/|\\|$))+/, '');
};

router.get('/summary', verifyUser, (req, res) => {
  try {
    const summary = getStorageSummary();
    res.json(summary);
  } catch (err) {
    console.error('Storage summary error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/uploads', verifyUser, async (req, res) => {
  try {
    const confirm = String(req.body?.confirm || '').trim().toLowerCase();
    if (confirm !== 'clear uploads') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation text must be "clear uploads"',
      });
    }

    const result = await clearManagedUploads();
    res.json(result);
  } catch (err) {
    console.error('Storage clear uploads error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/logs', verifyUser, (req, res) => {
  try {
    const summary = getLogsSummary();
    res.json(summary);
  } catch (err) {
    console.error('Logs summary error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/logs', verifyUser, async (req, res) => {
  try {
    const confirm = String(req.body?.confirm || '').trim().toLowerCase();
    if (confirm !== 'clear logs') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation text must be "clear logs"',
      });
    }

    const result = await clearLogs();
    res.json(result);
  } catch (err) {
    console.error('Storage clear logs error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/logs/read', verifyUser, (req, res) => {
  try {
    const category = String(req.query?.category || '').trim();
    const filename = String(req.query?.filename || '').trim();
    const lines = Math.min(1000, Math.max(1, parseInt(req.query?.lines || '200', 10))) || 200;

    if (!category || !filename) {
      return res.status(400).json({ success: false, error: 'category and filename are required' });
    }

    const result = readLogFile(category, filename, lines);
    res.json(result);
  } catch (err) {
    console.error('Read log file error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:container/*', (req, res) => {
  const { container } = req.params;

  if (!ALLOWED_CONTAINERS.includes(container)) {
    return res.status(403).json({ success: false, error: 'Container not allowed' });
  }

  const relativePath = req.params[0];
  const sanitizedRelPath = sanitizePath(relativePath);

  const filePath = path.join(STORAGE_ROOT, container, sanitizedRelPath);

  if (!filePath.startsWith(path.join(STORAGE_ROOT, container))) {
    return res.status(403).json({ success: false, error: 'Invalid path' });
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
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

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', (err) => {
      console.error('File stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Stream error' });
      }
    });
    fileStream.pipe(res);
  });
});

export default router;
