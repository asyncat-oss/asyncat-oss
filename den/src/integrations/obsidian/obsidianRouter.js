// integrations/obsidian/obsidianRouter.js
import express from 'express';
import { isConfigured, getVaultPath, getVaultStats, listVaultFiles } from './obsidianService.js';

const router = express.Router();

// GET /api/integrations/obsidian/status
router.get('/status', (req, res) => {
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
router.get('/vault', (req, res) => {
  try {
    const files = listVaultFiles();
    res.json({ success: true, files, count: files.length });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
