// den/src/agent/scheduledTaskChat.js
// ─── A scheduled task's chat ──────────────────────────────────────────────────
// Every task owns one conversation. Each finished run adds the prompt (headed
// "Scheduled run · <date>") and the agent's answer to it, in the same shape
// the chat screen saves, so the results read like any other chat and the user
// can reply to them.

import { randomUUID } from 'crypto';
import { chatService } from '../ai/controllers/ai/chatService.js';
import { getProjectFileRoots } from '../files/fileExplorerService.js';
import { resolveTimeZone } from './scheduleMath.js';

const MAX_EVENTS = 200;
const MAX_EVENT_RESULT_CHARS = 12_000;
const HISTORY_MESSAGES = 4;
const HISTORY_CHARS = 3_000;
const KEPT_EVENTS = new Set(['thinking', 'tool_start', 'permission_request', 'skills_loaded', 'plan_update', 'agent_delegate_start', 'agent_delegate_result']);

/** The task's project folder as a chat working context, or null. */
export function taskWorkingContext(task, userId = task?.userId) {
  if (!task?.projectId) return null;
  const roots = getProjectFileRoots({ userId, projectId: task.projectId });
  const root = roots.find((item) => item.isPrimary) || roots[0];
  if (!root) return null;
  return {
    rootId: root.id,
    projectId: root.projectId,
    projectName: root.projectName || null,
    relativePath: '.',
  };
}

function runHeader(startedAt, timezone) {
  let when;
  try {
    when = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: resolveTimeZone(timezone),
    }).format(startedAt);
  } catch {
    when = startedAt.toISOString();
  }
  return `Scheduled run · ${when}`;
}

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

/** The last few messages of the task's chat, as history for the next run. */
export async function loadTaskChatHistory(task) {
  if (!task?.conversationId) return [];
  try {
    const conversation = await chatService.getConversation(task.userId, task.conversationId);
    return (conversation?.messages || [])
      .filter((message) => message.type === 'user' || message.type === 'assistant')
      .slice(-HISTORY_MESSAGES)
      .map((message) => ({
        role: message.type,
        content: String(message.content || '').slice(0, HISTORY_CHARS),
        timestamp: message.timestamp || null,
      }));
  } catch {
    return [];
  }
}

function buildMessages(task, { startedAt, finishedAt, status, answer, error, sessionId, events = [], workingContext }) {
  // Message ids are unique across all chats (see chatService branch records).
  const stamp = `${startedAt.getTime()}_${randomUUID().slice(0, 8)}`;
  const user = {
    id: `msg_${stamp}_user`,
    type: 'user',
    content: `${runHeader(startedAt, task.timezone)}\n\n${task.prompt}`,
    timestamp: startedAt.toISOString(),
    toolsEnabled: true,
    agentMode: 'action',
    workingContext,
    branchId: 'main',
  };
  const assistant = {
    id: `msg_${stamp}_assistant`,
    type: 'assistant',
    content: status === 'succeeded'
      ? answer
      : `This scheduled run didn't finish: ${error || 'something went wrong.'}`,
    timestamp: finishedAt.toISOString(),
    toolsEnabled: true,
    agentMode: 'action',
    agentSessionId: sessionId || undefined,
    agentEvents: events,
    branchId: 'main',
  };
  return [user, assistant];
}

/**
 * Add one run to the task's chat, creating the chat on the first run (or
 * again if it was deleted). Returns the conversation id.
 */
export async function appendRunToTaskChat(task, run) {
  const workingContext = taskWorkingContext(task);
  const messages = buildMessages(task, { ...run, workingContext });

  if (task.conversationId) {
    let conversation = null;
    try {
      conversation = await chatService.getConversation(task.userId, task.conversationId);
    } catch {
      conversation = null; // deleted or in the Trash: start a new one below
    }
    if (conversation) {
      const projectIds = Array.isArray(conversation.project_ids) ? conversation.project_ids : [];
      const existing = conversation.messages || [];
      await chatService.saveConversation(task.userId, [...existing, ...messages], {
        conversationId: conversation.id,
        workspaceId: conversation.workspace_id,
        mode: conversation.mode || 'work',
        projectIds,
        metadata: { ...(conversation.metadata || {}), scheduledTaskId: task.id },
        // Messages the user sent while the run was going are kept.
        knownMessageIds: existing.map((message) => message.id).filter(Boolean),
      });
      return conversation.id;
    }
  }

  const saved = await chatService.saveConversation(task.userId, messages, {
    title: task.name,
    mode: 'work',
    workspaceId: task.workspaceId || null,
    projectIds: task.projectId ? [task.projectId] : [],
    metadata: {
      projectScope: workingContext ? 'project' : 'none',
      workingContext,
      experienceMode: 'work',
      engine: 'asyncat',
      activeBranchId: 'main',
      scheduledTaskId: task.id,
    },
  });
  return saved.conversationId;
}
