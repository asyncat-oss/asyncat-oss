// schedulerTools.js — the agent's controls for scheduled tasks
//
// A scheduled task runs a prompt on a schedule; each run's answer lands in
// the task's own chat and in a desktop notification. Schedules are written
// in plain English ("every weekday at 8am") or as cron.

import { PermissionLevel } from './toolRegistry.js';
import {
  cancelTask,
  createTask,
  deleteTask,
  getTask,
  listTaskRuns,
  listTasks,
  runTaskNow,
  setTaskEnabled,
  updateTask,
} from '../Scheduler.js';
import { currentScheduledRun } from '../scheduledRunContext.js';

const SCHEDULE_HELP = 'Plain English such as "every weekday at 8am", "every Monday at 9", "mondays and thursdays at 9:30", "daily 18:00", "every 3 hours", "tomorrow at 7am", "in 2 hours", or a 5-field cron expression such as "0 9 * * 1-5". Tasks repeat at most every 15 minutes.';

function requireContext(context) {
  if (!context?.userId) throw new Error('Missing user context.');
  return { userId: context.userId, workspaceId: context.workspaceId || null, projectId: context.projectId || null };
}

/** Scheduled runs may look at tasks but never create, change or start them. */
function refuseInsideScheduledRun() {
  if (!currentScheduledRun()) return null;
  return { success: false, error: "Scheduled runs can't create, change, pause or start scheduled tasks. Ask the user to do it in a chat." };
}

function formatWhen(iso, timezone) {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: timezone || undefined, timeZoneName: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function summary(task) {
  if (!task) return null;
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    schedule: task.scheduleText,
    timezone: task.timezone,
    state: task.running ? 'running' : task.state,
    next_run: formatWhen(task.nextRunAt, task.timezone),
    next_run_at: task.nextRunAt,
    last_run: task.lastRun ? {
      status: task.lastRun.status,
      started_at: task.lastRun.startedAt,
      result: String(task.lastRun.error || task.lastRun.answer || '').slice(0, 400) || null,
    } : null,
    project: task.projectName || null,
    agent: task.profileName || null,
    pre_approved_tools: task.allowedTools,
    chat: task.conversationId ? `/conversations/${task.conversationId}` : null,
  };
}

function failure(err) {
  return { success: false, error: err?.message || String(err) };
}

function projectArg(value) {
  if (value === undefined) return undefined;
  const text = String(value || '').trim();
  return text && text !== 'none' ? text : null;
}

export const listScheduledTasksTool = {
  name: 'list_scheduled_tasks',
  description: 'List the scheduled tasks: what each one does, its schedule, whether it is on, its next run and its last result.',
  category: 'schedule',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_args, context) => {
    const { userId } = requireContext(context);
    const tasks = listTasks(userId).map(summary);
    return { success: true, count: tasks.length, tasks };
  },
};

export const createScheduledTaskTool = {
  name: 'create_scheduled_task',
  description: [
    'Create a scheduled task: a prompt the agent runs by itself on a schedule, e.g. "every weekday at 8am, summarise my unread email".',
    'Use it when the user wants something done later or repeatedly. Each run happens without the user watching; its answer is posted to the task\'s own chat and shown as a desktop notification, so write the prompt as a complete instruction.',
    `Schedule: ${SCHEDULE_HELP}`,
    'The task uses this chat\'s Project unless project_id says otherwise. Tools that normally ask for approval are refused in unattended runs unless listed in pre_approved_tools.',
  ].join(' '),
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'What the agent should do on each run, written as a complete instruction.' },
      schedule: { type: 'string', description: `When to run. ${SCHEDULE_HELP}` },
      name: { type: 'string', description: 'Short name shown in the list and on notifications. Defaults to the start of the prompt.' },
      timezone: { type: 'string', description: 'IANA time zone such as "Europe/London". Defaults to this computer\'s time zone.' },
      project_id: { type: 'string', description: 'Project whose folders the task may use. Defaults to this chat\'s Project; "none" for no Project.' },
      profile_id: { type: 'string', description: 'Optional agent profile id to run as.' },
      provider_profile_id: { type: 'string', description: 'Optional saved model id. Defaults to the model in use now.' },
      pre_approved_tools: { type: 'array', items: { type: 'string' }, description: 'Tool names the task may use without approval, e.g. ["send_email"]. Only list tools the user agreed to.' },
    },
    required: ['prompt', 'schedule'],
  },
  execute: async (args, context) => {
    const refused = refuseInsideScheduledRun();
    if (refused) return refused;
    const { userId, workspaceId, projectId } = requireContext(context);
    try {
      const requestedProject = projectArg(args.project_id);
      const task = createTask(userId, {
        name: args.name,
        prompt: args.prompt,
        schedule: args.schedule,
        timezone: args.timezone,
        projectId: requestedProject === undefined ? projectId : requestedProject,
        profileId: args.profile_id || null,
        providerProfileId: args.provider_profile_id || null,
        allowedTools: Array.isArray(args.pre_approved_tools) ? args.pre_approved_tools : [],
      }, { workspaceId, createdBy: 'agent' });
      return {
        success: true,
        task: summary(task),
        message: `Scheduled "${task.name}": ${task.scheduleText}. Next run ${formatWhen(task.nextRunAt, task.timezone)}. Results will appear in its chat and as a notification.`,
      };
    } catch (err) {
      return failure(err);
    }
  },
};

export const updateScheduledTaskTool = {
  name: 'update_scheduled_task',
  description: `Change a scheduled task's name, prompt, schedule, time zone, Project, agent, model or pre-approved tools. Schedule: ${SCHEDULE_HELP}`,
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Scheduled task id (from list_scheduled_tasks).' },
      name: { type: 'string', description: 'New name.' },
      prompt: { type: 'string', description: 'New prompt.' },
      schedule: { type: 'string', description: 'New schedule.' },
      timezone: { type: 'string', description: 'New IANA time zone.' },
      project_id: { type: 'string', description: 'New Project id, or "none" for no Project.' },
      profile_id: { type: 'string', description: 'New agent profile id, or empty to use the default agent.' },
      provider_profile_id: { type: 'string', description: 'New saved model id, or empty for the model in use now.' },
      pre_approved_tools: { type: 'array', items: { type: 'string' }, description: 'The full new list of pre-approved tools.' },
    },
    required: ['id'],
  },
  execute: async (args, context) => {
    const refused = refuseInsideScheduledRun();
    if (refused) return refused;
    const { userId } = requireContext(context);
    const patch = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.prompt !== undefined) patch.prompt = args.prompt;
    if (args.schedule !== undefined) patch.schedule = args.schedule;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.project_id !== undefined) patch.projectId = projectArg(args.project_id);
    if (args.profile_id !== undefined) patch.profileId = args.profile_id || null;
    if (args.provider_profile_id !== undefined) patch.providerProfileId = args.provider_profile_id || null;
    if (args.pre_approved_tools !== undefined) patch.allowedTools = args.pre_approved_tools;
    try {
      const task = updateTask(userId, args.id, patch);
      if (!task) return { success: false, error: 'Scheduled task not found.' };
      return { success: true, task: summary(task) };
    } catch (err) {
      return failure(err);
    }
  },
};

export const pauseScheduledTaskTool = {
  name: 'pause_scheduled_task',
  description: 'Pause a scheduled task so it stops running until resumed. A run in progress finishes first.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Scheduled task id.' } },
    required: ['id'],
  },
  execute: async (args, context) => {
    const refused = refuseInsideScheduledRun();
    if (refused) return refused;
    const { userId } = requireContext(context);
    try {
      const task = setTaskEnabled(userId, args.id, false);
      if (!task) return { success: false, error: 'Scheduled task not found.' };
      return { success: true, task: summary(task) };
    } catch (err) {
      return failure(err);
    }
  },
};

export const resumeScheduledTaskTool = {
  name: 'resume_scheduled_task',
  description: 'Turn a paused scheduled task back on. Its next run is worked out from now; runs missed while paused are not made up.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Scheduled task id.' } },
    required: ['id'],
  },
  execute: async (args, context) => {
    const refused = refuseInsideScheduledRun();
    if (refused) return refused;
    const { userId } = requireContext(context);
    try {
      const task = setTaskEnabled(userId, args.id, true);
      if (!task) return { success: false, error: 'Scheduled task not found.' };
      return { success: true, task: summary(task) };
    } catch (err) {
      return failure(err);
    }
  },
};

export const deleteScheduledTaskTool = {
  name: 'delete_scheduled_task',
  description: 'Delete a scheduled task and its run history. Its chat is kept.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Scheduled task id.' } },
    required: ['id'],
  },
  execute: async (args, context) => {
    const refused = refuseInsideScheduledRun();
    if (refused) return refused;
    const { userId } = requireContext(context);
    if (!deleteTask(userId, args.id)) return { success: false, error: 'Scheduled task not found.' };
    return { success: true, deleted: args.id };
  },
};

export const runScheduledTaskNowTool = {
  name: 'run_scheduled_task_now',
  description: 'Start a scheduled task now, outside its schedule. Returns as soon as the run starts; the answer arrives in the task\'s chat. Pass cancel: true to stop a run in progress instead.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Scheduled task id.' },
      cancel: { type: 'boolean', description: 'Stop the run in progress instead of starting one.' },
    },
    required: ['id'],
  },
  execute: async (args, context) => {
    const refused = refuseInsideScheduledRun();
    if (refused) return refused;
    const { userId } = requireContext(context);
    try {
      if (args.cancel) {
        if (!getTask(userId, args.id)) return { success: false, error: 'Scheduled task not found.' };
        return { success: true, cancelled: cancelTask(userId, args.id) };
      }
      const run = runTaskNow(userId, args.id);
      if (!run) return { success: false, error: 'Scheduled task not found.' };
      return { success: true, started: true, run_id: run.id, message: 'Started. The answer will appear in the task\'s chat and as a notification.' };
    } catch (err) {
      return failure(err);
    }
  },
};

export const listScheduledTaskRunsTool = {
  name: 'list_scheduled_task_runs',
  description: 'Recent runs of a scheduled task with their status (running, succeeded, failed, cancelled, skipped) and results.',
  category: 'schedule',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Scheduled task id.' },
      limit: { type: 'number', description: 'How many runs to return. Default 10.' },
    },
    required: ['id'],
  },
  execute: async (args, context) => {
    const { userId } = requireContext(context);
    const runs = listTaskRuns(userId, args.id, Math.max(1, Math.min(50, Number(args.limit || 10))));
    if (!runs) return { success: false, error: 'Scheduled task not found.' };
    return {
      success: true,
      count: runs.length,
      runs: runs.map((run) => ({
        status: run.status,
        trigger: run.trigger,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        result: String(run.error || run.answer || '').slice(0, 1500) || null,
      })),
    };
  },
};

export const schedulerTools = [
  listScheduledTasksTool,
  createScheduledTaskTool,
  updateScheduledTaskTool,
  pauseScheduledTaskTool,
  resumeScheduledTaskTool,
  deleteScheduledTaskTool,
  runScheduledTaskNowTool,
  listScheduledTaskRunsTool,
];

export default schedulerTools;
