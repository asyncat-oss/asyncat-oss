import fs from 'fs';
import os from 'os';
import path from 'path';

const SKIP_NAMES = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', 'build', 'venv', '.venv']);
const TEXT_PREVIEW_LIMIT = 1024 * 1024;

function existsDir(dir) {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function normalizeRootPath(rootPath) {
  return path.resolve(rootPath);
}

export function getFileRoots() {
  const home = os.homedir();
  const candidates = [
    { id: 'workspace', label: 'Workspace', path: process.cwd(), kind: 'workspace' },
    { id: 'home', label: 'Home', path: home, kind: 'home' },
    { id: 'dev', label: 'Dev', path: path.join(home, 'Dev'), kind: 'dev' },
    { id: 'hermes', label: 'Hermes', path: path.join(home, 'Hermes'), kind: 'folder' },
    { id: 'desktop', label: 'Desktop', path: path.join(home, 'Desktop'), kind: 'place' },
    { id: 'documents', label: 'Documents', path: path.join(home, 'Documents'), kind: 'place' },
    { id: 'downloads', label: 'Downloads', path: path.join(home, 'Downloads'), kind: 'downloads' },
    { id: 'music', label: 'Music', path: path.join(home, 'Music'), kind: 'music' },
    { id: 'pictures', label: 'Pictures', path: path.join(home, 'Pictures'), kind: 'pictures' },
    { id: 'videos', label: 'Videos', path: path.join(home, 'Videos'), kind: 'videos' },
    { id: 'public', label: 'Public', path: path.join(home, 'Public'), kind: 'public' },
    { id: 'templates', label: 'Templates', path: path.join(home, 'Templates'), kind: 'templates' },
    { id: 'trash', label: 'Trash', path: path.join(home, '.local', 'share', 'Trash', 'files'), kind: 'trash' },
  ];

  const seen = new Set();
  return candidates
    .filter(root => existsDir(root.path))
    .map(root => ({ ...root, path: normalizeRootPath(root.path) }))
    .filter(root => {
      const key = root.path.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getRoot(rootId = 'workspace') {
  const roots = getFileRoots();
  return roots.find(root => root.id === rootId) || roots[0];
}

export function resolveExplorerPath(rootId = 'workspace', relativePath = '.') {
  const root = getRoot(rootId);
  if (!root) throw new Error('No file roots are available');

  const cleanRelative = relativePath || '.';
  const rootPath = normalizeRootPath(root.path);
  const resolved = path.resolve(rootPath, cleanRelative);

  if (resolved !== rootPath && !resolved.startsWith(rootPath + path.sep)) {
    const err = new Error('Path outside selected root');
    err.status = 403;
    throw err;
  }

  return {
    root,
    rootPath,
    absolutePath: resolved,
    relativePath: path.relative(rootPath, resolved) || '.',
  };
}

function fileExt(name) {
  return path.extname(name).slice(1).toLowerCase();
}

function entryMeta(rootPath, absolutePath, name = path.basename(absolutePath)) {
  const stat = fs.statSync(absolutePath);
  const rel = path.relative(rootPath, absolutePath) || '.';
  const isDir = stat.isDirectory();
  return {
    name,
    path: rel,
    type: isDir ? 'dir' : 'file',
    size: isDir ? null : stat.size,
    mtime: stat.mtime,
    ext: isDir ? '' : fileExt(name),
    hidden: name.startsWith('.'),
  };
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
}

export function listDirectory({ rootId = 'workspace', relativePath = '.', includeHidden = false }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  if (!fs.existsSync(ctx.absolutePath)) {
    const err = new Error('Directory not found');
    err.status = 404;
    throw err;
  }
  if (!fs.statSync(ctx.absolutePath).isDirectory()) {
    const err = new Error('Not a directory');
    err.status = 400;
    throw err;
  }

  let names = [];
  try {
    names = fs.readdirSync(ctx.absolutePath);
  } catch {
    names = [];
  }

  const entries = names
    .filter(name => includeHidden || (!name.startsWith('.') && !SKIP_NAMES.has(name)))
    .map(name => {
      try {
        return entryMeta(ctx.rootPath, path.join(ctx.absolutePath, name), name);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return {
    success: true,
    root: publicRoot(ctx.root),
    path: ctx.relativePath,
    entries: sortEntries(entries),
  };
}

export function loadEntry({ rootId = 'workspace', relativePath = '.', includeHidden = false }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  if (!fs.existsSync(ctx.absolutePath)) {
    const err = new Error('Path not found');
    err.status = 404;
    throw err;
  }

  const stat = fs.statSync(ctx.absolutePath);
  if (stat.isDirectory()) {
    const listed = listDirectory({ rootId: ctx.root.id, relativePath: ctx.relativePath, includeHidden });
    return { ...listed, type: 'dir' };
  }

  const meta = entryMeta(ctx.rootPath, ctx.absolutePath);
  if (stat.size > TEXT_PREVIEW_LIMIT) {
    return { success: true, root: publicRoot(ctx.root), ...meta, tooLarge: true };
  }

  try {
    const content = fs.readFileSync(ctx.absolutePath, 'utf8');
    return { success: true, root: publicRoot(ctx.root), ...meta, content };
  } catch {
    return { success: true, root: publicRoot(ctx.root), ...meta, binary: true };
  }
}

export function searchEntries({ rootId = 'workspace', relativePath = '.', query = '', includeHidden = false, maxResults = 80 }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  const needle = query.trim().toLowerCase();
  if (!needle) return { success: true, root: publicRoot(ctx.root), path: ctx.relativePath, entries: [] };

  const results = [];
  function walk(dir) {
    if (results.length >= maxResults) return;
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return; }

    for (const name of names) {
      if (results.length >= maxResults) break;
      if (!includeHidden && (name.startsWith('.') || SKIP_NAMES.has(name))) continue;
      const full = path.join(dir, name);
      let meta;
      try { meta = entryMeta(ctx.rootPath, full, name); } catch { continue; }
      if (name.toLowerCase().includes(needle)) results.push(meta);
      if (meta.type === 'dir') walk(full);
    }
  }
  walk(ctx.absolutePath);

  return { success: true, root: publicRoot(ctx.root), path: ctx.relativePath, entries: sortEntries(results) };
}

export function createDirectory({ rootId = 'workspace', relativePath }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  fs.mkdirSync(ctx.absolutePath, { recursive: true });
  return { success: true, entry: entryMeta(ctx.rootPath, ctx.absolutePath) };
}

export function writeFile({ rootId = 'workspace', relativePath, content = '' }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  fs.mkdirSync(path.dirname(ctx.absolutePath), { recursive: true });
  fs.writeFileSync(ctx.absolutePath, content, 'utf8');
  return { success: true, entry: entryMeta(ctx.rootPath, ctx.absolutePath) };
}

export function copyEntry({ rootId = 'workspace', source, destination }) {
  const src = resolveExplorerPath(rootId, source);
  const dst = resolveExplorerPath(rootId, destination);
  if (!fs.existsSync(src.absolutePath)) {
    const err = new Error('Source not found');
    err.status = 404;
    throw err;
  }
  fs.mkdirSync(path.dirname(dst.absolutePath), { recursive: true });
  fs.cpSync(src.absolutePath, dst.absolutePath, { recursive: true, errorOnExist: false });
  return { success: true, entry: entryMeta(dst.rootPath, dst.absolutePath) };
}

export function moveEntry({ rootId = 'workspace', source, destination }) {
  const src = resolveExplorerPath(rootId, source);
  const dst = resolveExplorerPath(rootId, destination);
  if (!fs.existsSync(src.absolutePath)) {
    const err = new Error('Source not found');
    err.status = 404;
    throw err;
  }
  fs.mkdirSync(path.dirname(dst.absolutePath), { recursive: true });
  fs.renameSync(src.absolutePath, dst.absolutePath);
  return { success: true, entry: entryMeta(dst.rootPath, dst.absolutePath) };
}

export function deleteEntry({ rootId = 'workspace', relativePath, recursive = false }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  if (ctx.relativePath === '.') {
    const err = new Error('Cannot delete a root');
    err.status = 400;
    throw err;
  }
  if (!fs.existsSync(ctx.absolutePath)) {
    const err = new Error('Path not found');
    err.status = 404;
    throw err;
  }
  const stat = fs.statSync(ctx.absolutePath);
  if (stat.isDirectory() && !recursive) {
    const err = new Error('Directory delete requires recursive=true');
    err.status = 400;
    throw err;
  }
  if (stat.isDirectory()) fs.rmSync(ctx.absolutePath, { recursive: true, force: true });
  else fs.unlinkSync(ctx.absolutePath);
  return { success: true, path: ctx.relativePath };
}

export function publicRoot(root) {
  return {
    id: root.id,
    label: root.label,
    kind: root.kind,
    path: root.path,
  };
}

export function publicRoots() {
  return getFileRoots().map(publicRoot);
}
