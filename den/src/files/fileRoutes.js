import express from 'express';
import { verifyUser as jwtVerify } from '../auth/authMiddleware.js';
import { attachDb } from '../db/sqlite.js';
import {
  copyEntry,
  createDirectory,
  deleteEntry,
  listDirectory,
  loadEntry,
  moveEntry,
  publicRoots,
  searchEntries,
  writeFile,
} from './fileExplorerService.js';

const router = express.Router();

const authenticate = (req, res, next) => {
  jwtVerify(req, res, (err) => {
    if (err) return;
    attachDb(req, res, () => {
      req.workspaceId = req.query?.workspaceId || req.body?.workspaceId || null;
      next();
    });
  });
};

function sendRouteError(res, err) {
  res.status(err.status || 500).json({ success: false, error: err.message || 'File operation failed' });
}

router.get('/roots', authenticate, (req, res) => {
  try {
    res.json({ success: true, roots: publicRoots() });
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.get('/list', authenticate, (req, res) => {
  try {
    res.json(listDirectory({
      rootId: req.query.rootId || 'workspace',
      relativePath: req.query.path || '.',
      includeHidden: req.query.hidden === 'true',
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.get('/entry', authenticate, (req, res) => {
  try {
    res.json(loadEntry({
      rootId: req.query.rootId || 'workspace',
      relativePath: req.query.path || '.',
      includeHidden: req.query.hidden === 'true',
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.get('/preview', authenticate, (req, res) => {
  try {
    res.json(loadEntry({
      rootId: req.query.rootId || 'workspace',
      relativePath: req.query.path || '.',
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.get('/search', authenticate, (req, res) => {
  try {
    res.json(searchEntries({
      rootId: req.query.rootId || 'workspace',
      relativePath: req.query.path || '.',
      query: req.query.q || '',
      includeHidden: req.query.hidden === 'true',
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/mkdir', authenticate, (req, res) => {
  try {
    res.json(createDirectory({
      rootId: req.body.rootId || 'workspace',
      relativePath: req.body.path,
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/write', authenticate, (req, res) => {
  try {
    res.json(writeFile({
      rootId: req.body.rootId || 'workspace',
      relativePath: req.body.path,
      content: req.body.content || '',
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/copy', authenticate, (req, res) => {
  try {
    res.json(copyEntry({
      rootId: req.body.rootId || 'workspace',
      source: req.body.source,
      destination: req.body.destination,
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/move', authenticate, (req, res) => {
  try {
    res.json(moveEntry({
      rootId: req.body.rootId || 'workspace',
      source: req.body.source,
      destination: req.body.destination,
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/delete', authenticate, (req, res) => {
  try {
    res.json(deleteEntry({
      rootId: req.body.rootId || 'workspace',
      relativePath: req.body.path,
      recursive: req.body.recursive === true,
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

export default router;
