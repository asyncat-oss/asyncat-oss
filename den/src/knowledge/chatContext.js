/**
 * The project and agent context a chat brings to the model: instructions,
 * knowledge excerpts and images, sized to the model that will answer.
 */

import db from '../db/client.js';
import { describeModel } from '../ai/controllers/ai/modelProfile.js';
import { buildKnowledgeContext } from './contextBuilder.js';

/** A project the user owns, with its instructions, or null. */
export function projectForChat(userId, projectId) {
  if (!userId || !projectId) return null;
  return db.prepare(`
    SELECT id, name, emoji, instructions FROM projects
    WHERE id = ? AND owner_id = ? AND is_archived = 0
  `).get(String(projectId), userId) || null;
}

/** Knowledge sources for a chat: its project and its agent, when they have any. */
export function knowledgeSourcesFor({ project = null, agent = null } = {}) {
  const sources = [];
  if (project) {
    sources.push({ type: 'project', id: project.id, label: `project “${project.name}”`, instructions: project.instructions || '' });
  }
  if (agent?.id) {
    sources.push({ type: 'agent', id: agent.id, label: `agent “${agent.name}”`, instructions: agent.instructions || '' });
  }
  return sources;
}

/**
 * Everything the model needs from the chat's project and agent.
 * resolvedClient is what getAiClientForUser (or the agent's model) returned.
 */
export function buildChatContext({ project = null, agent = null, query = '', resolvedClient = null }) {
  const sources = knowledgeSourcesFor({ project, agent });
  if (!sources.length) return { prompt: '', images: [], sources: [], stats: null, model: null };
  const model = resolvedClient ? describeModel(resolvedClient) : null;
  const built = buildKnowledgeContext({
    sources,
    query,
    contextWindow: model?.contextWindow,
    supportsImages: Boolean(model?.supportsImages),
  });
  return { ...built, sources: sources.map(({ type, id }) => ({ type, id })), model };
}
