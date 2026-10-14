// den/src/made/madeIndex.js
// "Made by agents": one list of what agents have made. Pictures from the
// gallery; documents, pages, data and diagrams they saved as artifacts in
// a project's folders, a Cat's folder, an agent's own folder or the folder
// chats without a project use; and notes they wrote.
//
// Folders are named by an id ("chats", "project:<folderId>", "cat:<catId>",
// "agent:<profileId>")
// and resolved here, so a request never names a path itself.

import fs from 'fs';
import path from 'path';
import db from '../db/client.js';
import { getArtifactsDir, getLegacyArtifactsDir } from '../agent/workspacePaths.js';
import { getWorkspaceRoot } from '../files/fileExplorerService.js';
import { defaultCatFolder } from '../cats/catStore.js';
import { galleryPictures } from '../media/gallery.js';

const KINDS = {
  '.md': 'document', '.markdown': 'document', '.txt': 'document', '.pdf': 'document', '.docx': 'document',
  '.html': 'page', '.htm': 'page',
  '.csv': 'data', '.json': 'data', '.xlsx': 'data', '.tsv': 'data',
  '.svg': 'diagram', '.mmd': 'diagram', '.mermaid': 'diagram',
  '.png': 'picture', '.jpg': 'picture', '.jpeg': 'picture', '.webp': 'picture', '.gif': 'picture',
  '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio',
};

export function kindOf(name) {
  return KINDS[path.extname(String(name)).toLowerCase()] || 'code';
}

/** The folders agents work in, by id. */
export function madeRoots(userId) {
  // Chats without a project work where the agent's own default folder is.
  const roots = [{ id: 'chats', label: 'Chats', dir: getWorkspaceRoot() }];
  let agents = [];
  try { agents = db.prepare("SELECT id, name, working_dir FROM agent_profiles WHERE user_id = ? AND coalesce(working_dir, '') != ''").all(userId); } catch { /* no agents yet */ }
  for (const agent of agents) roots.push({ id: `agent:${agent.id}`, label: agent.name, dir: agent.working_dir });
  const folders = db.prepare(`
    SELECT f.id, f.path, p.name FROM project_folders f JOIN projects p ON p.id = f.project_id
    WHERE (p.owner_id = ? OR p.created_by = ?) AND p.is_archived = 0
  `).all(userId, userId);
  for (const folder of folders) roots.push({ id: `project:${folder.id}`, label: folder.name, dir: folder.path });
  let cats = [];
  try { cats = db.prepare('SELECT id, name, folder FROM cats WHERE user_id = ?').all(userId); } catch { /* no Cats yet */ }
  for (const cat of cats) roots.push({ id: `cat:${cat.id}`, label: cat.name, dir: cat.folder || defaultCatFolder(cat.id) });
  return roots;
}

export function madeRoot(userId, id) {
  return madeRoots(userId).find((root) => root.id === id) || null;
}

function artifactFiles(root) {
  const seen = new Set();
  const files = [];
  for (const dir of [getArtifactsDir(root.dir), getLegacyArtifactsDir(root.dir)]) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (name.startsWith('.') || seen.has(name)) continue;
      let stat;
      try { stat = fs.statSync(path.join(dir, name)); } catch { continue; }
      if (!stat.isFile()) continue;
      seen.add(name);
      files.push({ name, stat });
    }
  }
  return files;
}

/** A saved artifact's full path, or null (by root id and file name only). */
export function madeFile(userId, rootId, name) {
  const root = madeRoot(userId, rootId);
  const base = path.basename(String(name || ''));
  if (!root || !base || base !== String(name)) return null;
  for (const dir of [getArtifactsDir(root.dir), getLegacyArtifactsDir(root.dir)]) {
    const file = path.join(dir, base);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

/**
 * Everything, newest first: [{ id, kind, title, where, createdAt, bytes, … }].
 * `kind` keeps one kind; `offset` and `limit` page through what is left.
 * Counts are always of everything.
 */
export function listMade(userId, { limit = 300, offset = 0, kind = null } = {}) {
  const items = [];
  // Pictures are placed by when their file was written; their details are
  // read below, only for the ones on the page.
  for (const picture of galleryPictures()) {
    items.push({ id: `picture:${picture.name}`, kind: 'picture', createdAt: picture.modifiedAt, picture });
  }
  for (const root of madeRoots(userId)) {
    for (const { name, stat } of artifactFiles(root)) {
      items.push({
        id: `file:${root.id}:${name}`,
        kind: kindOf(name),
        title: name,
        where: root.label,
        root: root.id,
        name,
        createdAt: stat.mtime.toISOString(),
        bytes: stat.size,
      });
    }
  }
  const notes = db.prepare(`
    SELECT id, title, conversation_id, updatedat FROM notes
    WHERE createdby = ? AND isarchived = 0 AND (conversation_id IS NOT NULL OR agent_session_id IS NOT NULL)
  `).all(userId);
  for (const note of notes) {
    items.push({
      id: `note:${note.id}`,
      kind: 'note',
      title: note.title || 'Note',
      where: 'Notes',
      noteId: note.id,
      conversationId: note.conversation_id || null,
      createdAt: new Date(`${String(note.updatedat).replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(note.updatedat) ? '' : 'Z'}`).toISOString(),
    });
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const counts = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] || 0) + 1;
  const matching = kind ? items.filter((item) => item.kind === kind) : items;
  const start = Math.max(0, Number(offset) || 0);
  const count = Math.max(1, Number(limit) || 300);
  const page = matching.slice(start, start + count).map((item) => (item.picture ? pictureItem(item.picture.describe()) : item));
  return { items: page, counts, total: matching.length };
}

function pictureItem(picture) {
  return {
    id: `picture:${picture.name}`,
    kind: 'picture',
    title: picture.prompt ? picture.prompt.slice(0, 120) : picture.name,
    where: 'Pictures',
    createdAt: picture.createdAt,
    bytes: picture.bytes,
    url: picture.url,
    name: picture.name,
    prompt: picture.prompt,
    runtime: picture.runtime,
    model: picture.model,
    width: picture.width,
    height: picture.height,
    seed: picture.seed,
    editedFrom: picture.editedFrom,
  };
}
