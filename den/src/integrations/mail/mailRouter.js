import express from 'express';
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import {
  getMailStatus,
  listImapMessages,
  sendMailMessage,
  testImapConnection,
  testSmtpConnection,
} from './mailService.js';

const router = express.Router();

const auth = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachDb(req, res, next);
  });
};

router.use(auth);

router.get('/status', (req, res) => {
  res.json({ success: true, ...getMailStatus() });
});

router.get('/messages', async (req, res) => {
  try {
    const messages = await listImapMessages({
      limit: req.query.limit,
      unread: req.query.unread === '1' || req.query.unread === 'true',
      mailbox: req.query.mailbox || 'INBOX',
    });
    res.json({ success: true, count: messages.length, messages });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/test-imap', async (_req, res) => {
  try {
    await testImapConnection();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/test-smtp', async (_req, res) => {
  try {
    await testSmtpConnection();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/send', async (req, res) => {
  try {
    const result = await sendMailMessage(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
