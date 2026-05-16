import express from 'express';
import { auth } from '../users/middleware/auth.js';
import {
  inspectSystemDependencies,
  recommendedInstallCommands,
} from '../../../cli/lib/systemDeps.js';

const router = express.Router();
router.use(auth);

// GET /api/install/readiness — local installer/runtime dependency status.
router.get('/readiness', (_req, res) => {
  try {
    res.json({ success: true, ...inspectSystemDependencies() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/install/commands?manager=brew — suggested package-manager commands.
router.get('/commands', (req, res) => {
  try {
    const manager = String(req.query.manager || '').trim() || null;
    const report = inspectSystemDependencies();
    res.json({
      success: true,
      manager,
      commands: recommendedInstallCommands(report.checks, manager),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

