/**
 * Knowledge files for projects and agents: storing them, listing them, and
 * finding the parts that matter for a question.
 *
 * Each file's text is extracted once (extractText.js), split into chunks of
 * roughly 600 tokens, and indexed with SQLite FTS5 so search ranks chunks by
 * relevance (BM25). Files live under data/knowledge/<owner>/.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db from '../db/client.js';
import { runtimeDataPath } from '../config/runtimeConfig.js';
import { extractKnowledgeText } from './extractText.js';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_OWNER = 200;
// What one image costs a vision model, roughly (it varies by provider).
export const IMAGE_TOKEN_ESTIMATE = 1000;
const CHUNK_CHARS = 2400;
const CHUNK_OVERLAP = 240;
const OWNER_TYPES = new Set(['project', 'agent']);
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/** A conservative token estimate: code and data tokenize denser than prose. */
export function estimateTokens(text = '') {
  if (!text) return 0;
  const symbols = (text.match(/[{}()[\];=<>/\\|`$#*_-]/g) || []).length;
  const dense = symbols / text.length > 0.05;
  return Math.ceil(text.length / (dense ? 3.2 : 4));
}

export function ownerKey(ownerType, ownerId) {
  return `${ownerType}:${ownerId}`;
}

function assertOwner(ownerType, ownerId) {
  if (!OWNER_TYPES.has(ownerType) || !ownerId) {
    const error = new Error('Knowledge belongs to a project or an agent.');
    error.status = 400;
    throw error;
  }
}

function safeFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[^\w.\- ()]+/g, '_').trim();
  return (base || 'file').slice(0, 120);
}

/** Split text into overlapping chunks on paragraph boundaries where possible. */
export function chunkText(text, size = CHUNK_CHARS, overlap = CHUNK_OVERLAP) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const breakAt = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('. '));
      if (breakAt > size * 0.5) end = start + breakAt + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

function presentFile(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    token_estimate: row.token_estimate,
    created_at: row.created_at,
  };
}

export function listKnowledgeFiles(ownerType, ownerId) {
  assertOwner(ownerType, ownerId);
  return db.prepare(`
    SELECT id, name, kind, mime_type, size_bytes, token_estimate, created_at
    FROM knowledge_files WHERE owner_type = ? AND owner_id = ?
    ORDER BY created_at ASC
  `).all(ownerType, ownerId).map(presentFile);
}

/** Store an uploaded file as knowledge. Throws a plain-language error on bad input. */
export async function addKnowledgeFile({ ownerType, ownerId, userId, fileName, mimeType = '', buffer }) {
  assertOwner(ownerType, ownerId);
  if (!buffer?.length) {
    const error = new Error('The file is empty.');
    error.status = 400;
    throw error;
  }
  if (buffer.length > MAX_FILE_BYTES) {
    const error = new Error(`Files can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
    error.status = 413;
    throw error;
  }
  const count = db.prepare('SELECT COUNT(*) AS n FROM knowledge_files WHERE owner_type = ? AND owner_id = ?').get(ownerType, ownerId).n;
  if (count >= MAX_FILES_PER_OWNER) {
    const error = new Error(`A ${ownerType} can hold up to ${MAX_FILES_PER_OWNER} files.`);
    error.status = 400;
    throw error;
  }

  const name = safeFileName(fileName);
  let extracted;
  try {
    extracted = await extractKnowledgeText({ buffer, fileName: name, mimeType });
  } catch (err) {
    err.status = err.status || 422;
    throw err;
  }

  const id = crypto.randomUUID();
  const relative = path.join(ownerType, ownerId, `${id}-${name}`);
  const absolute = runtimeDataPath('knowledge', relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, buffer);

  const tokens = extracted.kind === 'image' ? IMAGE_TOKEN_ESTIMATE : estimateTokens(extracted.text);
  const key = ownerKey(ownerType, ownerId);
  const insertFile = db.prepare(`
    INSERT INTO knowledge_files (id, owner_type, owner_id, user_id, name, mime_type, kind, size_bytes, storage_path, text_content, token_estimate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertChunk = db.prepare('INSERT INTO knowledge_chunks (id, file_id, owner_key, position, content, token_estimate) VALUES (?, ?, ?, ?, ?, ?)');
  const insertFts = db.prepare('INSERT INTO knowledge_chunks_fts (chunk_id, owner_key, file_name, content) VALUES (?, ?, ?, ?)');

  try {
    db.transaction(() => {
      insertFile.run(id, ownerType, ownerId, userId, name, mimeType || null, extracted.kind, buffer.length, relative, extracted.text, tokens);
      chunkText(extracted.text).forEach((content, position) => {
        const chunkId = crypto.randomUUID();
        insertChunk.run(chunkId, id, key, position, content, estimateTokens(content));
        insertFts.run(chunkId, key, name, content);
      });
    })();
  } catch (err) {
    fs.rmSync(absolute, { force: true });
    throw err;
  }
  return presentFile({ id, name, kind: extracted.kind, mime_type: mimeType || null, size_bytes: buffer.length, token_estimate: tokens, created_at: new Date().toISOString() });
}

export function deleteKnowledgeFile(ownerType, ownerId, fileId) {
  assertOwner(ownerType, ownerId);
  const row = db.prepare('SELECT id, storage_path FROM knowledge_files WHERE id = ? AND owner_type = ? AND owner_id = ?').get(fileId, ownerType, ownerId);
  if (!row) return false;
  db.transaction(() => {
    db.prepare('DELETE FROM knowledge_chunks WHERE file_id = ?').run(row.id);
    db.prepare('DELETE FROM knowledge_files WHERE id = ?').run(row.id);
  })();
  fs.rmSync(runtimeDataPath('knowledge', row.storage_path), { force: true });
  return true;
}

/** Remove everything an owner had, e.g. when a project is deleted. */
export function deleteOwnerKnowledge(ownerType, ownerId) {
  for (const file of listKnowledgeFiles(ownerType, ownerId)) deleteKnowledgeFile(ownerType, ownerId, file.id);
  fs.rmSync(runtimeDataPath('knowledge', ownerType, ownerId), { recursive: true, force: true });
}

/** Totals for the context meter. */
export function knowledgeStats(ownerType, ownerId) {
  const rows = db.prepare(`
    SELECT kind, COUNT(*) AS files, COALESCE(SUM(token_estimate), 0) AS tokens
    FROM knowledge_files WHERE owner_type = ? AND owner_id = ? GROUP BY kind
  `).all(ownerType, ownerId);
  const stats = { fileCount: 0, textFiles: 0, textTokens: 0, imageCount: 0, imageTokens: 0 };
  for (const row of rows) {
    stats.fileCount += row.files;
    if (row.kind === 'image') {
      stats.imageCount += row.files;
      stats.imageTokens += row.tokens;
    } else {
      stats.textFiles += row.files;
      stats.textTokens += row.tokens;
    }
  }
  return stats;
}

/** Every text file in full, oldest first. */
export function knowledgeTexts(ownerType, ownerId) {
  return db.prepare(`
    SELECT name, kind, text_content AS text, token_estimate AS tokens
    FROM knowledge_files WHERE owner_type = ? AND owner_id = ? AND kind != 'image'
    ORDER BY created_at ASC
  `).all(ownerType, ownerId);
}

/** Images as data URLs, for models that can see them. */
export function knowledgeImages(ownerType, ownerId, { limit = 4 } = {}) {
  return db.prepare(`
    SELECT name, storage_path FROM knowledge_files
    WHERE owner_type = ? AND owner_id = ? AND kind = 'image'
    ORDER BY created_at ASC LIMIT ?
  `).all(ownerType, ownerId, limit).map((row) => {
    try {
      const ext = path.extname(row.name).slice(1).toLowerCase();
      const data = fs.readFileSync(runtimeDataPath('knowledge', row.storage_path));
      return { name: row.name, dataUrl: `data:${IMAGE_MIME[ext] || 'image/png'};base64,${data.toString('base64')}` };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export function knowledgeImageNames(ownerType, ownerId) {
  return db.prepare("SELECT name FROM knowledge_files WHERE owner_type = ? AND owner_id = ? AND kind = 'image' ORDER BY created_at ASC")
    .all(ownerType, ownerId).map((row) => row.name);
}

const STOP_WORDS = new Set(('a an and are as at be but by can could do does for from had has have how i if in into is it its '
  + 'me my of on or our please should so than that the their them then there these they this to us was we were what '
  + 'when where which who why will with would you your about tell show give find make need want').split(' '));

/** An FTS5 query from free text: significant words, OR-ed, each quoted. */
export function ftsQuery(text) {
  const words = String(text || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  const unique = [...new Set(words.filter((w) => !STOP_WORDS.has(w)))].slice(0, 24);
  return unique.map((w) => `"${w.replace(/"/g, '')}"`).join(' OR ');
}

/**
 * The most relevant chunks for a question across one or more owners, up to a
 * token budget. Each result: { fileName, content, tokens }.
 */
export function searchKnowledge(owners, query, { maxTokens = 4000, maxChunks = 20 } = {}) {
  const keys = owners.filter((o) => o?.type && o?.id).map((o) => ownerKey(o.type, o.id));
  const match = ftsQuery(query);
  if (!keys.length || !match) return [];
  const placeholders = keys.map(() => '?').join(', ');
  let rows;
  try {
    rows = db.prepare(`
      SELECT c.id, f.name AS file_name, c.content, c.token_estimate AS tokens, bm25(knowledge_chunks_fts) AS score
      FROM knowledge_chunks_fts
      JOIN knowledge_chunks c ON c.id = knowledge_chunks_fts.chunk_id
      JOIN knowledge_files f ON f.id = c.file_id
      WHERE knowledge_chunks_fts MATCH ? AND knowledge_chunks_fts.owner_key IN (${placeholders})
      ORDER BY score ASC
      LIMIT ?
    `).all(match, ...keys, maxChunks);
  } catch {
    return [];
  }
  const picked = [];
  let used = 0;
  for (const row of rows) {
    if (used + row.tokens > maxTokens && picked.length) break;
    picked.push({ fileName: row.file_name, content: row.content, tokens: row.tokens });
    used += row.tokens;
  }
  return picked;
}
