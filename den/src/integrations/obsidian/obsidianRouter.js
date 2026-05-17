// integrations/obsidian/obsidianRouter.js
import express from 'express';
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import { isConfigured, getVaultPath, getVaultStats, listVaultFiles } from './obsidianService.js';

const router = express.Router();

const auth = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachDb(req, res, next);
  });
};

// GET /api/integrations/obsidian/status
router.get('/status', auth, (req, res) => {
  const configured = isConfigured();
  const pathSet = !!getVaultPath();
  const stats = configured ? getVaultStats() : { notes: 0, folders: 0 };
  res.json({
    success: true,
    configured,
    pathSet,
    connected: configured,
    vaultPath: getVaultPath(),
    ...stats,
  });
});

// GET /api/integrations/obsidian/vault
// Returns a flat list of markdown files in the vault.
router.get('/vault', auth, (req, res) => {
  try {
    const files = listVaultFiles();
    res.json({ success: true, files, count: files.length });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
