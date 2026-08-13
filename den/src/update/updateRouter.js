import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = express.Router();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function getLocalInfo() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return {
    version: pkg.version,
    installDir: ROOT,
  };
}

// GET /api/update/status — returns version from package.json
router.get('/status', (req, res) => {
  try {
    res.json({ success: true, ...getLocalInfo() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/update/restart — request a graceful process restart. Electron uses
// its IPC lifecycle manager instead; this fallback is for supervised source or
// self-hosted deployments (systemd, pm2, Docker restart policies, etc.).
router.post('/restart', (_req, res) => {
  res.status(202).json({
    success: true,
    message: 'Graceful backend restart requested.',
  });
  const timer = setTimeout(() => {
    process.kill(process.pid, 'SIGTERM');
  }, 250);
  timer.unref?.();
});

export default router;
