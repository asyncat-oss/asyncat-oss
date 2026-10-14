// den/src/storage/storageRouter.js
// The old Storage & logs panel's routes (/api/storage/summary, /uploads,
// /logs). Replaced by Files (filesRoutes.js, also under /api/storage); these
// go when that panel does. Attachments are served by attachmentStatic.js.

import express from 'express';
import { clearManagedUploads, getStorageSummary, getLogsSummary, clearLogs, readLogFile } from './storageService.js';

const router = express.Router();

router.get('/summary', async (req, res) => {
  try {
    const summary = await getStorageSummary();
    res.json(summary);
  } catch (err) {
    console.error('Storage summary error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/uploads', async (req, res) => {
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

router.get('/logs', (req, res) => {
  try {
    const summary = getLogsSummary();
    res.json(summary);
  } catch (err) {
    console.error('Logs summary error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/logs', async (req, res) => {
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

router.get('/logs/read', (req, res) => {
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

export default router;
