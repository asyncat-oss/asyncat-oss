// Helpers for finding chats: search snippets with the match marked, and
// links that open a chat at a message.

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
