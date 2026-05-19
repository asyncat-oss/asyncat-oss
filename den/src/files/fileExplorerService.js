import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const SKIP_NAMES = new Set(['.git', 'node_modules', '__pycache__', '.next', 'dist', 'build', 'venv', '.venv']);
const TEXT_PREVIEW_LIMIT = 5 * 1024 * 1024;
const CONTENT_SEARCH_SIZE_LIMIT = 512 * 1024;
const SEARCH_COLLECT_LIMIT = 2000;
const SOURCE_WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a']);
const BINARY_EXTS = new Set([
  ...IMAGE_EXTS,
  ...VIDEO_EXTS,
  ...AUDIO_EXTS,
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pdf', 'zip', 'tar', 'gz', 'rar', '7z',
  'exe', 'dll', 'so', 'dylib', 'bin',
]);
const TEXT_EXTS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'json', 'md', 'mdx', 'txt', 'rst', 'log', 'csv',
  'html', 'htm', 'xml', 'css', 'scss', 'less', 'sass',
  'yaml', 'yml', 'toml', 'ini', 'env',
  'sql', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'swift', 'kt', 'astro',
]);
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
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  log: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  xml: 'application/xml',
  css: 'text/css',
  csv: 'text/csv',
};

function formatPermissions(mode) {
  const oct = (mode & 0o777).toString(8).padStart(3, '0');
  const symbolic = [
    mode & 0o400 ? 'r' : '-', mode & 0o200 ? 'w' : '-', mode & 0o100 ? 'x' : '-',
    mode & 0o040 ? 'r' : '-', mode & 0o020 ? 'w' : '-', mode & 0o010 ? 'x' : '-',
    mode & 0o004 ? 'r' : '-', mode & 0o002 ? 'w' : '-', mode & 0o001 ? 'x' : '-',
  ].join('');
  return { octal: oct, symbolic };
}

function contentMatchSnippet(absolutePath, needle) {
  try {
    const stat = fs.statSync(absolutePath);
    if (stat.size > CONTENT_SEARCH_SIZE_LIMIT) return null;
    const content = fs.readFileSync(absolutePath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        return { line: i + 1, snippet: lines[i].trim().slice(0, 150) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

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

export function getWorkspaceRoot() {
  const configuredRoot = process.env.ASYNCAT_WORKSPACE_ROOT || process.env.WORKSPACE_ROOT;
  if (configuredRoot && existsDir(configuredRoot)) return normalizeRootPath(configuredRoot);

  if (
    existsDir(path.join(SOURCE_WORKSPACE_ROOT, 'den')) &&
    existsDir(path.join(SOURCE_WORKSPACE_ROOT, 'neko'))
  ) {
    return normalizeRootPath(SOURCE_WORKSPACE_ROOT);
  }

  return normalizeRootPath(process.cwd());
}

export function getSandboxRoot() {
  const root = process.env.ASYNCAT_SANDBOX_DIR || path.join(getWorkspaceRoot(), '.asyncat', 'sandboxes');
  return existsDir(root) ? fs.realpathSync(root) : normalizeRootPath(root);
}

export function getFileRoots() {
  const home = os.homedir();
  const candidates = [
    { id: 'workspace', label: 'Workspace', path: getWorkspaceRoot(), kind: 'workspace' },
    { id: 'sandboxes', label: 'Sandboxes', path: getSandboxRoot(), kind: 'sandbox' },
    { id: 'home', label: 'Home', path: home, kind: 'home' },
    { id: 'dev', label: 'Dev', path: path.join(home, 'Dev'), kind: 'dev' },
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
    err.code = 'OUTSIDE_ROOT';
    throw err;
  }

  return {
    root,
    rootPath,
    absolutePath: resolved,
    relativePath: path.relative(rootPath, resolved) || '.',
  };
}

export function resolveWorkingDirectoryContext(context = {}) {
  const rootId = context?.rootId || 'workspace';
  const relativePath = context?.relativePath || context?.path || '.';
  const resolved = resolveExplorerPath(rootId, relativePath);

  if (!fs.existsSync(resolved.absolutePath)) {
    throw createRouteError('Working directory not found', 404, 'NOT_FOUND');
  }
  if (!fs.statSync(resolved.absolutePath).isDirectory()) {
    throw createRouteError('Working context must be a directory', 400, 'NOT_DIRECTORY');
  }

  return {
    root: publicRoot(resolved.root),
    rootId: resolved.root.id,
    rootLabel: resolved.root.label,
    rootKind: resolved.root.kind,
    rootPath: resolved.rootPath,
    relativePath: resolved.relativePath,
    workingDir: resolved.absolutePath,
  };
}

function fileExt(name) {
  return path.extname(name).slice(1).toLowerCase();
}

function mimeForExt(ext) {
  if (!ext) return 'application/octet-stream';
  if (MIME_TYPES[ext]) return MIME_TYPES[ext];
  if (TEXT_EXTS.has(ext)) return 'text/plain';
  return 'application/octet-stream';
}

function isEditableExt(ext) {
  return !BINARY_EXTS.has(ext) && (TEXT_EXTS.has(ext) || !ext);
}

function isPreviewableExt(ext) {
  return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext) || ext === 'pdf' || isEditableExt(ext);
}

function countChildren(absolutePath) {
  try {
    return fs.readdirSync(absolutePath).length;
  } catch {
    return null;
  }
}

function entryMeta(rootPath, absolutePath, name = path.basename(absolutePath)) {
  const stat = fs.statSync(absolutePath);
  const rel = path.relative(rootPath, absolutePath) || '.';
  const isDir = stat.isDirectory();
  const ext = isDir ? '' : fileExt(name);
  return {
    name,
    path: rel,
    type: isDir ? 'dir' : 'file',
    size: isDir ? null : stat.size,
    mtime: stat.mtime,
    ext,
    mime: isDir ? 'inode/directory' : mimeForExt(ext),
    isPreviewable: isDir ? false : isPreviewableExt(ext),
    isEditable: isDir ? false : isEditableExt(ext) && stat.size <= TEXT_PREVIEW_LIMIT,
    childrenCount: isDir ? countChildren(absolutePath) : undefined,
    hidden: name.startsWith('.'),
    permissions: formatPermissions(stat.mode),
  };
}

function normalizeSort(sort) {
  return ['name', 'size', 'mtime', 'type'].includes(sort) ? sort : 'name';
}

function sortEntries(entries, sort = 'name', order = 'asc') {
  const sortKey = normalizeSort(sort);
  const dir = order === 'desc' ? -1 : 1;
  return entries.sort((a, b) => {
    if (sortKey === 'name' && a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    let result = 0;
    if (sortKey === 'size') result = (a.size || 0) - (b.size || 0);
    else if (sortKey === 'mtime') result = new Date(a.mtime).getTime() - new Date(b.mtime).getTime();
    else if (sortKey === 'type') result = `${a.type}:${a.ext || ''}`.localeCompare(`${b.type}:${b.ext || ''}`);
    else result = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    if (result === 0) result = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    return result * dir;
  });
}

function createRouteError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function assertDestinationAvailable(ctx, overwrite) {
  if (!overwrite && fs.existsSync(ctx.absolutePath)) {
    throw createRouteError('Destination already exists', 409, 'CONFLICT');
  }
}

export function listDirectory({ rootId = 'workspace', relativePath = '.', includeHidden = false, sort = 'name', order = 'asc', limit = 1000 }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  if (!fs.existsSync(ctx.absolutePath)) {
    throw createRouteError('Directory not found', 404, 'NOT_FOUND');
  }
  if (!fs.statSync(ctx.absolutePath).isDirectory()) {
    throw createRouteError('Not a directory', 400, 'NOT_DIRECTORY');
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
    entries: sortEntries(entries, sort, order).slice(0, limit),
  };
}

export function loadEntry({ rootId = 'workspace', relativePath = '.', includeHidden = false, sort = 'name', order = 'asc', limit = 1000 }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  if (!fs.existsSync(ctx.absolutePath)) {
    throw createRouteError('Path not found', 404, 'NOT_FOUND');
  }

  const stat = fs.statSync(ctx.absolutePath);
  if (stat.isDirectory()) {
    const listed = listDirectory({ rootId: ctx.root.id, relativePath: ctx.relativePath, includeHidden, sort, order, limit });
    return { ...listed, type: 'dir' };
  }

  const meta = entryMeta(ctx.rootPath, ctx.absolutePath);
  if (stat.size > TEXT_PREVIEW_LIMIT) {
    return { success: true, root: publicRoot(ctx.root), ...meta, tooLarge: true, code: 'TOO_LARGE' };
  }

  if (!meta.isEditable) {
    return { success: true, root: publicRoot(ctx.root), ...meta, binary: true };
  }

  try {
    const content = fs.readFileSync(ctx.absolutePath, 'utf8');
    return { success: true, root: publicRoot(ctx.root), ...meta, content };
  } catch {
    return { success: true, root: publicRoot(ctx.root), ...meta, binary: true };
  }
}

function searchScore(entry, needle) {
  const name = entry.name.toLowerCase();
  const ext = entry.ext ? `.${entry.ext}` : '';
  const base = ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
  const entryPath = entry.path.toLowerCase();
  const segments = entryPath.split(/[\\/]/g);

  let score = 1000;
  if (base === needle) score = 0;
  else if (name === needle) score = 1;
  else if (base.startsWith(needle)) score = 10;
  else if (name.startsWith(needle)) score = 20;
  else if (segments.some(segment => segment.startsWith(needle))) score = 35;
  else if (base.includes(needle)) score = 50;
  else if (name.includes(needle)) score = 60;
  else score = 90;

  if (entry.type === 'dir') score += 8;
  score += Math.min(entryPath.length / 1000, 2);
  return score;
}

function sortSearchEntries(entries, needle) {
  return entries.sort((a, b) => {
    const scoreDiff = searchScore(a, needle) - searchScore(b, needle);
    if (scoreDiff !== 0) return scoreDiff;
    if (a.type !== b.type) return a.type === 'file' ? -1 : 1;
    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base', numeric: true });
  });
}

export function searchEntries({ rootId = 'workspace', relativePath = '.', query = '', includeHidden = false, maxResults = 80, sort = 'relevance', order = 'asc', contentQuery = '' }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  const nameNeedle = query.trim().toLowerCase();
  const contentNeedle = contentQuery.trim().toLowerCase();
  if (!nameNeedle && !contentNeedle) return { success: true, root: publicRoot(ctx.root), path: ctx.relativePath, entries: [] };

  const seen = new Map();
  function walk(dir) {
    if (seen.size >= SEARCH_COLLECT_LIMIT) return;
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return; }
    names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));

    for (const name of names) {
      if (seen.size >= SEARCH_COLLECT_LIMIT) break;
      if (!includeHidden && (name.startsWith('.') || SKIP_NAMES.has(name))) continue;
      const full = path.join(dir, name);
      let meta;
      try { meta = entryMeta(ctx.rootPath, full, name); } catch { continue; }

      if (nameNeedle && name.toLowerCase().includes(nameNeedle) && !seen.has(meta.path)) {
        seen.set(meta.path, meta);
      }
      if (contentNeedle && meta.type === 'file' && !BINARY_EXTS.has(meta.ext || '') && !seen.has(meta.path)) {
        const match = contentMatchSnippet(full, contentNeedle);
        if (match) seen.set(meta.path, { ...meta, snippet: match.snippet, snippetLine: match.line });
      }
      if (meta.type === 'dir') walk(full);
    }
  }
  walk(ctx.absolutePath);

  const results = [...seen.values()];
  const effectiveNeedle = nameNeedle || contentNeedle;
  return {
    success: true,
    root: publicRoot(ctx.root),
    path: ctx.relativePath,
    entries: (sort === 'relevance' && nameNeedle ? sortSearchEntries(results, effectiveNeedle) : sortEntries(results, sort, order)).slice(0, maxResults),
  };
}

export function createDirectory({ rootId = 'workspace', relativePath, overwrite = false }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  assertDestinationAvailable(ctx, overwrite);
  fs.mkdirSync(ctx.absolutePath, { recursive: true });
  return { success: true, entry: entryMeta(ctx.rootPath, ctx.absolutePath) };
}

export function writeFile({ rootId = 'workspace', relativePath, content = '', overwrite = true }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  assertDestinationAvailable(ctx, overwrite);
  fs.mkdirSync(path.dirname(ctx.absolutePath), { recursive: true });
  if (Buffer.isBuffer(content)) {
    fs.writeFileSync(ctx.absolutePath, content);
  } else {
    fs.writeFileSync(ctx.absolutePath, content, 'utf8');
  }
  return { success: true, entry: entryMeta(ctx.rootPath, ctx.absolutePath) };
}

export function copyEntry({ rootId = 'workspace', source, destination, overwrite = true }) {
  const src = resolveExplorerPath(rootId, source);
  const dst = resolveExplorerPath(rootId, destination);
  if (!fs.existsSync(src.absolutePath)) {
    throw createRouteError('Source not found', 404, 'NOT_FOUND');
  }
  assertDestinationAvailable(dst, overwrite);
  fs.mkdirSync(path.dirname(dst.absolutePath), { recursive: true });
  fs.cpSync(src.absolutePath, dst.absolutePath, { recursive: true, errorOnExist: !overwrite, force: overwrite });
  return { success: true, entry: entryMeta(dst.rootPath, dst.absolutePath) };
}

export function moveEntry({ rootId = 'workspace', source, destination, overwrite = true }) {
  const src = resolveExplorerPath(rootId, source);
  const dst = resolveExplorerPath(rootId, destination);
  if (!fs.existsSync(src.absolutePath)) {
    throw createRouteError('Source not found', 404, 'NOT_FOUND');
  }
  assertDestinationAvailable(dst, overwrite);
  fs.mkdirSync(path.dirname(dst.absolutePath), { recursive: true });
  fs.renameSync(src.absolutePath, dst.absolutePath);
  return { success: true, entry: entryMeta(dst.rootPath, dst.absolutePath) };
}

export function deleteEntry({ rootId = 'workspace', relativePath, recursive = false }) {
  const ctx = resolveExplorerPath(rootId, relativePath);
  if (ctx.relativePath === '.') {
    throw createRouteError('Cannot delete a root', 400, 'ROOT_DELETE');
  }
  if (!fs.existsSync(ctx.absolutePath)) {
    throw createRouteError('Path not found', 404, 'NOT_FOUND');
  }
  const stat = fs.statSync(ctx.absolutePath);
  if (stat.isDirectory() && !recursive) {
    throw createRouteError('Directory delete requires recursive=true', 400, 'RECURSIVE_REQUIRED');
  }
  if (stat.isDirectory()) fs.rmSync(ctx.absolutePath, { recursive: true, force: true });
  else fs.unlinkSync(ctx.absolutePath);
  return { success: true, path: ctx.relativePath };
}

export function batchDeleteEntries({ rootId = 'workspace', entries = [] }) {
  const deleted = [];
  const errors = [];
  for (const item of entries) {
    try {
      const result = deleteEntry({ rootId, relativePath: item.path, recursive: item.recursive === true });
      deleted.push(result.path);
    } catch (err) {
      errors.push({ path: item.path, error: err.message, code: err.code || 'UNKNOWN' });
    }
  }
  return { success: errors.length === 0, deleted, errors };
}

export function batchCopyEntries({ rootId = 'workspace', entries = [] }) {
  const copied = [];
  const errors = [];
  for (const item of entries) {
    try {
      const result = copyEntry({ rootId, source: item.source, destination: item.destination, overwrite: item.overwrite === true });
      copied.push(result.entry);
    } catch (err) {
      errors.push({ source: item.source, destination: item.destination, error: err.message, code: err.code || 'UNKNOWN' });
    }
  }
  return { success: errors.length === 0, entries: copied, errors };
}

function archiveBaseName(name) {
  return name
    .replace(/\.tar\.gz$/i, '')
    .replace(/\.tar\.bz2$/i, '')
    .replace(/\.tar\.xz$/i, '')
    .replace(/\.(tgz|tbz|zip|tar|gz|bz2|xz)$/i, '');
}

function addDirToZip(zipFolder, absoluteDir) {
  for (const child of fs.readdirSync(absoluteDir)) {
    const childPath = path.join(absoluteDir, child);
    const stat = fs.statSync(childPath);
    if (stat.isDirectory()) {
      addDirToZip(zipFolder.folder(child), childPath);
    } else {
      zipFolder.file(child, fs.readFileSync(childPath));
    }
  }
}

export async function extractArchive({ rootId = 'workspace', relativePath, destination }) {
  const { default: JSZip } = await import('jszip');
  const ctx = resolveExplorerPath(rootId, relativePath);
  if (!fs.existsSync(ctx.absolutePath)) throw createRouteError('Archive not found', 404, 'NOT_FOUND');

  const name = path.basename(relativePath);
  const lowerName = name.toLowerCase();
  const destRelative = destination || path.join(path.dirname(relativePath), archiveBaseName(name));
  const destCtx = resolveExplorerPath(rootId, destRelative);
  fs.mkdirSync(destCtx.absolutePath, { recursive: true });

  if (lowerName.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(fs.readFileSync(ctx.absolutePath));
    for (const [entryName, zipEntry] of Object.entries(zip.files)) {
      const outPath = path.join(destCtx.absolutePath, entryName);
      if (zipEntry.dir) {
        fs.mkdirSync(outPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, await zipEntry.async('nodebuffer'));
      }
    }
  } else if (lowerName.endsWith('.tar') || lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz') || lowerName.endsWith('.tar.bz2') || lowerName.endsWith('.tbz')) {
    const { execSync } = await import('child_process');
    execSync(`tar -xf "${ctx.absolutePath}" -C "${destCtx.absolutePath}"`, { stdio: 'pipe' });
  } else if (lowerName.endsWith('.gz')) {
    const zlib = await import('zlib');
    const outName = path.basename(relativePath, '.gz');
    const outPath = path.join(destCtx.absolutePath, outName);
    const compressed = fs.readFileSync(ctx.absolutePath);
    fs.writeFileSync(outPath, zlib.gunzipSync(compressed));
  } else {
    throw createRouteError('Unsupported archive format', 400, 'UNSUPPORTED_FORMAT');
  }

  return { success: true, extractedTo: destCtx.relativePath };
}

export async function createArchive({ rootId = 'workspace', paths = [], destination }) {
  const { default: JSZip } = await import('jszip');
  if (!destination) throw createRouteError('destination is required', 400, 'MISSING_DESTINATION');
  const zip = new JSZip();
  for (const relPath of paths) {
    const ctx = resolveExplorerPath(rootId, relPath);
    if (!fs.existsSync(ctx.absolutePath)) continue;
    const entryName = path.basename(ctx.absolutePath);
    if (fs.statSync(ctx.absolutePath).isDirectory()) {
      addDirToZip(zip.folder(entryName), ctx.absolutePath);
    } else {
      zip.file(entryName, fs.readFileSync(ctx.absolutePath));
    }
  }
  const destCtx = resolveExplorerPath(rootId, destination);
  fs.mkdirSync(path.dirname(destCtx.absolutePath), { recursive: true });
  fs.writeFileSync(destCtx.absolutePath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  return { success: true, archivePath: destCtx.relativePath };
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
