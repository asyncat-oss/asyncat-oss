// den/src/storage/places/uploads.js
// Uploads: files added to notes (uploads/notes/note-<id>, and the older
// uploads/notes/project-<id>/note-<id>), to project chats
// (<folder>/.asyncat/attachments) and as knowledge (data/knowledge).

import fs from 'fs';
import path from 'path';
import db from '../../db/client.js';
import { runtimeDataPath, runtimeUploadsPath } from '../../config/runtimeConfig.js';
import { kindOf, madeRoot, madeRoots, sqliteTime } from '../../made/madeIndex.js';
import { deleteKnowledgeFile, knowledgeFilePath } from '../../knowledge/knowledgeStore.js';
import { makeId } from '../itemIds.js';
import { isRealSubdir, removeInside } from '../safeFs.js';
import { badge, fileIn, filesIn, fileItem, folderIn, makeItem } from '../fileItems.js';

const NOTE_FOLDER = /^note-([\w-]{1,128})$/;
const PROJECT_FOLDER = /^project-[\w-]{1,128}$/;

export function notesUploadsDir() {
  return path.join(runtimeUploadsPath(), 'notes');
}

function knowledgeDir() {
  return runtimeDataPath('knowledge');
}

function chatAttachmentsDir(root) {
  const dir = path.join(root.dir, '.asyncat', 'attachments');
  return isRealSubdir(root.dir, dir) ? dir : null;
}

// Each note's attachment folder: [{ noteId, dir }], older project folders too.
function noteFolders() {
  const base = notesUploadsDir();
  const folders = [];
  let names = [];
  try { names = fs.readdirSync(base); } catch { return folders; }
  for (const name of names) {
    const dir = folderIn(base, name);
    if (!dir) continue;
    const note = name.match(NOTE_FOLDER);
    if (note) {
      folders.push({ noteId: note[1], dir });
    } else if (PROJECT_FOLDER.test(name)) {
      let inner = [];
      try { inner = fs.readdirSync(dir); } catch { continue; }
      for (const innerName of inner) {
        const match = innerName.match(NOTE_FOLDER);
        const innerDir = match && folderIn(dir, innerName);
        if (innerDir) folders.push({ noteId: match[1], dir: innerDir });
      }
    }
  }
  return folders;
}

function notesById(ids) {
  const found = new Map();
  const list = [...new Set(ids)];
  for (let start = 0; start < list.length; start += 500) {
    const chunk = list.slice(start, start + 500);
    const rows = db.prepare(`SELECT id, title FROM notes WHERE id IN (${chunk.map(() => '?').join(',')})`).all(...chunk);
    for (const row of rows) found.set(row.id, row);
  }
  return found;
}

// A note's attachment can go only once the note itself is gone ("Not used"):
// deleting one a note still shows would break the note.
function noteFileItem(noteId, note, entry) {
  return fileItem({
    id: makeId('note-file', noteId, entry.name),
    place: 'uploads',
    kind: 'note-file',
    kindLabel: 'Note attachment',
    fileKind: kindOf(entry.name),
    where: note ? note.title || 'Untitled note' : 'Deleted note',
    whereId: 'notes',
    entry,
    badges: note ? [] : [badge('neutral', 'Not used')],
    _flags: note ? [] : ['unused'],
    lock: note ? { code: 'IN_USE', reason: 'Its note still uses it.' } : null,
  });
}

function chatFileItem(root, entry) {
  return fileItem({
    id: makeId('chat-file', root.id, entry.name),
    place: 'uploads',
    kind: 'chat-file',
    kindLabel: 'Chat attachment',
    fileKind: kindOf(entry.name),
    where: root.label,
    whereId: root.whereId,
    entry,
    deleteVerb: 'trash',
  });
}

function ownerOf(row) {
  const table = row.owner_type === 'project' ? 'projects' : 'agent_profiles';
  let owner = null;
  try { owner = db.prepare(`SELECT id, name FROM ${table} WHERE id = ?`).get(row.owner_id); } catch { /* none */ }
  return {
    label: owner?.name || (row.owner_type === 'project' ? 'Deleted project' : 'Deleted agent'),
    whereId: `${row.owner_type}:${row.owner_id}`,
    manageRoute: row.owner_type === 'project' ? `/projects/${encodeURIComponent(row.owner_id)}` : '/agents',
  };
}

function knowledgeItem(row) {
  const owner = ownerOf(row);
  const file = knowledgeFilePath(row.storage_path);
  const fields = {
    id: makeId('knowledge', row.owner_type, row.owner_id, row.id),
    place: 'uploads',
    kind: 'knowledge',
    kindLabel: 'Knowledge',
    fileKind: kindOf(row.name),
    title: row.name,
    where: owner.label,
    whereId: owner.whereId,
    manageRoute: owner.manageRoute,
    deleteVerb: 'remove',
  };
  if (file) {
    return { ...fileItem({ ...fields, entry: { name: row.name, file, stat: fs.lstatSync(file), link: false } }), _file: file };
  }
  // Its file is missing: the row can still be removed.
  return {
    ...makeItem({ ...fields, name: row.name, bytes: row.size_bytes || 0, modifiedAt: sqliteTime(row.created_at), can: { delete: true } }),
    _file: null,
  };
}

const KNOWLEDGE_ROWS = `
  SELECT id, owner_type, owner_id, name, size_bytes, storage_path, created_at
  FROM knowledge_files WHERE user_id = ?`;

export const uploads = {
  id: 'uploads',
  label: 'Uploads',
  hint: 'Files you added to notes, chats, agents and projects.',
  whereLabels: { notes: 'Notes' },

  pieces(userId) {
    return [notesUploadsDir(), knowledgeDir(), ...madeRoots(userId).map(chatAttachmentsDir).filter(Boolean)];
  },

  list(userId) {
    const entries = [];
    const folders = noteFolders();
    const notes = notesById(folders.map((folder) => folder.noteId));
    for (const folder of folders) {
      for (const entry of filesIn(folder.dir, { links: true })) entries.push(noteFileItem(folder.noteId, notes.get(folder.noteId), entry));
    }
    for (const root of madeRoots(userId)) {
      const dir = chatAttachmentsDir(root);
      if (!dir) continue;
      for (const entry of filesIn(dir, { links: true })) entries.push(chatFileItem(root, entry));
    }
    let rows = [];
    try { rows = db.prepare(KNOWLEDGE_ROWS).all(userId); } catch { /* no knowledge yet */ }
    for (const row of rows) entries.push(knowledgeItem(row));
    return entries;
  },

  resolve: {
    'note-file'(_userId, [noteId, name]) {
      if (name.startsWith('.')) return null;
      for (const folder of noteFolders().filter((candidate) => candidate.noteId === noteId)) {
        const entry = fileIn(folder.dir, name, { links: true });
        if (!entry) continue;
        const note = notesById([noteId]).get(noteId);
        return { item: noteFileItem(noteId, note, entry), target: entry.file, root: notesUploadsDir(), link: entry.link };
      }
      return null;
    },

    'chat-file'(userId, [rootId, name]) {
      const root = madeRoot(userId, rootId);
      const dir = root && chatAttachmentsDir(root);
      const entry = dir && !name.startsWith('.') ? fileIn(dir, name, { links: true }) : null;
      return entry ? { item: chatFileItem(root, entry), target: entry.file, root: dir, link: entry.link } : null;
    },

    knowledge(userId, [ownerType, ownerId, fileId]) {
      const row = db.prepare(`${KNOWLEDGE_ROWS} AND owner_type = ? AND owner_id = ? AND id = ?`).get(userId, ownerType, ownerId, fileId);
      if (!row) return null;
      const item = knowledgeItem(row);
      return {
        item,
        target: item._file,
        // The file, then its rows and search index.
        remove: async () => {
          const freed = item._file ? await removeInside(knowledgeDir(), item._file) : 0;
          deleteKnowledgeFile(ownerType, ownerId, fileId);
          return freed;
        },
      };
    },
  },
};
