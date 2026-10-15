// What can be done with an item in Files, and what the confirm dialogs and
// toasts say. den works out what is possible (can.*, deleteVerb,
// lockedReason); this only turns that into menu items and words. Without
// the desktop app nothing goes to the Trash, so "Move to Trash" becomes
// "Delete", and Show in folder and Open in another app are left out.

import { formatBytes } from './fileFormat.js';

/** The remove action's name: "Move to Trash", "Delete" or "Remove". */
export function removeLabel(item, { desktop = false } = {}) {
  if (item.deleteVerb === 'remove') return 'Remove';
  if (item.deleteVerb === 'trash' && desktop) return 'Move to Trash';
  return 'Delete';
}

/** Whether removing it goes to the Trash (otherwise it is deleted for good). */
export function goesToTrash(item, { desktop = false } = {}) {
  return item.deleteVerb === 'trash' && desktop;
}

/** A few words on why it can't be removed now: "Loaded now", "Running" … */
export function lockHint(item) {
  const badge = (item.badges || []).map((entry) => entry.label).find((label) => /^(Loaded|Drawing|Downloading|Running|Today)/.test(label)) || '';
  if (badge.startsWith('Loaded')) return 'Loaded now';
  if (badge.startsWith('Drawing')) return 'Drawing now';
  if (badge.startsWith('Downloading')) return 'Downloading';
  if (badge.startsWith('Running')) return 'Running';
  if (badge.startsWith('Today')) return 'Writing to it now';
  if (item.kind === 'note-file') return 'Its note uses it';
  return 'In use';
}

/** Where "Manage in …" goes: its words for the route den gave. */
export function manageLabel(item) {
  const route = item.manageRoute || '';
  if (item.kind === 'knowledge' && item.where && !/^Deleted /.test(item.where)) return `Manage in ${item.where}`;
  if (route.startsWith('/models?tab=training')) return 'Manage in Training';
  if (route.startsWith('/models')) return 'Manage in Models';
  if (route.startsWith('/projects/')) return 'Manage in the project';
  if (route.startsWith('/agents')) return 'Manage in Agents';
  if (route.startsWith('/tools')) return 'Manage in Tools & Skills';
  if (route.startsWith('/settings/connections')) return 'Change in Settings → Connections';
  if (route.startsWith('/files/uploads')) return 'See them in Uploads';
  if (route.startsWith('/files/logs')) return 'Open Logs & caches';
  return 'Manage';
}

/**
 * The menu for an item, in order: [{ id, label, hint?, disabled?, danger? }]
 * and { separator: true }. ids: open, reveal, download, copy, chat, source,
 * manage, remove, locked.
 */
export function menuItems(item, { desktop = false } = {}) {
  const can = item.can || {};
  const items = [];
  if (desktop && can.open) items.push({ id: 'open', label: 'Open in another app' });
  if (desktop && can.reveal) items.push({ id: 'reveal', label: 'Show in folder' });
  if (can.download) items.push({ id: 'download', label: 'Download' });
  if (item.path) items.push({ id: 'copy', label: 'Copy path' });
  if (can.chat && item.kind === 'picture') items.push({ id: 'chat', label: 'Change it in a chat' });
  if (can.chat && item.kind === 'note' && item.conversationId) items.push({ id: 'source', label: 'Open the chat it came from' });
  if (can.manage && item.manageRoute) items.push({ id: 'manage', label: manageLabel(item) });

  let last = null;
  if (can.delete) {
    last = { id: 'remove', label: removeLabel(item, { desktop }), danger: true };
  } else if (item.lockedReason) {
    // In use for now: the action, greyed out, says why. Never removable
    // here (added from another folder, written by the desktop app): just why.
    const inUse = (item.badges || []).some((entry) => /^(Loaded|Drawing|Downloading|Running|Today)/.test(entry.label)) || item.kind === 'note-file';
    last = inUse
      ? { id: 'remove', label: removeLabel(item, { desktop }), hint: lockHint(item), disabled: true }
      : { id: 'locked', label: String(item.lockedReason).replace(/\.$/, ''), disabled: true };
  }
  if (last) {
    if (items.length) items.push({ separator: true });
    items.push(last);
  }
  return items;
}

const quoted = (text) => `“${text}”`;
const frees = (bytes) => (Number(bytes) > 0 ? `Frees ${formatBytes(bytes)}. ` : '');
const isLink = (item) => (item.badges || []).some((entry) => entry.label === 'Link');

/** The confirm dialog before removing an item: { title, message, confirmLabel }. */
export function removeConfirm(item, { desktop = false } = {}) {
  const name = item.title || item.name || 'it';
  const confirmLabel = removeLabel(item, { desktop });
  const trash = goesToTrash(item, { desktop });

  if (isLink(item)) {
    return { title: `Delete the link ${quoted(name)}?`, message: 'Only the link goes; what it points to stays.', confirmLabel };
  }
  if (item.kind === 'picture') {
    return trash
      ? { title: 'Move this picture to the Trash?', message: 'Its prompt and settings go with it.', confirmLabel }
      : { title: 'Delete this picture?', message: 'It is removed from this computer, with its prompt and settings.', confirmLabel };
  }
  if (item.place === 'models') {
    if (item.kind === 'unfinished') {
      return { title: `Delete the unfinished download ${quoted(name)}?`, message: `${frees(item.bytes)}Download it again from Models to use it.`, confirmLabel };
    }
    return { title: `Delete ${name}?`, message: `${frees(item.bytes)}Download it again from Models to use it.`, confirmLabel };
  }
  if (item.kind === 'knowledge') {
    const owner = item.where && !/^Deleted /.test(item.where) ? `${item.where}'s` : 'its';
    return { title: `Remove ${quoted(name)} from ${owner} knowledge?`, message: "The agent can't look things up in it any more.", confirmLabel };
  }
  if (item.kind === 'adapter') {
    return { title: `Delete the adapter ${quoted(name)}?`, message: 'Its model loads without it from now on.', confirmLabel };
  }
  if (item.kind === 'result') {
    return {
      title: `Delete what ${quoted(name)} left behind?`,
      message: `${frees(item.bytes)}Adapters you already made from it keep working. You can't make a new one from it.`,
      confirmLabel,
    };
  }
  if (item.kind === 'dataset') {
    return { title: `Delete the dataset ${quoted(name)}?`, message: "Training that already used it isn't affected.", confirmLabel };
  }
  if (item.kind === 'note-file') {
    return { title: `Delete ${quoted(name)}?`, message: 'Its note was deleted, so nothing uses it.', confirmLabel };
  }
  return trash
    ? { title: `Move ${quoted(name)} to the Trash?`, message: "You can put it back from your computer's Trash.", confirmLabel }
    : { title: `Delete ${quoted(name)}?`, message: 'It is removed from this computer.', confirmLabel };
}

/**
 * Asked when the Trash refused it: which file, and why, before a delete
 * that can't be undone.
 *   { title: '“seed-list.txt” can't go to the Trash', message: 'This drive has no Trash. Delete it for good? …' }
 */
export function trashFailedConfirm(item, error) {
  const name = item?.title || item?.name || 'This file';
  const detail = String(error?.detail || error?.message || error || '');
  const reason = /internal mount|not supported|no trash|trash is not available|unsupported/i.test(detail)
    ? 'This drive has no Trash.'
    : 'The Trash refused it.';
  return {
    title: `“${name}” can't go to the Trash`,
    message: `${reason} Delete it for good? This can't be undone.`,
    confirmLabel: 'Delete for good',
  };
}

/** The toast after removing: "Moved to the Trash", "Removed" or "Deleted". */
export function removedMessage(item, result = {}) {
  if (result.mode === 'trash') return 'Moved to the Trash';
  return item.deleteVerb === 'remove' ? 'Removed' : 'Deleted';
}

// The bulk clean-ups in a place's header.
export const CLEANS = {
  'unfinished-downloads': { place: 'models', kind: 'unfinished', label: 'Delete unfinished downloads' },
  'unused-attachments': { place: 'uploads', kind: 'unused', label: 'Delete unused attachments' },
  'old-logs': { place: 'logs', kind: 'log', label: 'Clear old logs' },
  caches: { place: 'logs', kind: null, label: 'Clear caches and temporary files' },
};

/** The clean-ups offered in a place, in order. */
export function placeCleans(place) {
  return Object.entries(CLEANS).filter(([, clean]) => clean.place === place).map(([action, clean]) => ({ action, ...clean }));
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** The confirm dialog before a clean-up; `files` and `bytes` are what it would remove. */
export function cleanConfirm(action, { files = 0, bytes = 0 } = {}) {
  if (action === 'old-logs') {
    return { title: 'Clear logs from before today?', message: `${frees(bytes)}Today's logs stay because Asyncat is writing to them.`, confirmLabel: 'Clear' };
  }
  if (action === 'unfinished-downloads') {
    return {
      title: `Delete ${plural(files, 'unfinished download', 'unfinished downloads')}?`,
      message: `${frees(bytes)}Downloads that are still running aren't touched.`,
      confirmLabel: 'Delete',
    };
  }
  if (action === 'unused-attachments') {
    return {
      title: `Delete ${plural(files, 'attachment', 'attachments')} no note uses?`,
      message: `${frees(bytes)}They belong to notes that were deleted.`,
      confirmLabel: 'Delete',
    };
  }
  return { title: 'Clear caches and temporary files?', message: 'Voice samples download again the next time you play one.', confirmLabel: 'Clear' };
}

/** The toast after a clean-up: "Cleared 120 MB", or "Nothing to clear". */
export function cleanedMessage(result = {}) {
  if (!result.files) return 'Nothing to clear';
  return Number(result.freedBytes) > 0 ? `Cleared ${formatBytes(result.freedBytes)}` : `Cleared ${plural(result.files, 'file', 'files')}`;
}
