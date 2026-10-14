// den/src/storage/fileItems.js
// What Files says about one thing it lists (an Item), built the same way in
// every place: its kind, where it is, size and date, badges, and what can be
// done with it (can.*). The app draws what it is told. Fields starting with
// "_" stay on the server (lazy details, search text, why it is locked).

import fs from 'fs';
import path from 'path';
import { isPlainName, OPENABLE_EXT, plainFileIn } from './safeFs.js';

// Sent as text/plain in a sandbox: pages and drawings may carry scripts.
export const TEXT_EXT = new Set([
  '.html', '.htm', '.svg', '.md', '.markdown', '.txt', '.csv', '.tsv', '.json', '.jsonl', '.mmd', '.mermaid',
  '.js', '.mjs', '.ts', '.py', '.css', '.jsx', '.tsx', '.sh', '.log', '.yaml', '.yml', '.xml', '.toml', '.ini', '.rst',
]);

// Sent with their own types.
export const MEDIA_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

const PICTURE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export function extOf(name) {
  return path.extname(String(name || '')).toLowerCase();
}

export function isPreviewable(name) {
  const ext = extOf(name);
  return TEXT_EXT.has(ext) || Object.hasOwn(MEDIA_TYPES, ext);
}

/** Badge tones: neutral, success (loaded), info (running), warning (unfinished). */
export function badge(tone, label) {
  return { tone, label };
}

/** The address an item's content is read from (pictures use it as their thumbnail). */
export function contentUrl(id) {
  return `/api/storage/items/${encodeURIComponent(id)}/content`;
}

/** A file's name without the stamp den put in front of it ("1697…_photo.png", "1697…-a1b2c3-plan.md"). */
export function displayName(name) {
  const value = String(name || '');
  const shown = value
    .replace(/^banner_\d{10,}_/, '')
    .replace(/^\d{10,}-[0-9a-f]{6}-/, '')
    .replace(/^\d{10,}_/, '');
  return shown || value;
}

/** `dir/name` as Files lists it: `{ name, file, stat, link }` for a regular file, or (with `links`) a link; else null. */
export function fileIn(dir, name, { links = false } = {}) {
  const found = plainFileIn(dir, name);
  if (found) return { name, ...found, link: false };
  if (!links || !isPlainName(name)) return null;
  const file = path.join(dir, name);
  try {
    const stat = fs.lstatSync(file);
    return stat.isSymbolicLink() ? { name, file, stat, link: true } : null;
  } catch {
    return null;
  }
}

/** The files in a folder, as fileIn sees them. Names starting with "." are left out. */
export function filesIn(dir, { links = false, match = null } = {}) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => !name.startsWith('.') && (!match || match.test(name)))
    .map((name) => fileIn(dir, name, { links }))
    .filter(Boolean);
}

/** A folder below `dir` by plain name, not a link: its path, or null. */
export function folderIn(dir, name) {
  if (!isPlainName(name)) return null;
  const folder = path.join(dir, name);
  try {
    return fs.lstatSync(folder).isDirectory() ? folder : null;
  } catch {
    return null;
  }
}

const CAN = { preview: false, open: false, reveal: false, download: false, delete: false, chat: false, manage: false };

/**
 * An Item. `lock` ({ code: 'IN_USE' | 'READ_ONLY', reason }) turns delete off
 * and says why; a delete that is simply not offered has no lock.
 */
export function makeItem({
  id, place, kind, kindLabel = null, title, name = null, where = '', whereId = null, bytes = null, modifiedAt = null,
  path: shownPath = null, badges = [], can = {}, deleteVerb = 'delete', lock = null, manageRoute = null, ...extra
}) {
  const item = {
    id,
    place,
    kind,
    kindLabel,
    title,
    name,
    where,
    whereId: whereId ?? where,
    bytes,
    modifiedAt,
    path: shownPath,
    ...extra,
    badges,
    can: { ...CAN, ...can, manage: Boolean(can.manage || manageRoute) },
    deleteVerb,
  };
  if (manageRoute) item.manageRoute = manageRoute;
  if (lock) {
    item.can.delete = false;
    item.lockedReason = lock.reason;
    item._lock = lock.code;
  }
  return item;
}

/**
 * An Item for a file found by fileIn. A link can only be removed (the link
 * itself): it is never shown, opened or downloaded, wherever it points.
 */
export function fileItem({ entry, deleteVerb = 'delete', badges = [], can = {}, ...fields }) {
  const { name, file, stat, link } = entry;
  const ext = extOf(name);
  return makeItem({
    title: displayName(name),
    name,
    bytes: link ? null : stat.size,
    modifiedAt: stat.mtime.toISOString(),
    path: file,
    ...(!link && PICTURE_EXT.has(ext) ? { thumbUrl: contentUrl(fields.id) } : {}),
    ...fields,
    badges: link ? [...badges, badge('neutral', 'Link')] : badges,
    can: link
      ? { reveal: true, delete: true, ...can, preview: false, open: false, download: false }
      : { preview: isPreviewable(name), open: OPENABLE_EXT.has(ext), reveal: true, download: true, delete: true, ...can },
    deleteVerb: link ? 'delete' : deleteVerb,
  });
}

/** An Item as sent: lazy details filled in, server-only fields dropped. */
export function publicItem(entry) {
  const item = entry._finish ? entry._finish() : entry;
  return Object.fromEntries(Object.entries(item).filter(([key]) => !key.startsWith('_')));
}
