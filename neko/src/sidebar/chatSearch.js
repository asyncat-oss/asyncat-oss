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
