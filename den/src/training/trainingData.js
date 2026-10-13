// den/src/training/trainingData.js
// Guided training, step 1: build a training file from what you choose:
// chat answers you rated well (with the conversation that led to them),
// notes, and text files in your projects' folders.
//
// Chats become {"messages": [...]} rows, which train_lora.py renders in the
// model's own chat format; notes and files become {"text": ...} rows. The
// file is kept in the data folder (training/datasets), so "Delete
// everything" removes it.

import fs from 'fs';
import path from 'path';
import db from '../db/client.js';
import { runtimeDataPath } from '../config/runtimeConfig.js';

const CONTEXT_MESSAGES = 6; // turns kept before a rated answer
const MAX_MESSAGE_CHARS = 8000;
const CHUNK_CHARS = 4000;
const MIN_TEXT_CHARS = 40;
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.rst', '.org', '.adoc', '.tex']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'venv', '.venv', '__pycache__', 'dist', 'build', '.next', 'target', '.cache', '.asyncat']);
const FILE_LIMITS = { files: 300, fileBytes: 2_000_000, totalBytes: 8_000_000, entries: 20_000 };

export function datasetsDir() {
  return runtimeDataPath('training', 'datasets');
}

/** Roughly how many tokens a text is (about 3.6 characters each). */
export function approxTokens(text) {
  return Math.ceil(String(text || '').length / 3.6);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** A note's HTML as plain text, keeping line breaks and list items. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|ul|ol|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, code) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Pieces of at most `size` characters, split between paragraphs when possible. */
export function chunkText(text, size = CHUNK_CHARS) {
  const chunks = [];
  let current = '';
  for (const paragraph of String(text || '').split(/\n{2,}/)) {
    const piece = paragraph.trim();
    if (!piece) continue;
    if (current && current.length + piece.length + 2 > size) {
      chunks.push(current);
      current = '';
    }
    if (piece.length > size) {
      for (let i = 0; i < piece.length; i += size) chunks.push(piece.slice(i, i + size));
      continue;
    }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}

function parseJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

/** The text of a stored message ({user|cat: text, variants, …}). */
function messageText(message, variantIndex = null) {
  if (Number.isInteger(variantIndex) && Array.isArray(message.variants) && message.variants[variantIndex] !== undefined) {
    const variant = message.variants[variantIndex];
    const text = typeof variant === 'string' ? variant : variant?.content;
    if (typeof text === 'string') return text;
  }
  const text = 'user' in message ? message.user : message.cat;
  return typeof text === 'string' ? text : '';
}

/** Chat answers rated 👍, each with the turns before it, as chat messages. */
export function ratedChatExamples(userId) {
  const rows = db.prepare(`
    SELECT id, messages FROM conversations
    WHERE user_id = ? AND deleted_at IS NULL AND messages LIKE '%"rating":1%'
  `).all(userId);
  const examples = [];
  for (const row of rows) {
    const messages = parseJson(row.messages, []);
    if (!Array.isArray(messages)) continue;
    messages.forEach((message, index) => {
      if (!message || 'user' in message || message.rating !== 1) return;
      const answer = messageText(message, message.ratedVariant).trim();
      if (!answer) return;
      const turns = [];
      for (const earlier of messages.slice(Math.max(0, index - CONTEXT_MESSAGES), index)) {
        const text = messageText(earlier).trim();
        if (text) turns.push({ role: 'user' in earlier ? 'user' : 'assistant', content: text.slice(0, MAX_MESSAGE_CHARS) });
      }
      while (turns.length && turns[0].role !== 'user') turns.shift();
      if (!turns.length || turns[turns.length - 1].role !== 'user') return;
      examples.push({ conversationId: row.id, messages: [...turns, { role: 'assistant', content: answer.slice(0, MAX_MESSAGE_CHARS) }] });
    });
  }
  return examples;
}

/** Notes (not archived) as plain-text pieces, each starting with the title. */
export function noteExamples(userId) {
  const notes = db.prepare('SELECT id, title, content FROM notes WHERE createdby = ? AND isarchived = 0 ORDER BY updatedat DESC').all(userId);
  const examples = [];
  for (const note of notes) {
    const text = htmlToText(note.content);
    if (text.length < MIN_TEXT_CHARS) continue;
    for (const piece of chunkText(text)) examples.push({ noteId: note.id, text: `# ${note.title || 'Note'}\n\n${piece}` });
  }
  return examples;
}

/** Text and Markdown files in a folder, within the limits. */
export function textFilesIn(root, limits = FILE_LIMITS) {
  const files = [];
  let total = 0;
  let entries = 0;
  const stack = [root];
  while (stack.length && files.length < limits.files) {
    const dir = stack.pop();
    let list = [];
    try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of list) {
      entries += 1;
      if (entries > limits.entries || files.length >= limits.files) break;
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        let size = 0;
        try { size = fs.statSync(full).size; } catch { continue; }
        if (size > limits.fileBytes || total + size > limits.totalBytes) continue;
        total += size;
        files.push({ path: full, relative: path.relative(root, full), size });
      }
    }
  }
  return { files, bytes: total };
}

function projectFolders(userId, projectIds = null) {
  const rows = db.prepare(`
    SELECT p.id AS projectId, p.name AS projectName, f.path FROM projects p
    JOIN project_folders f ON f.project_id = p.id
    WHERE (p.owner_id = ? OR p.created_by = ?) AND p.is_archived = 0
    ORDER BY p.name, f.position
  `).all(userId, userId);
  return projectIds ? rows.filter((row) => projectIds.includes(row.projectId)) : rows;
}

export function fileExamples(userId, projectIds) {
  const examples = [];
  for (const folder of projectFolders(userId, projectIds)) {
    for (const file of textFilesIn(folder.path).files) {
      let text = '';
      try { text = fs.readFileSync(file.path, 'utf8'); } catch { continue; }
      if (text.includes('\u0000') || text.trim().length < MIN_TEXT_CHARS) continue;
      for (const piece of chunkText(text)) examples.push({ projectId: folder.projectId, text: `# ${file.relative}\n\n${piece}` });
    }
  }
  return examples;
}

/** What there is to train on, for the first step. */
export function trainingSources(userId) {
  const rated = ratedChatExamples(userId);
  const notes = new Set(noteExamples(userId).map((example) => example.noteId)).size;
  const projects = new Map();
  for (const folder of projectFolders(userId)) {
    const found = textFilesIn(folder.path);
    const item = projects.get(folder.projectId) || { id: folder.projectId, name: folder.projectName, files: 0, bytes: 0 };
    item.files += found.files.length;
    item.bytes += found.bytes;
    projects.set(folder.projectId, item);
  }
  return {
    ratedAnswers: rated.length,
    ratedChats: new Set(rated.map((example) => example.conversationId)).size,
    notes,
    projects: [...projects.values()],
  };
}

function slug(text) {
  return String(text || 'dataset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'dataset';
}

function clip(text, size = 280) {
  const value = String(text || '');
  return value.length > size ? `${value.slice(0, size)}…` : value;
}

/**
 * Write the training file. `choice` is { ratedChats, notes, projectIds, name }.
 * Returns { path, examples, tokens, bySource, preview }.
 */
export function buildDataset(userId, choice = {}, now = new Date()) {
  const chats = choice.ratedChats ? ratedChatExamples(userId) : [];
  const notes = choice.notes ? noteExamples(userId) : [];
  const files = Array.isArray(choice.projectIds) && choice.projectIds.length ? fileExamples(userId, choice.projectIds) : [];
  const rows = [
    ...chats.map((example) => ({ messages: example.messages })),
    ...notes.map((example) => ({ text: example.text })),
    ...files.map((example) => ({ text: example.text })),
  ];
  if (!rows.length) {
    throw Object.assign(new Error('Nothing to train on yet. Rate some answers 👍, or pick notes or project files.'), { status: 400 });
  }
  const tokens = rows.reduce((sum, row) => sum + (row.messages ? row.messages.reduce((n, m) => n + approxTokens(m.content), 0) : approxTokens(row.text)), 0);
  fs.mkdirSync(datasetsDir(), { recursive: true });
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const file = path.join(datasetsDir(), `${slug(choice.name)}-${stamp}.jsonl`);
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, { mode: 0o600 });
  const preview = [
    ...chats.slice(0, 2).map((example) => ({ kind: 'chat', question: clip(example.messages[example.messages.length - 2]?.content, 160), answer: clip(example.messages[example.messages.length - 1].content) })),
    ...notes.slice(0, 1).map((example) => ({ kind: 'note', text: clip(example.text) })),
    ...files.slice(0, 1).map((example) => ({ kind: 'file', text: clip(example.text) })),
  ];
  return {
    path: file,
    examples: rows.length,
    tokens,
    bySource: { chats: chats.length, notes: notes.length, files: files.length },
    preview,
  };
}
