// den/src/storage/filesRoutes.js
// /api/storage: the Files page. Places and their sizes, items by place,
// an item's content and download, Show in folder, Open in another app,
// removing (to the Trash through the desktop app, or for good), the bulk
// clean-ups, and the database's tables for developers. Every action names an
// item by the id a listing gave it; den finds it again and checks it
// (places.js, safeFs.js), so a request never names a path.

import express from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db/client.js';
import { runtimeDataRoot, runtimeDbPath } from '../config/runtimeConfig.js';
import { isHostConnected, requestFromHost } from '../lib/hostBridge.js';
import { diskSpace, fileBytes } from './diskUsage.js';
import { filesError, OPENABLE_EXT } from './safeFs.js';
import { extOf, MEDIA_TYPES, publicItem, TEXT_EXT } from './fileItems.js';
import {
  CLEAN_ACTIONS, cleanUp, listItems, PLACES, placeSizes, removeResolved, resolveItem,
} from './places.js';

const router = express.Router();

// Text is sent up to this much; the viewer says when there is more.
export const TEXT_LIMIT = 2 * 1024 * 1024;
const MAX_TAIL_LINES = 1000;

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Files error:', err);
  res.status(status).json({ success: false, code: err.code || 'FAILED', error: err.message, ...(err.detail ? { detail: err.detail } : {}) });
}

const desktop = () => isHostConnected('files');

async function found(req) {
  const handle = await resolveItem(req.user.id, req.params.id);
  if (!handle) throw filesError(404, 'NOT_FOUND', 'That file was not found.');
  return handle;
}

// A regular file to read: never a link, a folder or something gone.
function readableFile(handle) {
  if (!handle.target || handle.link) throw filesError(404, 'NOT_FOUND', 'That file was not found.');
  let stat;
  try {
    stat = fs.lstatSync(handle.target);
  } catch {
    throw filesError(404, 'NOT_FOUND', 'That file was not found.');
  }
  if (stat.isSymbolicLink()) throw filesError(404, 'NOT_FOUND', 'That file was not found.');
  if (!stat.isFile()) throw filesError(415, 'NOT_PREVIEWABLE', "That can't be shown here.");
  return stat;
}

function readRange(file, start, length) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const bytes = fs.readSync(fd, buffer, 0, length, start);
    return buffer.subarray(0, bytes);
  } finally {
    fs.closeSync(fd);
  }
}

// The last `lines` lines, from at most the last TEXT_LIMIT bytes.
function tailOf(file, size, lines) {
  const start = Math.max(0, size - TEXT_LIMIT);
  const text = readRange(file, start, size - start).toString('utf8');
  const all = text.split('\n');
  if (start > 0) all.shift(); // a cut line
  const end = all.length && all[all.length - 1] === '' ? all.length - 1 : all.length;
  return { text: all.slice(Math.max(0, end - lines), end).join('\n'), cut: start > 0 || end > lines };
}

function attachmentName(name) {
  const plain = String(name || 'file').replace(/["\\\r\n]/g, '').replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(String(name || 'file'))}`;
}

// ?wait=1 counts everything afresh before answering.
router.get('/places', async (req, res) => {
  try {
    const userId = req.user.id;
    const [sizes, counts] = await Promise.all([
      placeSizes(userId, { wait: req.query.wait === '1' }),
      Promise.all(PLACES.map((place) => Promise.resolve(place.list(userId, { sizes: false })).then((items) => items.length, () => null))),
    ]);
    res.json({
      success: true,
      desktop: desktop(),
      disk: diskSpace(runtimeDataRoot()),
      appBytes: sizes.appBytes,
      scanning: sizes.scanning,
      places: PLACES.map((place, index) => ({
        id: place.id,
        label: place.label,
        hint: place.hint,
        bytes: sizes.places[index].bytes,
        partial: sizes.places[index].partial,
        count: counts[index],
      })),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ?place=&kind=&where=&q=&sort=newest|oldest|largest|name&offset=0&limit=100
router.get('/items', async (req, res) => {
  try {
    const { place, kind, where, q, sort, offset, limit } = req.query;
    const page = await listItems(req.user.id, {
      place: String(place || ''), kind: String(kind || ''), where: String(where || ''), q: String(q || ''), sort: String(sort || 'newest'), offset, limit,
    });
    res.json({ success: true, desktop: desktop(), ...page });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/items/:id', async (req, res) => {
  try {
    res.json({ success: true, desktop: desktop(), item: publicItem((await found(req)).item) });
  } catch (err) {
    sendError(res, err);
  }
});

// Text goes out as text/plain in a sandbox (pages and drawings never run on
// this address), at most TEXT_LIMIT of it (X-Truncated says when there is
// more); ?tail=1000 sends a log's last lines. Pictures, sound and video go
// out with their own types; anything else is 415.
router.get('/items/:id/content', async (req, res) => {
  try {
    const handle = await found(req);
    const stat = readableFile(handle);
    if (!handle.item.can.preview) throw filesError(415, 'NOT_PREVIEWABLE', "That can't be shown here.");
    const ext = extOf(handle.target);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
    if (TEXT_EXT.has(ext)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-cache');
      if (req.query.tail && handle.item.tail) {
        const lines = Math.min(MAX_TAIL_LINES, Math.max(1, parseInt(req.query.tail, 10) || MAX_TAIL_LINES));
        const tail = tailOf(handle.target, stat.size, lines);
        if (tail.cut) res.setHeader('X-Truncated', '1');
        return res.send(tail.text);
      }
      if (stat.size > TEXT_LIMIT) res.setHeader('X-Truncated', '1');
      return res.send(readRange(handle.target, 0, Math.min(stat.size, TEXT_LIMIT)));
    }
    if (!Object.hasOwn(MEDIA_TYPES, ext)) throw filesError(415, 'NOT_PREVIEWABLE', "That can't be shown here.");
    res.setHeader('Content-Type', MEDIA_TYPES[ext]);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.sendFile(handle.target, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) sendError(res, filesError(404, 'NOT_FOUND', 'That file was not found.'));
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Always plain bytes to save, whatever the file is.
router.get('/items/:id/download', async (req, res) => {
  try {
    const handle = await found(req);
    readableFile(handle);
    if (!handle.item.can.download) throw filesError(415, 'NOT_DOWNLOADABLE', "That can't be downloaded.");
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', attachmentName(handle.item.name || path.basename(handle.target)));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
    res.sendFile(handle.target, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) sendError(res, filesError(404, 'NOT_FOUND', 'That file was not found.'));
    });
  } catch (err) {
    sendError(res, err);
  }
});

// What the desktop app does for Files: den checks the item, then asks it.
async function askDesktop(type, file) {
  if (!desktop()) throw filesError(409, 'NO_DESKTOP', 'That needs the Asyncat desktop app.');
  try {
    return await requestFromHost(type, { path: file }, { capability: 'files', timeoutMs: 60_000 });
  } catch (err) {
    // The desktop app's own reason ("That can't be opened in another app.") is what the person sees.
    throw filesError(502, 'DESKTOP_FAILED', String(err?.message || '').trim() || "The desktop app couldn't do that.");
  }
}

router.post('/items/:id/reveal', async (req, res) => {
  try {
    const handle = await found(req);
    if (!handle.item.can.reveal || !handle.target) throw filesError(409, 'NOT_REVEALABLE', "That can't be shown in a folder.");
    await askDesktop('files.reveal', handle.target);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Only a folder, or a file whose type is on OPENABLE_EXT: never a page, a
// drawing or anything that could run.
router.post('/items/:id/open', async (req, res) => {
  try {
    const handle = await found(req);
    let stat = null;
    try { stat = handle.target && !handle.link ? fs.lstatSync(handle.target) : null; } catch { /* gone */ }
    const openable = stat && (stat.isDirectory() || (stat.isFile() && OPENABLE_EXT.has(extOf(handle.target))));
    if (!handle.item.can.open || !openable) throw filesError(415, 'NOT_OPENABLE', "That can't be opened in another app.");
    await askDesktop('files.open', handle.target);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Removes an item: { freedBytes, mode: 'trash' | 'delete' }. An item whose
// deleteVerb is 'trash' goes to the Trash through the desktop app (409
// NO_DESKTOP without it, 409 TRASH_FAILED when that fails); ?permanent=1
// deletes it for good, as the app asks for when it says "Delete". 409
// IN_USE for something loaded, running or still used; 403 PROTECTED for
// what is never removed here.
router.delete('/items/:id', async (req, res) => {
  try {
    const handle = await found(req);
    const { item } = handle;
    if (!item.can.delete) {
      if (item._lock === 'IN_USE') throw filesError(409, 'IN_USE', item.lockedReason);
      throw filesError(403, 'PROTECTED', item.lockedReason || "Asyncat doesn't remove that.");
    }
    const permanent = ['1', 'true'].includes(String(req.query.permanent || ''));
    let trash = null;
    if (item.deleteVerb === 'trash' && !permanent) {
      if (!desktop()) throw filesError(409, 'NO_DESKTOP', 'Moving to the Trash needs the Asyncat desktop app.');
      trash = async (file) => {
        try {
          await requestFromHost('files.trash', { path: file }, { capability: 'files', timeoutMs: 60_000 });
        } catch (err) {
          throw Object.assign(filesError(409, 'TRASH_FAILED', "Couldn't move it to the Trash."), { detail: err.message });
        }
      };
    }
    const freedBytes = await removeResolved(handle, { trash });
    res.json({ success: true, freedBytes, mode: trash ? 'trash' : 'delete' });
  } catch (err) {
    sendError(res, err);
  }
});

// { action: 'old-logs' | 'unfinished-downloads' | 'unused-attachments' | 'caches' }
router.post('/clean', async (req, res) => {
  try {
    const action = String(req.body?.action || '');
    if (!CLEAN_ACTIONS.includes(action)) throw filesError(400, 'BAD_ACTION', 'There is no such clean-up.');
    res.json({ success: true, ...(await cleanUp(req.user.id, action)) });
  } catch (err) {
    sendError(res, err);
  }
});

// The database's files and how many rows each table has, for developers.
router.get('/database', (_req, res) => {
  try {
    const file = runtimeDbPath();
    const files = [['main', ''], ['wal', '-wal'], ['shm', '-shm']].map(([id, end]) => ({ id, path: `${file}${end}`, bytes: fileBytes(`${file}${end}`) }));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map(({ name }) => {
        try {
          return { name, rows: db.prepare(`SELECT COUNT(*) AS count FROM "${String(name).replace(/"/g, '""')}"`).get().count };
        } catch {
          return { name, rows: null };
        }
      });
    res.json({ success: true, path: file, files, totalBytes: files.reduce((sum, entry) => sum + entry.bytes, 0), tables });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
