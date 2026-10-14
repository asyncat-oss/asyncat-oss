// den/src/storage/places/made.js
// Made by agents: pictures, the files agents saved in the folders they work
// in (made/madeIndex.js, Deleted Cats and Claude Code's folder included), and
// the notes they wrote.

import db from '../../db/client.js';
import { artifactDirs, artifactFiles, agentNotes, kindOf, madeRoot, madeRoots, sqliteTime } from '../../made/madeIndex.js';
import { galleryDir, galleryNotesFile, galleryPicture, galleryPictures, galleryUrl } from '../../media/gallery.js';
import { makeId } from '../itemIds.js';
import { removeInside } from '../safeFs.js';
import { badge, fileIn, fileItem, makeItem } from '../fileItems.js';

const KIND_LABELS = {
  picture: 'Picture', document: 'Document', page: 'Page', data: 'Data', diagram: 'Diagram', audio: 'Audio', code: 'Code', note: 'Note',
};

function pictureItem(picture, details) {
  return makeItem({
    id: makeId('picture', picture.name),
    place: 'made',
    kind: 'picture',
    kindLabel: 'Picture',
    title: details.prompt ? details.prompt.slice(0, 120) : picture.name,
    name: picture.name,
    where: 'Pictures',
    whereId: 'pictures',
    bytes: picture.bytes,
    modifiedAt: picture.modifiedAt,
    path: picture.file,
    thumbUrl: galleryUrl(picture.name),
    prompt: details.prompt,
    runtime: details.runtime,
    model: details.model,
    width: details.width,
    height: details.height,
    seed: details.seed,
    editedFrom: details.editedFrom,
    can: { preview: true, open: true, reveal: true, download: true, delete: true, chat: true },
    deleteVerb: 'trash',
  });
}

// Pictures are listed by file; their notes (prompt, model …) are read only
// for the ones a page shows, or a search needs.
function pictureEntry(picture) {
  let details = null;
  const describe = () => (details ||= picture.describe());
  return {
    id: makeId('picture', picture.name),
    place: 'made',
    kind: 'picture',
    title: picture.name,
    name: picture.name,
    where: 'Pictures',
    whereId: 'pictures',
    bytes: picture.bytes,
    modifiedAt: picture.modifiedAt,
    _search: () => `${picture.name} ${describe().prompt || ''}`,
    _finish: () => pictureItem(picture, describe()),
  };
}

function artifactItem(root, entry) {
  const kind = kindOf(entry.name);
  return fileItem({
    id: makeId('made', root.id, entry.name),
    place: 'made',
    kind,
    kindLabel: KIND_LABELS[kind],
    where: root.label,
    whereId: root.whereId,
    entry,
    title: entry.name,
    badges: root.gone ? [badge('neutral', 'Deleted Cat')] : [],
    deleteVerb: 'trash',
  });
}

function noteItem(note) {
  return makeItem({
    id: makeId('note', note.id),
    place: 'made',
    kind: 'note',
    kindLabel: 'Note',
    title: note.title || 'Note',
    where: 'Notes',
    whereId: 'notes',
    modifiedAt: sqliteTime(note.updatedat),
    conversationId: note.conversation_id || null,
    // Notes are kept with your notes: "Open the chat it came from" only.
    can: { chat: Boolean(note.conversation_id) },
  });
}

export const made = {
  id: 'made',
  label: 'Made by agents',
  hint: 'Pictures, documents, pages, data and notes your agents made.',

  pieces(userId) {
    return [galleryDir(), ...madeRoots(userId).flatMap((root) => artifactDirs(root))];
  },

  list(userId) {
    const entries = galleryPictures().map(pictureEntry);
    for (const root of madeRoots(userId)) {
      for (const entry of artifactFiles(root, { links: true })) entries.push(artifactItem(root, entry));
    }
    for (const note of agentNotes(userId)) entries.push(noteItem(note));
    return entries;
  },

  resolve: {
    picture(_userId, [name]) {
      const picture = galleryPicture(name);
      if (!picture) return null;
      const dir = galleryDir();
      return {
        item: pictureItem(picture, picture.describe()),
        target: picture.file,
        // Its prompt and settings go with it.
        remove: async ({ trash }) => {
          const notes = galleryNotesFile(name);
          const freed = await removeInside(dir, picture.file, { trash });
          if (notes) await removeInside(dir, notes, { trash }).catch(() => {});
          return freed;
        },
        root: dir,
      };
    },

    made(userId, [rootId, name]) {
      const root = madeRoot(userId, rootId);
      if (!root || name.startsWith('.')) return null;
      for (const dir of artifactDirs(root)) {
        const entry = fileIn(dir, name, { links: true });
        if (entry) return { item: artifactItem(root, entry), target: entry.file, root: dir, link: entry.link };
      }
      return null;
    },

    note(userId, [noteId]) {
      const note = db.prepare(`
        SELECT id, title, conversation_id, updatedat FROM notes
        WHERE id = ? AND createdby = ? AND isarchived = 0 AND (conversation_id IS NOT NULL OR agent_session_id IS NOT NULL)
      `).get(noteId, userId);
      return note ? { item: noteItem(note), target: null } : null;
    },
  },
};
