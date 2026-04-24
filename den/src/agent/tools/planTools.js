// den/src/agent/tools/planTools.js
// ─── Planning / TODO Tools ───────────────────────────────────────────────────
// Gives the agent a visible, persistent plan. Wired through session.plan so
// the TUI can render the TODO list alongside thoughts and tool calls.
//
// The plan is an array of items:
//   { id, content, status: 'pending'|'in_progress'|'completed', activeForm }
//
// Invariant enforced by todo_write: at most one item may be in_progress.

import { randomUUID } from 'crypto';
import { PermissionLevel } from './toolRegistry.js';

const STATUSES = new Set(['pending', 'in_progress', 'completed']);

function normalizeItem(raw, existingById = new Map()) {
  if (!raw || typeof raw !== 'object') return null;
  const content = String(raw.content ?? raw.text ?? raw.task ?? '').trim();
  if (!content) return null;

  const id = raw.id && existingById.has(raw.id) ? raw.id : (raw.id || randomUUID());
  const status = STATUSES.has(raw.status) ? raw.status : 'pending';
  const activeForm = String(raw.activeForm ?? raw.active_form ?? content).trim();

  return { id, content, status, activeForm };
}

function enforceSingleInProgress(items) {
  let seen = false;
  return items.map(item => {
    if (item.status !== 'in_progress') return item;
    if (seen) return { ...item, status: 'pending' };
    seen = true;
    return item;
  });
}

function ensureSession(context) {
  if (!context?.session) {
    throw new Error('Planning tools require an active agent session.');
  }
  return context.session;
}

function planSnapshot(session) {
  return {
    items: Array.isArray(session.plan) ? session.plan : [],
    total: (session.plan || []).length,
    pending: (session.plan || []).filter(i => i.status === 'pending').length,
    in_progress: (session.plan || []).filter(i => i.status === 'in_progress').length,
    completed: (session.plan || []).filter(i => i.status === 'completed').length,
  };
}

export const todoWriteTool = {
  name: 'todo_write',
  description:
    'Create or replace the current plan (TODO list) for this run. Send the FULL list each time — this is an atomic replace. ' +
    'Use for any non-trivial multi-step task so the user can follow along. ' +
    'Each item: { content, status: pending|in_progress|completed, activeForm }. ' +
    'Mark exactly one item in_progress while you work on it, then completed before moving on.',
  category: 'planning',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: 'Full ordered list of plan items. Replaces the existing plan.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Stable id (optional — server assigns if missing).' },
            content: { type: 'string', description: 'What needs to be done (imperative form).' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            activeForm: { type: 'string', description: 'Present-continuous form shown while running, e.g. "Running tests".' },
          },
          required: ['content', 'status'],
        },
      },
      merge: {
        type: 'boolean',
        description: 'If true, merge status updates into existing items by id instead of replacing. Default false.',
      },
    },
    required: ['todos'],
  },
  execute: async (args, context) => {
    const session = ensureSession(context);
    const input = Array.isArray(args.todos) ? args.todos : [];
    const existing = Array.isArray(session.plan) ? session.plan : [];
    const existingById = new Map(existing.map(item => [item.id, item]));

    let next;
    if (args.merge) {
      const byId = new Map(existing.map(i => [i.id, i]));
      for (const raw of input) {
        const norm = normalizeItem(raw, existingById);
        if (!norm) continue;
        byId.set(norm.id, { ...(byId.get(norm.id) || {}), ...norm });
      }
      next = [...byId.values()];
    } else {
      next = input.map(raw => normalizeItem(raw, existingById)).filter(Boolean);
    }

    next = enforceSingleInProgress(next);
    session.plan = next;
    session.save();

    // Emit plan_update event so TUIs / SSE consumers can render it.
    if (typeof context?.emitEvent === 'function') {
      context.emitEvent({ type: 'plan_update', data: { plan: next, round: session.totalRounds } });
    }

    return { success: true, ...planSnapshot(session) };
  },
};

export const listPlanTool = {
  name: 'list_plan',
  description: 'Read the current plan (TODO list) for this run. Returns items with status counts.',
  category: 'planning',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_args, context) => {
    const session = ensureSession(context);
    return { success: true, ...planSnapshot(session) };
  },
};

export const planTools = [todoWriteTool, listPlanTool];
export default planTools;
