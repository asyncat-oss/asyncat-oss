// den/src/storage/places/exports.js
// Exports: the zips "Export everything" wrote to its folder (Downloads, or
// ASYNCAT_EXPORT_DIR). Only files named the way it names them are listed or
// removed; anything else in that folder is never touched.

import path from 'path';
import { exportFolder } from '../../privacy/privacyService.js';
import { makeId } from '../itemIds.js';
import { EXPORT_NAME } from '../safeFs.js';
import { fileIn, filesIn, fileItem } from '../fileItems.js';

function exportItem(entry) {
  const folder = exportFolder();
  return fileItem({
    id: makeId('export', entry.name),
    place: 'exports',
    kind: 'export',
    kindLabel: 'Export',
    title: entry.name,
    where: path.basename(folder) || folder,
    whereId: 'exports',
    entry,
    can: { preview: false, open: false },
    deleteVerb: 'trash',
  });
}

function exportFiles() {
  return filesIn(exportFolder(), { links: true, match: EXPORT_NAME });
}

export const exportsPlace = {
  id: 'exports',
  label: 'Exports',
  hint: 'Zips made by Export everything.',

  pieces() {
    return exportFiles().filter((entry) => !entry.link).map((entry) => entry.file);
  },

  list() {
    return exportFiles().map(exportItem);
  },

  resolve: {
    export(_userId, [name]) {
      if (!EXPORT_NAME.test(name)) return null;
      const entry = fileIn(exportFolder(), name, { links: true });
      return entry ? { item: exportItem(entry), target: entry.file, root: exportFolder(), link: entry.link } : null;
    },
  },
};
