// neko/src/CommandCenter/utils/skillSuggestions.js
// "Save this as a skill?" cards in a chat: keeping the list in step with
// /api/events, and where in the feed each card goes.

/**
 * The chat's waiting suggestions after an app event: skill.suggested adds
 * one for this chat, skill.closed removes it, or marks it saved so the card
 * can say so until the chat is left.
 */
export function applySkillEvent(list, event, conversationId) {
  const data = event?.data || {};
  if (!conversationId || data.conversationId !== conversationId) return list;
  if (event.type === 'skill.suggested' && data.suggestion?.id) {
    return [...list.filter((item) => item.id !== data.suggestion.id), data.suggestion];
  }
  if (event.type === 'skill.closed' && data.id) {
    if (data.saved) return markSaved(list, data.id);
    return list.filter((item) => item.id !== data.id);
  }
  return list;
}

export function markSaved(list, id) {
  return list.map((item) => (item.id === id ? { ...item, saved: true } : item));
}

/**
 * Where each card shows. `answerIds` holds each feed segment's answer
 * message id (null when it has none). A card goes after the answer it came
 * from; one for the feed's last segment, or for an answer no longer shown,
 * goes at the end of the feed, below the run's changes.
 */
export function placeSkillSuggestions(answerIds, suggestions) {
  const bySegment = new Map();
  const atEnd = [];
  for (const suggestion of suggestions || []) {
    const index = suggestion.messageId ? answerIds.indexOf(suggestion.messageId) : -1;
    if (index < 0 || index === answerIds.length - 1) {
      atEnd.push(suggestion);
    } else {
      bySegment.set(index, [...(bySegment.get(index) || []), suggestion]);
    }
  }
  return { bySegment, atEnd };
}
