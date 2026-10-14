// Helpers for finding chats: search snippets with the match marked, links
// that open a chat at a message, and the sidebar's Pinned and Recents lists.

// The server marks each match in a snippet between these two characters
// (den/src/search/messageIndex.js), which never occur in indexed text.
export const MARK_START = '\u0002';
export const MARK_END = '\u0003';

/** A snippet as parts, each a match or not, to render without HTML. */
export function snippetParts(snippet) {
  const parts = [];
  let match = false;
  let text = '';
  for (const char of String(snippet || '')) {
    if (char === MARK_START || char === MARK_END) {
      if (text) parts.push({ text, match });
      text = '';
      match = char === MARK_START;
    } else {
      text += char;
    }
  }
  if (text) parts.push({ text, match });
  return parts;
}

/** The snippet's text alone, for titles and screen readers. */
export function plainSnippet(snippet) {
  return snippetParts(snippet).map((part) => part.text).join('');
}

// Words as the server's search reads them: runs of letters and digits.
const WORD = /[\p{L}\p{N}\p{M}]+/gu;
// Scripts written without spaces, where a match may start inside a run.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

const fold = (text) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * A chat's name with what was typed marked like a snippet's matches, for a
 * chat found by its name. Words match where they start, ignoring case and
 * accents, as the server matched them (den/src/search/messageIndex.js); a
 * word of one letter only as a whole word, unless it ends what was typed.
 */
export function markTitle(title, query) {
  // eslint-disable-next-line no-control-regex
  const text = String(title || '').replace(/[\u0002\u0003]/g, '');
  const parts = String(query || '').normalize('NFKC').trim().split(/\s+/);
  // The title folded, and where each of its characters came from.
  let folded = '';
  const from = [];
  for (let index = 0; index < text.length;) {
    const char = String.fromCodePoint(text.codePointAt(index));
    const piece = fold(char);
    for (let k = 0; k < piece.length; k += 1) from.push(index);
    folded += piece;
    index += char.length;
  }
  from.push(text.length);

  const ranges = [];
  parts.forEach((part, partIndex) => {
    const tokens = part.match(WORD) || [];
    tokens.forEach((token, tokenIndex) => {
      const word = fold(token);
      if (!word) return;
      const typing = partIndex === parts.length - 1 && tokenIndex === tokens.length - 1 && part.endsWith(token);
      const whole = [...word].length === 1 && !typing;
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = UNSPACED.test(word)
        ? new RegExp(escaped, 'gu')
        : new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${whole ? '(?![\\p{L}\\p{N}])' : ''}`, 'gu');
      for (const match of folded.matchAll(pattern)) {
        // A match that ends inside a character folded into several (ﬁ is
        // "fi") takes in the whole character.
        let end = match.index + match[0].length;
        while (end < folded.length && from[end] === from[end - 1]) end += 1;
        ranges.push([from[match.index], from[end]]);
      }
    });
  });
  // Overlapping or touching matches are marked as one.
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  let marked = '';
  let at = 0;
  for (const [start, end] of merged) {
    marked += text.slice(at, start) + MARK_START + text.slice(start, end) + MARK_END;
    at = end;
  }
  return marked + text.slice(at);
}

/** Opens a chat; with a message id, scrolled to that message. */
export function chatLink(conversationId, messageId = null) {
  const path = `/conversations/${encodeURIComponent(conversationId)}`;
  return messageId ? `${path}?message=${encodeURIComponent(messageId)}` : path;
}

/** The message a chat link asks to show, from location.search. */
export function linkedMessageId(search) {
  const id = new URLSearchParams(search || '').get('message');
  return id ? id.slice(0, 200) : null;
}

export function isPinned(conversation) {
  const value = conversation?.is_pinned;
  return value === true || value === 1 || value === '1' || value === 'true';
}

/**
 * The sidebar's lists from chats sorted newest first. Each chat shows in one
 * place only: under Pinned if it is pinned (a project's chat too), else in
 * its project's group, else in Recents (the newest few). `pinnedInProject`
 * counts each project's chats that went to Pinned.
 */
export function sidebarChatLists(conversations, { projectOf = () => null, recentLimit = 7 } = {}) {
  const pinned = [];
  const recents = [];
  const byProject = new Map();
  const pinnedInProject = new Map();
  for (const conversation of conversations || []) {
    const projectId = projectOf(conversation);
    if (isPinned(conversation)) {
      pinned.push(conversation);
      if (projectId) pinnedInProject.set(projectId, (pinnedInProject.get(projectId) || 0) + 1);
    } else if (projectId) {
      if (!byProject.has(projectId)) byProject.set(projectId, []);
      byProject.get(projectId).push(conversation);
    } else if (recents.length < recentLimit) {
      recents.push(conversation);
    }
  }
  return { pinned, recents, byProject, pinnedInProject };
}

/** Sets one chat's pinned state in a list, keeping everything else as is. */
export function withPinned(conversations, conversationId, pinned) {
  return (conversations || []).map((conversation) => (
    conversation.id === conversationId ? { ...conversation, is_pinned: pinned } : conversation
  ));
}

/**
 * The message a search result on All chats opens at: its best hit, the one
 * its snippet shows, even when its name matched too. A chat found only by
 * its name has none and opens as usual.
 */
export function hitMessageId(chat) {
  return (Array.isArray(chat?.hits) && chat.hits[0]?.message_id) || null;
}
