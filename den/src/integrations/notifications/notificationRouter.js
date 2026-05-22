import express from 'express';
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import { getNotificationStatus, notifyChannels } from './notificationService.js';
import db from '../../db/client.js';

const router = express.Router();

const auth = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachDb(req, res, next);
  });
};

router.use(auth);

router.get('/status', (_req, res) => {
  res.json({ success: true, ...getNotificationStatus() });
});

router.post('/send', async (req, res) => {
  try {
    const result = await notifyChannels(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/test', async (req, res) => {
  const { channel } = req.body || {};
  try {
    const result = await notifyChannels({
      channels: channel ? [channel] : undefined,
      title: 'Asyncat notification test',
      message: 'Your notification channel is connected and working correctly.',
      severity: 'success',
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/telegram/discover', async (_req, res) => {
  const token = process.env.NOTIFY_TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(400).json({ success: false, error: 'NOTIFY_TELEGRAM_BOT_TOKEN is not set.' });
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    if (!data.ok) {
      return res.status(400).json({ success: false, error: data.description || 'Telegram API error.' });
    }
    const update = data.result?.[0];
    const chatId = update?.message?.chat?.id ?? update?.channel_post?.chat?.id ?? update?.my_chat_member?.chat?.id;
    if (!chatId) {
      return res.json({
        success: false,
        chatId: null,
        message: 'No messages found. Open Telegram, send any message to your bot, then click Discover again.',
      });
    }
    res.json({ success: true, chatId: String(chatId) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/log', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit) || 50));
    const rows = db.prepare(
      `SELECT id, channel, title, message, severity, success, error, created_at
       FROM notification_log
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(limit);
    res.json({ success: true, count: rows.length, entries: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/log', (req, res) => {
  try {
    db.prepare('DELETE FROM notification_log').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
