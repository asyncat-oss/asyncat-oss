import express from 'express';
import { verifyUser } from '../../auth/authMiddleware.js';
import { attachDb } from '../../db/sqlite.js';
import {
  addFeed,
  addReadLaterItem,
  deleteFeed,
  deleteReadLaterItem,
  getRssStatus,
  listFeedItems,
  listFeeds,
  listReadLaterItems,
  refreshAllFeeds,
  refreshFeed,
  updateFeedItem,
  updateReadLaterItem,
} from './rssService.js';

const router = express.Router();

const auth = (req, res, next) => {
  verifyUser(req, res, (err) => {
    if (err) return next(err);
    attachDb(req, res, next);
  });
};

router.use(auth);

router.get('/status', (req, res) => {
  res.json({ success: true, ...getRssStatus(req.user.id) });
});

router.get('/feeds', (req, res) => {
  res.json({ success: true, feeds: listFeeds(req.user.id) });
});

router.post('/feeds', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ success: false, error: 'url is required' });
    const result = await addFeed(req.user.id, url);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/feeds/:id/refresh', async (req, res) => {
  try {
    const result = await refreshFeed(req.user.id, req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/feeds/:id', (req, res) => {
  const deleted = deleteFeed(req.user.id, req.params.id);
  res.status(deleted ? 200 : 404).json({ success: deleted, deleted });
});

router.post('/refresh', async (req, res) => {
  const results = await refreshAllFeeds(req.user.id);
  res.json({
    success: true,
    results,
    refreshed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  });
});

router.get('/items', (req, res) => {
  const items = listFeedItems(req.user.id, {
    feedId: req.query.feedId || null,
    limit: req.query.limit,
    unread: req.query.unread === '1' || req.query.unread === 'true',
    saved: req.query.saved === '1' || req.query.saved === 'true',
  });
  res.json({ success: true, count: items.length, items });
});

router.patch('/items/:id', (req, res) => {
  const item = updateFeedItem(req.user.id, req.params.id, req.body || {});
  if (!item) return res.status(404).json({ success: false, error: 'Item not found or no valid fields supplied' });
  res.json({ success: true, item });
});

router.get('/read-later', (req, res) => {
  const items = listReadLaterItems(req.user.id, {
    limit: req.query.limit,
    includeArchived: req.query.includeArchived === '1' || req.query.includeArchived === 'true',
    unread: req.query.unread === '1' || req.query.unread === 'true',
  });
  res.json({ success: true, count: items.length, items });
});

router.post('/read-later', async (req, res) => {
  try {
    const item = await addReadLaterItem(req.user.id, req.body || {});
    res.status(201).json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.patch('/read-later/:id', (req, res) => {
  const item = updateReadLaterItem(req.user.id, req.params.id, req.body || {});
  if (!item) return res.status(404).json({ success: false, error: 'Item not found or no valid fields supplied' });
  res.json({ success: true, item });
});

router.delete('/read-later/:id', (req, res) => {
  const deleted = deleteReadLaterItem(req.user.id, req.params.id);
  res.status(deleted ? 200 : 404).json({ success: deleted, deleted });
});

export default router;
