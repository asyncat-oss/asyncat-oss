// den/src/lib/notifyRoutes.js
// /api/notifications/desktop: which events show a desktop notification and
// the quiet hours (Settings → Notifications), and a test notification.

import express from 'express';
import { getNotifyPrefs, inQuietHours, setNotifyPrefs } from './notify.js';
import { isHostConnected, sendToHost } from './hostBridge.js';

const router = express.Router();

router.get('/desktop', (_req, res) => {
  const prefs = getNotifyPrefs();
  res.json({ success: true, prefs, quietNow: inQuietHours(prefs), desktop: isHostConnected() });
});

router.put('/desktop', async (req, res) => {
  try {
    const prefs = await setNotifyPrefs(req.body?.prefs || req.body || {});
    res.json({ success: true, prefs, quietNow: inQuietHours(prefs) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// A test always shows, even in quiet hours: the user asked for it.
router.post('/desktop/test', (_req, res) => {
  if (!isHostConnected()) {
    return res.status(409).json({ success: false, error: 'Desktop notifications come from the Asyncat desktop app, which is not connected.' });
  }
  sendToHost('notify', { title: 'Asyncat', body: 'Notifications work. This is how a finished task or a question will look.', route: '/settings/notifications' });
  res.json({ success: true });
});

export default router;
