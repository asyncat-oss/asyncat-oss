// den/src/agent/tools/planTools.js
// ─── Planning / TODO Tools ───────────────────────────────────────────────────
// Gives the agent a visible, persistent plan. Wired through session.plan so
// clients can render the TODO list alongside thoughts and tool calls.
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

  // Optional dependency edges: ids of items that must complete before this one.
  // Accepts `dependencies` or `blockedBy`. Lets the agent express a DAG so
  // independent branches can be parallelised (e.g. delegated to sub-agents).
  const depsRaw = Array.isArray(raw.dependencies) ? raw.dependencies
    : Array.isArray(raw.blockedBy) ? raw.blockedBy
      : null;
  const item = { id, content, status, activeForm };
  // Only attach dependencies when explicitly provided so merge-mode updates
  // don't clobber an item's existing edges with an empty array.
  if (depsRaw) item.dependencies = depsRaw.map(d => String(d || '').trim()).filter(Boolean);

  return item;
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
  const items = Array.isArray(session.plan) ? session.plan : [];
  const total = items.length;
  const pending = items.filter(i => i.status === 'pending').length;
  const in_progress = items.filter(i => i.status === 'in_progress').length;
  const completed = items.filter(i => i.status === 'completed').length;

  // Dependency-aware readiness: an item is "ready" when every dependency it
  // names is completed; "blocked" when a named dependency is still open.
  const byId = new Map(items.map(i => [i.id, i]));
  const isDone = id => byId.get(id)?.status === 'completed';
  const ready = items
    .filter(i => i.status === 'pending' && (i.dependencies || []).every(d => !byId.has(d) || isDone(d)))
    .map(i => i.id);
  const blocked = items
    .filter(i => i.status !== 'completed' && (i.dependencies || []).some(d => byId.has(d) && !isDone(d)))
    .map(i => i.id);

  return {
    items,
    total,
    pending,
    in_progress,
    completed,
    ready,
    blocked,
    completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 100,
  };
}

export const todoWriteTool = {
  name: 'todo_write',
  description:
    'Create or replace the current plan (TODO list) for this run. Send the FULL list each time — this is an atomic replace. ' +
    'Use for any non-trivial multi-step task so the user can follow along. ' +
    'Each item: { id, content, status: pending|in_progress|completed, activeForm, dependencies }. ' +
    'Mark exactly one item in_progress while you work on it, then completed before moving on. ' +
    'Optionally give items stable ids and a `dependencies` array of the ids that must finish first — ' +
    'independent items (no shared dependencies) can be worked or delegated in parallel. ' +
    'The result reports which items are `ready` vs `blocked`.',
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
            id: { type: 'string', description: 'Stable id (optional — server assigns if missing). Provide one if other items depend on it.' },
            content: { type: 'string', description: 'What needs to be done (imperative form).' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            activeForm: { type: 'string', description: 'Present-continuous form shown while running, e.g. "Running tests".' },
            dependencies: { type: 'array', description: 'Optional ids of items that must complete before this one can start.', items: { type: 'string' } },
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

    const snap = planSnapshot(session);

    // Emit plan_update event so clients / SSE consumers can render it.
    if (typeof context?.emitEvent === 'function') {
      context.emitEvent({ type: 'plan_update', data: { plan: next, round: session.totalRounds } });

      // Emit plan_progress for real-time tracking
      context.emitEvent({
        type: 'plan_progress',
        data: {
          completed: snap.completed,
          total: snap.total,
          percentage: snap.completionPercentage,
          round: session.totalRounds,
        },
      });

      // Emit plan_complete when all items are done
      if (snap.total > 0 && snap.completionPercentage === 100) {
        context.emitEvent({
          type: 'plan_complete',
          data: {
            total: snap.total,
            round: session.totalRounds,
          },
        });
      }
    }

    return { success: true, ...snap };
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
