// schedulerTools.js — agent-facing scheduled task controls

import { PermissionLevel } from './toolRegistry.js';
import db from '../../db/client.js';
import {
  deleteJob,
  disableJob,
  enableJob,
  listJobRuns,
  listJobs,
  runJobNow,
  scheduleJob,
  updateJob,
} from '../Scheduler.js';
import { publicProvider } from '../../ai/controllers/ai/providerCatalog.js';

const UNIT_MS = {
  second: 1000,
  seconds: 1000,
  sec: 1000,
  secs: 1000,
  minute: 60_000,
  minutes: 60_000,
  min: 60_000,
  mins: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
};

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function providerSnapshotFromRow(row) {
  if (!row) return null;
  const pub = publicProvider({
    id: row.profile_id || row.id || null,
    name: row.name || null,
    provider_type: row.provider_type,
    provider_id: row.provider_id,
    base_url: row.base_url,
    model: row.model,
    settings: row.settings,
    supports_tools: row.supports_tools,
    api_key: row.api_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
  return {
    id: pub?.id || row.profile_id || row.id || null,
    name: pub?.name || row.name || row.provider_id,
    provider_type: pub?.provider_type || row.provider_type,
    provider_id: pub?.provider_id || row.provider_id,
    base_url: pub?.base_url || row.base_url,
    model: pub?.model || row.model,
    settings: pub?.settings || parseJson(row.settings, {}),
    supports_tools: Boolean(pub?.supports_tools ?? row.supports_tools),
    local: Boolean(pub?.local),
    managed: Boolean(pub?.managed),
  };
}

function resolveProvider(userId, providerProfileId = null) {
  if (providerProfileId) {
    const row = db.prepare('SELECT * FROM ai_provider_profiles WHERE user_id = ? AND id = ?').get(userId, providerProfileId);
    if (!row) throw new Error('Selected AI provider profile was not found.');
    return { providerProfileId: row.id, providerSnapshot: providerSnapshotFromRow(row) };
  }

  const active = db.prepare('SELECT * FROM ai_provider_config WHERE user_id = ?').get(userId);
  if (!active) throw new Error('No active AI provider is configured. Choose a model on the Models page first.');
  return {
    providerProfileId: active.profile_id || null,
    providerSnapshot: providerSnapshotFromRow(active),
  };
}

function normalizeJob(job) {
  if (!job) return job;
  return {
    id: job.id,
    name: job.name,
    goal: job.goal,
    schedule: job.schedule,
    enabled: Boolean(job.enabled),
    lastRunAt: job.last_run_at || job.lastRunAt || null,
    nextRunAt: job.next_run_at || job.nextRunAt || null,
    runCount: job.run_count ?? job.runCount ?? 0,
    profileId: job.profile_id || job.profileId || null,
    providerProfileId: job.provider_profile_id || job.providerProfileId || null,
    provider: job.provider_snapshot || job.provider || null,
    latestRun: job.latest_run || job.latestRun || null,
    createdAt: job.created_at || job.createdAt || null,
    updatedAt: job.updated_at || job.updatedAt || null,
  };
}

function parseClock(text) {
  const match = String(text || '').match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const ampm = match[3]?.toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseSchedule(input, now = new Date()) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^(hourly|interval:\d+|once:\d+|daily:\d{1,2}:\d{2}|at:.+)$/i.test(raw)) return raw;

  const lower = raw.toLowerCase();
  if (/^every\s+hour$|^hourly$/.test(lower)) return 'hourly';

  const every = lower.match(/^every\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|days?)$/);
  if (every) {
    const n = Number(every[1]);
    const unit = UNIT_MS[every[2]];
    if (Number.isFinite(n) && unit) return `interval:${n * unit}`;
  }

  const once = lower.match(/^(?:in|after)\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|days?)$/);
  if (once) {
    const n = Number(once[1]);
    const unit = UNIT_MS[once[2]];
    if (Number.isFinite(n) && unit) return `once:${n * unit}`;
  }

  if (lower.startsWith('tomorrow')) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    const clock = parseClock(lower);
    if (clock) next.setHours(clock.hour, clock.minute, 0, 0);
    return `at:${next.toISOString()}`;
  }

  const daily = lower.match(/^daily(?:\s+at)?\s+(.+)$/);
  if (daily) {
    const clock = parseClock(daily[1]);
    if (clock) {
      return `daily:${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;
    }
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return `at:${new Date(parsed).toISOString()}`;

  return null;
}

function requireContext(context) {
  if (!context?.userId) throw new Error('Missing user context.');
  return {
    userId: context.userId,
    workspaceId: context.workspaceId || 'default',
    workingDir: context.workingDir || '.',
  };
}

export const listScheduledTasksTool = {
  name: 'list_scheduled_tasks',
  description: 'List scheduled agent tasks for this workspace, including next run time and latest run result.',
  category: 'schedule',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_args, context) => {
    const { userId, workspaceId } = requireContext(context);
    const jobs = listJobs(userId, workspaceId).map(normalizeJob);
    return { success: true, count: jobs.length, jobs };
  },
};

export const createScheduledTaskTool = {
  name: 'create_scheduled_task',
  description:
    'Create a persisted scheduled agent task. Use this for requests like "run this every hour" or "remind me tomorrow". Schedule accepts hourly, interval:<ms>, once:<ms>, at:<ISO>, daily:HH:MM, or simple phrases like "every 30 minutes", "in 2 hours", "tomorrow at 9am". For reminders, make the goal explicitly call notify.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short name for the scheduled task.' },
      goal: { type: 'string', description: 'Exact agent goal to run each time.' },
      schedule: { type: 'string', description: 'Schedule string or supported simple phrase.' },
      profile_id: { type: 'string', description: 'Optional agent profile id.' },
      provider_profile_id: { type: 'string', description: 'Optional AI provider profile id. Defaults to the current active provider.' },
      working_dir: { type: 'string', description: 'Optional working directory for the scheduled run.' },
    },
    required: ['name', 'goal', 'schedule'],
  },
  execute: async (args, context) => {
    const { userId, workspaceId, workingDir } = requireContext(context);
    const schedule = parseSchedule(args.schedule);
    if (!schedule) return { success: false, error: `Invalid schedule: ${args.schedule}` };
    const provider = resolveProvider(userId, args.provider_profile_id || null);
    const job = scheduleJob({
      name: String(args.name || '').trim(),
      goal: String(args.goal || '').trim(),
      schedule,
      userId,
      workspaceId,
      profileId: args.profile_id || null,
      providerProfileId: provider.providerProfileId,
      providerSnapshot: provider.providerSnapshot,
      workingDir: args.working_dir || workingDir || '.',
    });
    return { success: true, job: normalizeJob(job) };
  },
};

export const updateScheduledTaskTool = {
  name: 'update_scheduled_task',
  description: 'Update a scheduled agent task name, goal, schedule, working directory, profile, provider, or enabled state.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Scheduled task id.' },
      name: { type: 'string', description: 'New task name.' },
      goal: { type: 'string', description: 'New task goal.' },
      schedule: { type: 'string', description: 'New schedule string or supported simple phrase.' },
      enabled: { type: 'boolean', description: 'Whether the task should be enabled.' },
      profile_id: { type: 'string', description: 'New agent profile id, or empty string to clear.' },
      provider_profile_id: { type: 'string', description: 'New AI provider profile id.' },
      working_dir: { type: 'string', description: 'New working directory.' },
    },
    required: ['id'],
  },
  execute: async (args, context) => {
    const { userId, workspaceId } = requireContext(context);
    const patch = {};
    if (args.name !== undefined) patch.name = String(args.name || '').trim();
    if (args.goal !== undefined) patch.goal = String(args.goal || '').trim();
    if (args.schedule !== undefined) {
      const schedule = parseSchedule(args.schedule);
      if (!schedule) return { success: false, error: `Invalid schedule: ${args.schedule}` };
      patch.schedule = schedule;
    }
    if (args.enabled !== undefined) patch.enabled = Boolean(args.enabled);
    if (args.profile_id !== undefined) patch.profileId = args.profile_id || null;
    if (args.working_dir !== undefined) patch.workingDir = args.working_dir || '.';
    if (args.provider_profile_id !== undefined) {
      const provider = resolveProvider(userId, args.provider_profile_id || null);
      patch.providerProfileId = provider.providerProfileId;
      patch.providerSnapshot = provider.providerSnapshot;
    }
    const job = updateJob({ id: args.id, userId, workspaceId, ...patch });
    if (!job) return { success: false, error: 'Scheduled task not found.' };
    return { success: true, job: normalizeJob(job) };
  },
};

export const deleteScheduledTaskTool = {
  name: 'delete_scheduled_task',
  description: 'Delete a scheduled agent task by id.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Scheduled task id.' },
    },
    required: ['id'],
  },
  execute: async (args, context) => {
    const { userId, workspaceId } = requireContext(context);
    const row = db.prepare('SELECT id FROM scheduled_jobs WHERE id = ? AND user_id = ? AND workspace_id = ?')
      .get(args.id, userId, workspaceId);
    if (!row) return { success: false, error: 'Scheduled task not found.' };
    deleteJob(args.id);
    return { success: true, deleted: args.id };
  },
};

export const setScheduledTaskEnabledTool = {
  name: 'set_scheduled_task_enabled',
  description: 'Enable or disable a scheduled agent task.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Scheduled task id.' },
      enabled: { type: 'boolean', description: 'True to enable, false to disable.' },
    },
    required: ['id', 'enabled'],
  },
  execute: async (args, context) => {
    const { userId, workspaceId } = requireContext(context);
    const row = db.prepare('SELECT id FROM scheduled_jobs WHERE id = ? AND user_id = ? AND workspace_id = ?')
      .get(args.id, userId, workspaceId);
    if (!row) return { success: false, error: 'Scheduled task not found.' };
    if (args.enabled) enableJob(args.id);
    else disableJob(args.id);
    const job = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(args.id);
    return { success: true, job: normalizeJob({ ...job, provider_snapshot: parseJson(job.provider_snapshot, {}) }) };
  },
};

export const runScheduledTaskNowTool = {
  name: 'run_scheduled_task_now',
  description: 'Run a scheduled agent task immediately without waiting for its next timer.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Scheduled task id.' },
    },
    required: ['id'],
  },
  execute: async (args, context) => {
    const { userId, workspaceId } = requireContext(context);
    const row = db.prepare('SELECT id FROM scheduled_jobs WHERE id = ? AND user_id = ? AND workspace_id = ?')
      .get(args.id, userId, workspaceId);
    if (!row) return { success: false, error: 'Scheduled task not found.' };
    const run = await runJobNow(args.id);
    return { success: true, run };
  },
};

export const listScheduledTaskRunsTool = {
  name: 'list_scheduled_task_runs',
  description: 'List recent runs for a scheduled agent task.',
  category: 'schedule',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Scheduled task id.' },
      limit: { type: 'number', description: 'Maximum runs to return. Default 20.' },
    },
    required: ['id'],
  },
  execute: async (args, context) => {
    const { userId, workspaceId } = requireContext(context);
    const limit = Math.max(1, Math.min(100, Number(args.limit || 20)));
    const runs = listJobRuns(args.id, userId, workspaceId, limit);
    if (!runs) return { success: false, error: 'Scheduled task not found.' };
    return { success: true, count: runs.length, runs };
  },
};

export const schedulerTools = [
  listScheduledTasksTool,
  createScheduledTaskTool,
  updateScheduledTaskTool,
  deleteScheduledTaskTool,
  setScheduledTaskEnabledTool,
  runScheduledTaskNowTool,
  listScheduledTaskRunsTool,
];

export default schedulerTools;
