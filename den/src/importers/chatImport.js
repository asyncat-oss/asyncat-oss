// den/src/importers/chatImport.js
// Bring chats over from ChatGPT and Claude. Their data exports (the .zip,
// or the conversations.json inside it) become Asyncat chats that keep their
// titles and dates, so they sit in the past rather than at the top of
// Recents. A chat brought over once is skipped the next time. Memories come
// from a memories.json in the export when there is one, or from a pasted
// list (ChatGPT's Settings → Personalization → Memory).

import crypto from 'crypto';
import JSZip from 'jszip';
import db from '../db/client.js';
import { chatService } from '../ai/controllers/ai/chatService.js';
import { publishAppEvent } from '../lib/appEvents.js';
import { addMemory } from '../agent/memoryAdmin.js';

const MAX_MESSAGE_CHARS = 100_000;

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/** 'chatgpt' | 'claude' | null, from the first conversation's shape. */
export function detectFormat(conversations) {
  const first = Array.isArray(conversations) ? conversations.find((item) => item && typeof item === 'object') : null;
  if (!first) return null;
  if (first.mapping && typeof first.mapping === 'object') return 'chatgpt';
  if (Array.isArray(first.chat_messages)) return 'claude';
  return null;
}

function isoFromSeconds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

function isoFrom(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

/** Back-to-back turns from the same side become one message. */
function mergeSameRole(messages) {
  const out = [];
  for (const message of messages) {
    const last = out[out.length - 1];
    if (last && last.role === message.role) last.content = `${last.content}\n\n${message.content}`;
    else out.push({ ...message });
  }
  return out;
}

function chatgptText(content) {
  if (!content || typeof content !== 'object') return '';
  if (Array.isArray(content.parts)) return content.parts.filter((part) => typeof part === 'string').join('\n').trim();
  return typeof content.text === 'string' ? content.text.trim() : '';
}

/** A ChatGPT conversation: the branch that was showing (current_node back to the root). */
export function fromChatGPT(item) {
  const mapping = item.mapping || {};
  let nodeId = item.current_node && mapping[item.current_node]
    ? item.current_node
    : Object.keys(mapping).find((id) => !mapping[id]?.children?.length);
  const chain = [];
  const seen = new Set();
  while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
    seen.add(nodeId);
    chain.push(mapping[nodeId]);
    nodeId = mapping[nodeId].parent;
  }
  chain.reverse();
  const messages = [];
  for (const node of chain) {
    const message = node?.message;
    const role = message?.author?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    if (message.metadata?.is_visually_hidden_from_conversation) continue;
    if (message.recipient && message.recipient !== 'all') continue; // calls to tools
    const type = message.content?.content_type;
    if (type && type !== 'text' && type !== 'multimodal_text') continue;
    const text = chatgptText(message.content);
    if (text) messages.push({ role, content: text.slice(0, MAX_MESSAGE_CHARS), at: isoFromSeconds(message.create_time) });
  }
  return {
    sourceId: String(item.conversation_id || item.id || ''),
    title: String(item.title || 'ChatGPT chat'),
    createdAt: isoFromSeconds(item.create_time),
    updatedAt: isoFromSeconds(item.update_time),
    messages: mergeSameRole(messages),
  };
}

/** A Claude conversation. */
export function fromClaude(item) {
  const messages = [];
  for (const message of item.chat_messages || []) {
    const role = message?.sender === 'human' ? 'user' : message?.sender === 'assistant' ? 'assistant' : null;
    if (!role) continue;
    let text = typeof message.text === 'string' ? message.text : '';
    if (!text.trim() && Array.isArray(message.content)) {
      text = message.content.filter((part) => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n');
    }
    text = text.trim();
    if (text) messages.push({ role, content: text.slice(0, MAX_MESSAGE_CHARS), at: isoFrom(message.created_at) });
  }
  return {
    sourceId: String(item.uuid || ''),
    title: String(item.name || 'Claude chat'),
    createdAt: isoFrom(item.created_at),
    updatedAt: isoFrom(item.updated_at),
    messages: mergeSameRole(messages),
  };
}

/** Memories from a memories.json, or pasted text (one per line or bullet). */
export function parseMemories(input) {
  let list = input;
  if (typeof input === 'string') {
    const text = input.trim();
    try {
      list = JSON.parse(text);
    } catch {
      list = text.split(/\n+/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''));
    }
  }
  if (list && !Array.isArray(list) && typeof list === 'object') list = list.memories || list.items || Object.values(list);
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const text = typeof item === 'string' ? item : item?.content || item?.text || item?.memory || '';
    const clean = String(text).trim();
    if (clean.length >= 3 && !out.includes(clean)) out.push(clean.slice(0, 2000));
  }
  return out.slice(0, 1000);
}

function isZip(buffer) {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/** Read an export: { format, chats, memories }. */
export async function readExport(buffer) {
  let conversationsText = null;
  let memories = [];
  if (isZip(buffer)) {
    const zip = await JSZip.loadAsync(buffer);
    const files = Object.values(zip.files).filter((file) => !file.dir);
    const conversations = files.find((file) => /(^|\/)conversations\.json$/i.test(file.name));
    if (!conversations) throw fail("There's no conversations.json in this zip. Pick the data export from ChatGPT or Claude.");
    conversationsText = await conversations.async('string');
    const memoryFile = files.find((file) => /(^|\/)memor(y|ies)\.json$/i.test(file.name));
    if (memoryFile) memories = parseMemories(await memoryFile.async('string'));
  } else {
    conversationsText = buffer.toString('utf8');
  }
  let parsed;
  try {
    parsed = JSON.parse(conversationsText);
  } catch {
    throw fail("That file isn't JSON. Pick the export's .zip, or the conversations.json inside it.");
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.conversations;
  const format = detectFormat(list);
  if (!format) throw fail("This doesn't look like a ChatGPT or Claude export.");
  const read = format === 'chatgpt' ? fromChatGPT : fromClaude;
  const chats = list.filter((item) => item && typeof item === 'object').map(read).filter((chat) => chat.messages.length > 0);
  return { format, chats, memories };
}

function importedIds(userId, format) {
  return new Set(db.prepare(`
    SELECT json_extract(metadata, '$.importedFrom.id') AS id FROM conversations
    WHERE user_id = ? AND json_extract(metadata, '$.importedFrom.source') = ?
  `).all(userId, format).map((row) => row.id).filter(Boolean));
}

/** What an import would bring, for the preview. */
export function summarize(userId, { format, chats, memories }) {
  const existing = importedIds(userId, format);
  const fresh = chats.filter((chat) => !chat.sourceId || !existing.has(chat.sourceId));
  const dates = chats.map((chat) => chat.createdAt).filter(Boolean).sort();
  return {
    format,
    chats: chats.length,
    newChats: fresh.length,
    messages: fresh.reduce((sum, chat) => sum + chat.messages.length, 0),
    from: dates[0] || null,
    to: dates[dates.length - 1] || null,
    memories: memories.length,
    sample: fresh.slice(0, 5).map((chat) => chat.title),
  };
}

function workspaceFor(userId, workspaceId = null) {
  const id = workspaceId || db.prepare('SELECT id FROM workspaces WHERE owner_id = ? ORDER BY created_at LIMIT 1').get(userId)?.id;
  if (!id) throw fail('No workspace to import into.', 409);
  return id;
}

/** Save the chats (skipping ones brought over before). */
export function importChats(userId, { format, chats }, { workspaceId = null } = {}) {
  const wsId = workspaceFor(userId, workspaceId);
  const existing = importedIds(userId, format);
  const insert = db.prepare(`
    INSERT INTO conversations (id, user_id, workspace_id, title, mode, messages, metadata, message_count, last_message_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'chat', ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;
  let messageCount = 0;
  db.transaction(() => {
    for (const chat of chats) {
      if (chat.sourceId && existing.has(chat.sourceId)) {
        skipped += 1;
        continue;
      }
      const seed = crypto.createHash('sha1').update(`${format}:${chat.sourceId || chat.title}:${imported}`).digest('hex').slice(0, 10);
      const stored = chatService.convertToJsonbFormat(chat.messages.map((message, index) => ({
        id: `msg_imp_${seed}_${index}_${message.role}`,
        type: message.role === 'user' ? 'user' : 'assistant',
        content: message.content,
        timestamp: message.at || chat.createdAt || now,
      })));
      const created = chat.createdAt || now;
      const updated = chat.updatedAt || chat.messages[chat.messages.length - 1].at || created;
      insert.run(
        crypto.randomUUID(), userId, wsId, chat.title.slice(0, 200), JSON.stringify(stored),
        JSON.stringify({ importedFrom: { source: format, id: chat.sourceId || null, at: now } }),
        stored.length, updated, created, updated,
      );
      imported += 1;
      messageCount += stored.length;
    }
  })();
  chatService.clearUserWorkspaceCache(userId, wsId);
  if (imported) publishAppEvent('conversation.updated', { imported, isNew: true }, { userId });
  return { imported, skipped, messages: messageCount };
}

/** Save memories about you, skipping ones already there. */
export function importMemories(userId, memories, { workspaceId = null } = {}) {
  const wsId = workspaceFor(userId, workspaceId);
  const have = new Set(db.prepare('SELECT content FROM agent_memory WHERE user_id = ? AND workspace_id = ?').all(userId, wsId).map((row) => row.content.trim()));
  let added = 0;
  for (const text of memories) {
    if (have.has(text)) continue;
    addMemory({ userId, workspaceId: wsId, content: text, kind: 'user', scope: 'shared' });
    have.add(text);
    added += 1;
  }
  return { added, skipped: memories.length - added };
}
