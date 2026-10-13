// den/src/cats/catChat.js
// ─── A Cat's chat ────────────────────────────────────────────────────────────
// Every Cat owns one conversation. Each run adds what woke the Cat and its
// report, in the shape the chat screen saves, so the results read like any
// chat. The user can write to the Cat there: their message is saved here and
// wakes the Cat (catEngine.js), whose answer follows when the run ends.
//
// Writes merge with what is stored (see ai/controllers/ai/messageMerge.js),
// so a run finishing while the chat is open never loses a message.

import { randomUUID } from 'crypto';
import { chatService } from '../ai/controllers/ai/chatService.js';
import { getProjectFileRoots } from '../files/fileExplorerService.js';
import db from '../db/client.js';
import { resolveTimeZone } from '../agent/scheduleMath.js';

const HISTORY_MESSAGES = 6;
const HISTORY_CHARS = 3_000;
const MAX_EVENTS = 200;
const MAX_EVENT_RESULT_CHARS = 12_000;
const KEPT_EVENTS = new Set(['thinking', 'tool_start', 'permission_request', 'skills_loaded', 'plan_update', 'agent_delegate_start', 'agent_delegate_result']);

function trimResult(result) {
  if (result === undefined) return undefined;
  try {
    const text = JSON.stringify(result);
    if (text.length <= MAX_EVENT_RESULT_CHARS) return result;
    return { success: result?.success, truncated: true, preview: text.slice(0, MAX_EVENT_RESULT_CHARS) };
  } catch {
    return undefined;
  }
}

/**
 * Collects the steps of a run (thinking and tool calls with their results) the
 * way the chat screen stores them on an answer.
 */
export function createEventCollector() {
  const events = [];
  const collect = (event) => {
    if (!event?.type) return;
    if (event.type === 'tool_result') {
      const id = event.data?.toolCallId || null;
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const candidate = events[i];
        const same = id ? candidate.data?.toolCallId === id : candidate.data?.tool === event.data?.tool;
        if (candidate.type === 'tool_start' && same && candidate.result === undefined) {
          candidate.result = trimResult(event.data?.result);
          candidate.completedAt = Date.now();
          break;
        }
      }
      return;
    }
    if (!KEPT_EVENTS.has(event.type)) return;
    if (events.length >= MAX_EVENTS) return;
    events.push({ type: event.type, data: event.data, arrivedAt: Date.now() });
  };
  return { collect, events };
}


/** The project folder a Cat's chat works in, as a chat working context, or null. */
export function catWorkingContext(cat) {
  if (!cat?.projectId) return null;
  try {
    const roots = getProjectFileRoots({ userId: cat.userId, projectId: cat.projectId });
    const root = roots.find((item) => item.isPrimary) || roots[0];
    if (root) {
      return { rootId: root.id, projectId: root.projectId, projectName: root.projectName || null, relativePath: '.' };
    }
  } catch { /* no folders */ }
  return { rootId: null, projectId: cat.projectId, projectName: cat.projectName || null, relativePath: '.' };
}

function stamp(when) {
  return `${when.getTime()}_${randomUUID().slice(0, 8)}`;
}

function when(date, timezone) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: resolveTimeZone(timezone),
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function chatMetadata(cat, workingContext) {
  return {
    projectScope: workingContext ? 'project' : 'none',
    workingContext,
    experienceMode: 'work',
    engine: 'asyncat',
    activeBranchId: 'main',
    catId: cat.id,
    ...(cat.profileId ? { agentProfileId: cat.profileId } : {}),
  };
}

function introMessage(cat) {
  const at = new Date();
  return {
    id: `msg_${stamp(at)}_assistant`,
    type: 'assistant',
    content: `Hi, I'm ${cat.name}. My mission:\n\n> ${String(cat.mission).split('\n').join('\n> ')}\n\nI'll post what I do here. Write to me any time and I'll get to it.`,
    timestamp: at.toISOString(),
    toolsEnabled: false,
    branchId: 'main',
  };
}

async function existingConversation(cat) {
  if (!cat.conversationId) return null;
  try {
    return await chatService.getConversation(cat.userId, cat.conversationId);
  } catch {
    return null; // deleted or in the Trash
  }
}

/** The Cat's chat id, creating the chat (with a hello) if it has none. */
export async function ensureCatChat(cat) {
  const conversation = await existingConversation(cat);
  if (conversation) return conversation.id;
  const workingContext = catWorkingContext(cat);
  const saved = await chatService.saveConversation(cat.userId, [introMessage(cat)], {
    title: cat.name,
    mode: 'work',
    workspaceId: cat.workspaceId || null,
    projectIds: cat.projectId ? [cat.projectId] : [],
    metadata: chatMetadata(cat, workingContext),
  });
  db.prepare('UPDATE cats SET conversation_id = ? WHERE id = ?').run(saved.conversationId, cat.id);
  return saved.conversationId;
}

/** Add messages to the Cat's chat (creating it if needed). Returns its id. */
export async function appendToCatChat(cat, messages) {
  const conversation = await existingConversation(cat);
  if (!conversation) {
    const workingContext = catWorkingContext(cat);
    const saved = await chatService.saveConversation(cat.userId, [introMessage(cat), ...messages], {
      title: cat.name,
      mode: 'work',
      workspaceId: cat.workspaceId || null,
      projectIds: cat.projectId ? [cat.projectId] : [],
      metadata: chatMetadata(cat, workingContext),
    });
    db.prepare('UPDATE cats SET conversation_id = ? WHERE id = ?').run(saved.conversationId, cat.id);
    return saved.conversationId;
  }
  const existing = conversation.messages || [];
  await chatService.saveConversation(cat.userId, [...existing, ...messages], {
    conversationId: conversation.id,
    workspaceId: conversation.workspace_id,
    mode: conversation.mode || 'work',
    projectIds: Array.isArray(conversation.project_ids) ? conversation.project_ids : [],
    metadata: { ...(conversation.metadata || {}), catId: cat.id },
    knownMessageIds: existing.map((message) => message.id).filter(Boolean),
  });
  return conversation.id;
}

/** The user's message to the Cat, saved before the Cat answers. */
export async function addUserMessage(cat, text) {
  const at = new Date();
  const message = {
    id: `msg_${stamp(at)}_user`,
    type: 'user',
    content: String(text),
    timestamp: at.toISOString(),
    toolsEnabled: true,
    agentMode: 'action',
    branchId: 'main',
  };
  const conversationId = await appendToCatChat(cat, [message]);
  return { conversationId, messageId: message.id };
}

/**
 * The messages a finished run adds. A run the user's message started adds
 * only the answer (their message is already there); any other run adds what
 * woke the Cat first.
 */
export function runMessages(cat, { wake, startedAt, finishedAt, status, answer, error, sessionId, events = [] }) {
  const out = [];
  if (wake?.kind !== 'chat') {
    out.push({
      id: `msg_${stamp(startedAt)}_user`,
      type: 'user',
      content: `${wake?.label || 'Woke up'} · ${when(startedAt, cat.timezone)}${wake?.reason ? `\n\n${wake.reason}` : ''}`,
      timestamp: startedAt.toISOString(),
      toolsEnabled: true,
      agentMode: 'action',
      branchId: 'main',
      catWake: { kind: wake?.kind || 'manual', triggerId: wake?.triggerId || null },
    });
  }
  out.push({
    id: `msg_${stamp(finishedAt)}_assistant`,
    type: 'assistant',
    content: status === 'succeeded'
      ? answer
      : status === 'cancelled'
        ? `I stopped: ${error || 'the run was cancelled.'}`
        : `This run didn't finish: ${error || 'something went wrong.'}`,
    timestamp: finishedAt.toISOString(),
    toolsEnabled: true,
    agentMode: 'action',
    agentSessionId: sessionId || undefined,
    agentEvents: events,
    branchId: 'main',
  });
  return out;
}

/** The last few messages of the Cat's chat, as history for a run. */
export async function loadCatChatHistory(cat, { skipMessageId = null } = {}) {
  const conversation = await existingConversation(cat);
  if (!conversation) return [];
  return (conversation.messages || [])
    .filter((message) => (message.type === 'user' || message.type === 'assistant') && message.id !== skipMessageId)
    .slice(-HISTORY_MESSAGES)
    .map((message) => ({
      role: message.type,
      content: String(message.content || '').slice(0, HISTORY_CHARS),
      timestamp: message.timestamp || null,
    }));
}
