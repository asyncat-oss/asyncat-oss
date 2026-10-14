import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  listDirectory,
  loadEntry,
  publicRoots,
  resolveExplorerPath,
  searchEntries,
  writeAttachment,
} from './fileExplorerService.js';

const router = express.Router();

const withWorkspaceContext = (req, _res, next) => {
  req.workspaceId = req.query?.workspaceId || req.body?.workspaceId || null;
  next();
};

const projectAccess = (req) => ({
  userId: req.user?.id || null,
  projectId: req.query?.projectId || req.body?.projectId || null,
});

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

router.get('/roots', withWorkspaceContext, (req, res) => {
  try {
    res.json({ success: true, roots: publicRoots(projectAccess(req)) });
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.get('/list', withWorkspaceContext, (req, res) => {
  try {
    res.json(listDirectory({
      rootId: req.query.rootId || 'workspace',
      relativePath: req.query.path || '.',
      includeHidden: req.query.hidden === 'true',
      ...projectAccess(req),
      ...parseListOptions(req.query),
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

router.get('/entry', withWorkspaceContext, (req, res) => {
  try {
    res.json(loadEntry({
      rootId: req.query.rootId || 'workspace',
      relativePath: req.query.path || '.',
      includeHidden: req.query.hidden === 'true',
      ...projectAccess(req),
      ...parseListOptions(req.query),
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

// Serve a static site from one attached Project folder. Keeping the root ID in
// the URL path lets relative CSS, JS, image, and link URLs resolve naturally,
// while resolveExplorerPath enforces the same containment and symlink rules as
// every other file operation.
router.get('/site/:rootId/*', withWorkspaceContext, (req, res) => {
  try {
    const rootId = req.params.rootId;
    if (!String(rootId || '').startsWith('project:')) {
      return res.status(403).json({
        success: false,
        error: 'Local previews require a folder attached to a Project',
        code: 'PROJECT_FOLDER_REQUIRED',
      });
    }

    let relativePath = req.params[0] || 'index.html';
    let resolved = resolveExplorerPath(rootId, relativePath, projectAccess(req));
    if (fs.existsSync(resolved.absolutePath) && fs.statSync(resolved.absolutePath).isDirectory()) {
      relativePath = path.posix.join(relativePath.replace(/\\/g, '/'), 'index.html');
      resolved = resolveExplorerPath(rootId, relativePath, projectAccess(req));
    }
    if (!fs.existsSync(resolved.absolutePath) || !fs.statSync(resolved.absolutePath).isFile()) {
      return res.status(404).send('Local preview file not found');
    }

    const isHtml = /\.html?$/i.test(resolved.absolutePath);
    res.setHeader('Cache-Control', isHtml ? 'no-store' : 'private, max-age=60');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    return res.sendFile(resolved.absolutePath);
  } catch (err) {
    return sendRouteError(res, err);
  }
});

router.get('/search', withWorkspaceContext, (req, res) => {
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
      ...projectAccess(req),
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

router.get('/raw', withWorkspaceContext, (req, res) => {
  try {
    const { rootId = 'workspace', path: relativePath } = req.query;
    if (!relativePath) {
      return res.status(400).json({ success: false, error: 'path is required' });
    }
    const entry = loadEntry({ rootId, relativePath, ...projectAccess(req) });
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

// ── Chat attachments ─────────────────────────────────────────────────────────

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1 } });

// The composer's "Attach" in a project chat. The file always goes to the
// folder's .asyncat/attachments under a name the server picks; the reply says
// where. Older clients send a whole path, of which only the name is used.
router.post('/upload', withWorkspaceContext, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'file is required' });
    }
    res.json(writeAttachment({
      rootId: req.body.rootId,
      name: req.body.name || req.file.originalname || req.body.path,
      content: req.file.buffer,
      ...projectAccess(req),
    }));
  } catch (err) {
    sendRouteError(res, err);
  }
});

export default router;
