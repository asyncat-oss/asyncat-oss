import express from 'express';
import {
  inspectSystemDependencies,
  recommendedInstallCommands,
} from '../lib/systemDeps.js';

const router = express.Router();

// GET /api/install/readiness — local installer/runtime dependency status.
// Cached for a minute; ?refresh=1 checks again.
router.get('/readiness', async (req, res) => {
  try {
    res.json({ success: true, ...(await inspectSystemDependencies({ refresh: String(req.query.refresh || '') === '1' })) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/install/commands?manager=brew — suggested package-manager commands.
router.get('/commands', async (req, res) => {
  try {
    const manager = String(req.query.manager || '').trim() || null;
    const report = await inspectSystemDependencies();
    res.json({
      success: true,
      manager,
      commands: await recommendedInstallCommands(report.checks, manager, { managers: report.packageManagers.available }),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

