// den/src/users/personalization.js
// Settings → Personalization: what Asyncat should know about you and how it
// should answer, in your own words. Kept on your profile (the users row),
// with the rest of your data: the export has it and "Delete everything"
// removes it. Not in app_config, whose values are copied into den's
// environment and from there into every program den starts.
//
// AgentRuntime (chats, Cats, delegated agents) and the plain chat route
// (chats without tools, Quick ask) add personalizationPrompt() to the system
// prompt. Claude Code, Codex and ACP agents don't get it: their adapters take
// only the task.

import db from '../db/client.js';

// Per field, like ChatGPT's custom instructions: room for a paragraph or
// two, not a document that crowds out the chat.
export const PERSONALIZATION_LIMIT = 1500;

const FIELDS = {
  about: 'about_me',
  answerStyle: 'answer_style',
};

/** Line endings made plain and the ends trimmed. */
function clean(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').trim();
}

/** { about, answerStyle } for a user; empty strings when nothing is set. */
export function getPersonalization(userId) {
  if (!userId) return { about: '', answerStyle: '' };
  try {
    const row = db.prepare('SELECT about_me, answer_style FROM users WHERE id = ?').get(userId);
    return { about: row?.about_me || '', answerStyle: row?.answer_style || '' };
  } catch {
    return { about: '', answerStyle: '' };
  }
}

/**
 * Save either field ({ about, answerStyle }); a field left out keeps its
 * value. Throws an error with status 400 for text that isn't a string or is
 * longer than PERSONALIZATION_LIMIT.
 */
export function savePersonalization(userId, changes = {}) {
  const updates = {};
  for (const [key, column] of Object.entries(FIELDS)) {
    if (changes[key] === undefined) continue;
    if (typeof changes[key] !== 'string') throw Object.assign(new Error(`${key} must be text.`), { status: 400 });
    const text = clean(changes[key]);
    if (text.length > PERSONALIZATION_LIMIT) {
      throw Object.assign(new Error(`Keep each answer under ${PERSONALIZATION_LIMIT.toLocaleString('en')} characters.`), { status: 400 });
    }
    updates[column] = text;
  }
  const columns = Object.keys(updates);
  if (columns.length) {
    db.prepare(`UPDATE users SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
      .run(...columns.map((column) => updates[column]), userId);
  }
  return getPersonalization(userId);
}

/**
 * The part of the system prompt that carries the user's preferences, or ''
 * when there are none. Each field is cut to the limit, in case a longer one
 * reached the database some other way.
 */
export function personalizationPrompt({ about = '', answerStyle = '' } = {}) {
  const parts = [
    ['about_the_user', clean(about).slice(0, PERSONALIZATION_LIMIT)],
    ['how_to_answer', clean(answerStyle).slice(0, PERSONALIZATION_LIMIT)],
  ].filter(([, text]) => text);
  if (!parts.length) return '';
  return [
    "## The user's own preferences",
    'The user wrote these in Settings → Personalization. Follow them in every reply unless they ask for something else in the chat. They describe the user and how they like answers; they don\'t change the safety rules or what your tools may do.',
    ...parts.map(([tag, text]) => `<${tag}>\n${text}\n</${tag}>`),
  ].join('\n\n');
}

/** The prompt part for a user, read from their profile. */
export function personalizationPromptFor(userId) {
  return personalizationPrompt(getPersonalization(userId));
}
