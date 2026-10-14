// den/src/privacy/privacyRoutes.js
// /api/privacy: where things are kept, sites agents never open, the command
// sandbox, export everything, delete everything.

import express from 'express';
import { runtimeDataRoot } from '../config/runtimeConfig.js';
import { isHostConnected, requestFromHost } from '../lib/hostBridge.js';
import { exportEstimate, exportEverything, privacyOverview } from './privacyService.js';
import { getBlockedSites, setBlockedSites } from './blockedSites.js';
import { cancelReset, pendingReset, requestReset } from './resetData.js';
import { sandboxStatus } from '../agent/commandSandbox.js';
import { updateSandboxSettings } from './sandboxSettings.js';

export const RESET_PHRASE = 'delete everything';

const router = express.Router();

router.get('/', (_req, res) => {
  try {
    res.json({ success: true, ...privacyOverview(), blockedSites: getBlockedSites(), pendingReset: pendingReset(runtimeDataRoot()) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// { sites: ["bank.example", …] } — anything that isn't a site is dropped.
router.put('/blocked-sites', (req, res) => {
  try {
    if (!Array.isArray(req.body?.sites)) return res.status(400).json({ success: false, error: 'sites must be a list' });
    res.json({ success: true, blockedSites: setBlockedSites(req.body.sites) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// The command sandbox: on and working, on but unable to start (and why),
// or off; its network; hidden folders. ?recheck=1 tries bwrap again.
router.get('/sandbox', (req, res) => {
  try {
    res.json({ success: true, sandbox: sandboxStatus({ recheck: req.query.recheck === '1' }) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// { enabled?, network?: open|registries|off, allowRead?: [path], registries?: [host] }
router.put('/sandbox', (req, res) => {
  try {
    res.json({ success: true, sandbox: updateSandboxSettings(req.body || {}) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

router.get('/export/estimate', async (_req, res) => {
  try {
    res.json({ success: true, estimate: await exportEstimate() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/export', async (_req, res) => {
  try {
    res.json({ success: true, export: await exportEverything() });
  } catch (err) {
    res.status(500).json({ success: false, error: `Couldn't export: ${err.message}` });
  }
});

// { confirm: "delete everything", includeModels } — carried out on the next
// start; the app restarts den right after.
router.post('/reset', async (req, res) => {
  try {
    if (String(req.body?.confirm || '').trim().toLowerCase() !== RESET_PHRASE) {
      return res.status(400).json({ success: false, error: `Type "${RESET_PHRASE}" to confirm.` });
    }
    const marker = requestReset(runtimeDataRoot(), { includeModels: Boolean(req.body?.includeModels) });
    // The desktop app forgets its browsing data (sign-ins, Cat profiles, tabs) now.
    let browsing = false;
    if (isHostConnected()) {
      browsing = await requestFromHost('app.forgetBrowsing', {}, { timeoutMs: 15_000 }).then(() => true).catch(() => false);
    }
    res.json({ success: true, scheduled: marker, browsingCleared: browsing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/reset', (_req, res) => {
  cancelReset(runtimeDataRoot());
  res.json({ success: true });
});

export default router;
