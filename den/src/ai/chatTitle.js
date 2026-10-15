// Clean a title a model wrote for a chat: models often add markdown, a
// "Title:" label, quotes or a whole sentence. The result is plain words, cut
// at a word boundary with an ellipsis only when something was cut.
import { extractReasoningFromText } from '../agent/reasoningParser.js';

export const CHAT_TITLE_MAX = 60;

export function cleanChatTitle(raw, max = CHAT_TITLE_MAX) {
  const answer = extractReasoningFromText(String(raw || '')).answer;
  const line = answer.split('\n').map((part) => part.trim()).find(Boolean) || '';
  let title = line
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(?:chat\s+)?title\s*:\s*/i, '')
    .replace(/^[*_]+|[*_]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[.:;,]+$/, '')
    .trim();
  if (title.length <= max) return title || null;
  const cut = title.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  title = (lastSpace > max * 0.4 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, '');
  return `${title}…`;
}
