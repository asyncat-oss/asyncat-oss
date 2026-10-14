// den/src/agent/skillSuggestions.js
// "Save this as a skill?" With Settings → Privacy & safety → Suggest skills
// from my chats on, a chat run that worked through a task is drafted into a
// skill with one model call (skills.draftSkillFromRun). Nothing is written
// until the user picks Save on the card in that chat; Not now drops the
// draft. A chat keeps one draft at most, here so it survives a reload, and
// screens hear about drafts over /api/events (skill.suggested, skill.closed).

import { randomUUID } from 'crypto';
import db from '../db/client.js';
import { publishAppEvent } from '../lib/appEvents.js';
import { createSkill, draftSkillFromRun, skillExists, skillFromDraft } from './skills.js';

// Drafts nobody answered are let go after this long.
const KEEP_DAYS = 14;

function publicSuggestion(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id || null,
    name: row.name,
    description: row.description || '',
    createdAt: row.created_at,
  };
}

function findRow(userId, id) {
  return db.prepare('SELECT * FROM agent_skill_suggestions WHERE id = ? AND user_id = ?').get(id, userId) || null;
}

/**
 * Draft a skill from a finished chat run and keep it for that chat. Returns
 * the suggestion, or null when the run isn't worth one. Callers check the
 * setting (AgentRuntime does).
 */
export async function suggestSkillFromRun({ aiClient, model, userId, conversationId, messageId = null, goal, toolHistory, answer }) {
  if (!userId || !conversationId) return null;
  const draft = await draftSkillFromRun({ aiClient, model, goal, toolHistory, answer });
  if (!draft || skillExists(draft.name)) return null;

  const row = {
    id: randomUUID(),
    user_id: userId,
    conversation_id: conversationId,
    message_id: messageId,
    name: draft.name,
    description: draft.description,
    created_at: new Date().toISOString(),
  };
  const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const replaced = db.prepare('SELECT id FROM agent_skill_suggestions WHERE user_id = ? AND conversation_id = ?').all(userId, conversationId);
  db.transaction(() => {
    // A newer draft takes the place of one the chat already had.
    db.prepare('DELETE FROM agent_skill_suggestions WHERE user_id = ? AND (conversation_id = ? OR created_at < ?)').run(userId, conversationId, cutoff);
    db.prepare(`
      INSERT INTO agent_skill_suggestions (id, user_id, conversation_id, message_id, name, description, draft, created_at)
      VALUES (@id, @user_id, @conversation_id, @message_id, @name, @description, @draft, @created_at)
    `).run({ ...row, draft: JSON.stringify(draft) });
  })();

  for (const old of replaced) publishAppEvent('skill.closed', { conversationId, id: old.id }, { userId });
  const suggestion = publicSuggestion(row);
  publishAppEvent('skill.suggested', { conversationId, suggestion }, { userId });
  return suggestion;
}

export function listSkillSuggestions(userId, conversationId) {
  if (!conversationId) return [];
  return db.prepare('SELECT * FROM agent_skill_suggestions WHERE user_id = ? AND conversation_id = ? ORDER BY created_at')
    .all(userId, conversationId)
    .map(publicSuggestion);
}

/** Save: the draft becomes a skill file through the usual skills code. */
export function saveSkillSuggestion(userId, id) {
  const row = findRow(userId, id);
  if (!row) return null;
  const skill = createSkill(skillFromDraft(JSON.parse(row.draft)));
  db.prepare('DELETE FROM agent_skill_suggestions WHERE id = ?').run(id);
  publishAppEvent('skill.closed', { conversationId: row.conversation_id, id, saved: true }, { userId });
  return skill;
}

/** Not now: the draft is dropped. */
export function dismissSkillSuggestion(userId, id) {
  const row = findRow(userId, id);
  if (!row) return false;
  db.prepare('DELETE FROM agent_skill_suggestions WHERE id = ?').run(id);
  publishAppEvent('skill.closed', { conversationId: row.conversation_id, id }, { userId });
  return true;
}

/** Turning suggestions off drops every draft still waiting. */
export function dropSkillSuggestions(userId) {
  const rows = db.prepare('SELECT id, conversation_id FROM agent_skill_suggestions WHERE user_id = ?').all(userId);
  db.prepare('DELETE FROM agent_skill_suggestions WHERE user_id = ?').run(userId);
  for (const row of rows) publishAppEvent('skill.closed', { conversationId: row.conversation_id, id: row.id }, { userId });
  return rows.length;
}
