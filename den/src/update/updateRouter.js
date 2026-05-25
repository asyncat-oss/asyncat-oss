import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { auth } from '../users/middleware/auth.js';

const router = express.Router();
router.use(auth);

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

export default router;
