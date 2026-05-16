import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { verifyUser as jwtVerify } from '../auth/authMiddleware.js';
import { attachDb } from '../db/sqlite.js';
import {
  batchCopyEntries,
  batchDeleteEntries,
  copyEntry,
  createArchive,
  createDirectory,
  deleteEntry,
  extractArchive,
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
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'File operation failed',
    code: err.code || 'FILE_OPERATION_FAILED',
  });
}

function parseListOptions(query) {
  return {
    sort: query.sort || 'name',
    order: query.order === 'desc' ? 'desc' : 'asc',
    limit: Math.min(Math.max(parseInt(query.limit || '1000', 10) || 1000, 1), 5000),
  };
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
      ...parseListOptions(req.query),
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
      ...parseListOptions(req.query),
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
      ...parseListOptions(req.query),
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.get('/search', authenticate, (req, res) => {
  try {
    const maxResults = Math.min(Math.max(parseInt(req.query.max || '120', 10) || 120, 1), 500);
    res.json(searchEntries({
      rootId: req.query.rootId || 'workspace',
      relativePath: req.query.path || '.',
      query: req.query.q || '',
      contentQuery: req.query.cq || '',
      includeHidden: req.query.hidden === 'true',
      maxResults,
      sort: req.query.sort || 'relevance',
      order: req.query.order === 'desc' ? 'desc' : 'asc',
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
      overwrite: req.body.overwrite === true,
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
      overwrite: req.body.overwrite !== false,
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
      overwrite: req.body.overwrite !== false,
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
      overwrite: req.body.overwrite !== false,
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/batch-delete', authenticate, (req, res) => {
  try {
    res.json(batchDeleteEntries({
      rootId: req.body.rootId || 'workspace',
      entries: Array.isArray(req.body.entries) ? req.body.entries : [],
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/batch-copy', authenticate, (req, res) => {
  try {
    res.json(batchCopyEntries({
      rootId: req.body.rootId || 'workspace',
      entries: Array.isArray(req.body.entries) ? req.body.entries : [],
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

// ── Raw file serving (images, video, audio, etc.) ────────────────────────────

const MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  pdf: 'application/pdf',
};

router.get('/raw', authenticate, (req, res) => {
  try {
    const { rootId = 'workspace', path: relativePath } = req.query;
    if (!relativePath) {
      return res.status(400).json({ success: false, error: 'path is required' });
    }
    const entry = loadEntry({ rootId, relativePath });
    if (!entry.success || entry.type !== 'file') {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    const ext = path.extname(relativePath).slice(1).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    const stream = fs.createReadStream(path.join(entry.root.path, relativePath));
    stream.on('error', () => res.status(500).json({ success: false, error: 'Failed to read file' }));
    stream.pipe(res);
  } catch (err) {
    sendRouteError(res, err);
  }
});

// ── Archive operations ───────────────────────────────────────────────────────

router.post('/archive/extract', authenticate, async (req, res) => {
  try {
    res.json(await extractArchive({
      rootId: req.body.rootId || 'workspace',
      relativePath: req.body.path,
      destination: req.body.destination || null,
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.post('/archive/create', authenticate, async (req, res) => {
  try {
    res.json(await createArchive({
      rootId: req.body.rootId || 'workspace',
      paths: Array.isArray(req.body.paths) ? req.body.paths : [],
      destination: req.body.destination,
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// ── File upload ──────────────────────────────────────────────────────────────

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  try {
    const { rootId = 'workspace', path: relativePath } = req.body;
    if (!req.file || !relativePath) {
      return res.status(400).json({ success: false, error: 'file and path are required' });
    }
    res.json(writeFile({
      rootId,
      relativePath,
      content: req.file.buffer,
      overwrite: req.body.overwrite === true || req.body.overwrite === 'true',
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

export default router;
