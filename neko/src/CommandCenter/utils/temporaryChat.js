// neko/src/CommandCenter/utils/temporaryChat.js
// ─── Temporary chat ──────────────────────────────────────────────────────────
// A chat that isn't saved and that Asyncat learns nothing from. The screen
// skips saving it, and its runs go to the server as ephemeral, so the server
// keeps no session, memories, skills or patterns from it either.

export const TEMPORARY_CHAT = {
  title: 'Temporary chat',
  note: "It won't be saved, and Asyncat won't remember anything from it.",
  placeholder: 'Temporary chat: not saved or remembered',
  start: 'Chat without saving it',
  end: 'End temporary chat',
};

/**
 * The chat state once a chat's id is set. Only saved chats have one, so a
 * temporary chat ends when a saved chat opens: the mode never carries over
 * into a chat that is saved, where it would stop the saving and send its
 * runs off the record.
 */
export function withConversationId(state, conversationId) {
  return {
    ...state,
    currentConversationId: conversationId,
    isTemporaryChat: conversationId ? false : Boolean(state.isTemporaryChat),
  };
}

/**
 * Who answers a chat. A temporary chat always uses Asyncat's own agent:
 * Claude Code, Codex and other outside agents keep their own history.
 */
export function engineForChat(engine, temporary) {
  if (temporary) return 'asyncat';
  return engine || 'asyncat';
}
