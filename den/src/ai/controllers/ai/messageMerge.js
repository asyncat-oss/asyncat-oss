// den/src/ai/controllers/ai/messageMerge.js
// ─── Saving a chat from a view that is out of date ───────────────────────────
// The chat screen saves a conversation by sending all of its messages. When
// the server added messages after the screen loaded the chat (a scheduled run
// or a Cat writing its result), a save from that stale view used to drop them.
//
// So a save also says which message ids its sender has seen. A stored message
// the sender has never seen is kept, slotted in after the message it followed.
// One the sender has seen but no longer sends was removed on purpose (a
// regenerated answer, an edit that started a branch) and stays removed.
//
// The same merge runs in the chat screen when it refreshes an open chat.

function idOf(message) {
  const id = message?.id;
  return typeof id === 'string' && id ? id : null;
}

function timeOf(message) {
  const time = Date.parse(message?.timestamp || '');
  return Number.isNaN(time) ? null : time;
}

/**
 * The ids a sender knows about: the ones it says it has seen, the ones it
 * sends, and the messages it keeps in other branches of the chat.
 */
export function knownMessageIds({ posted = [], knownIds = [], metadata = null } = {}) {
  const known = new Set();
  for (const id of Array.isArray(knownIds) ? knownIds : []) {
    if (typeof id === 'string' && id) known.add(id);
  }
  for (const message of Array.isArray(posted) ? posted : []) {
    const id = idOf(message);
    if (id) known.add(id);
  }
  const branches = Array.isArray(metadata?.branches) ? metadata.branches : [];
  for (const branch of branches) {
    for (const message of Array.isArray(branch?.messages) ? branch.messages : []) {
      const id = idOf(message);
      if (id) known.add(id);
    }
  }
  return known;
}

/**
 * Merge a save into what is stored. Returns { messages, kept } where `kept`
 * counts the stored messages the sender hadn't seen and that were kept.
 *
 * Each unseen message goes after the stored message it followed that the
 * sender still has (or at the start). If the sender added messages of its own
 * at that point, the unseen ones go after those that are older than them, so
 * the chat stays in time order in the usual case.
 */
export function mergeStaleMessages({ stored = [], posted = [], knownIds = [], metadata = null } = {}) {
  const sent = Array.isArray(posted) ? posted : [];
  const storedList = Array.isArray(stored) ? stored : [];
  const known = knownMessageIds({ posted: sent, knownIds, metadata });
  const sentIds = new Set(sent.map(idOf).filter(Boolean));
  const storedIds = new Set(storedList.map(idOf).filter(Boolean));

  // Unseen stored messages, grouped by the stored message they follow that
  // the sender still has (null: the start of the chat).
  const groups = new Map();
  let anchor = null;
  let kept = 0;
  for (const message of storedList) {
    const id = idOf(message);
    if (id && sentIds.has(id)) {
      anchor = id;
      continue;
    }
    if (!id || known.has(id)) continue;
    if (!groups.has(anchor)) groups.set(anchor, []);
    groups.get(anchor).push(message);
    kept += 1;
  }
  if (!kept) return { messages: sent, kept: 0 };

  const merged = [];
  let pending = null; // an unseen group waiting for its place

  const flush = () => {
    if (pending) merged.push(...pending);
    pending = null;
  };
  const isOwnOlder = (message) => {
    // A message only the sender has (it's new on the sender's side), older
    // than the group waiting to go in.
    if (!pending) return false;
    const id = idOf(message);
    if (id && storedIds.has(id)) return false;
    const mine = timeOf(message);
    const theirs = timeOf(pending[0]);
    return mine !== null && theirs !== null && mine < theirs;
  };

  pending = groups.get(null) || null;
  for (const message of sent) {
    if (pending && !isOwnOlder(message)) flush();
    merged.push(message);
    const id = idOf(message);
    if (id && groups.has(id)) {
      flush();
      pending = groups.get(id);
    }
  }
  flush();
  return { messages: merged, kept };
}
