// catTools.js — the agent's controls for Cats
//
// A Cat is an agent that works on its own: it has a mission, wakes on a
// schedule or when something happens (new email, an RSS post, a page or
// folder that changes, a message in its chat), and reports to its chat and
// the user's inbox. A Cat with just a timer is what a scheduled task was.

import { PermissionLevel } from './toolRegistry.js';
import {
  cancelCat, createCat, deleteCat, getCat, listCatRuns, listCats, setCatEnabled, updateCat, wakeCatNow,
} from '../../cats/catEngine.js';
import { currentScheduledRun } from '../scheduledRunContext.js';

const SCHEDULE_HELP = 'Plain English such as "every weekday at 8am", "every Monday at 9", "mondays and thursdays at 9:30", "daily 18:00", "every 3 hours", "tomorrow at 7am", "in 2 hours", or a 5-field cron expression such as "0 9 * * 1-5". A timer repeats at most every 15 minutes.';
const FREEDOM_HELP = '"ask_first" (every step that changes something waits for the user\'s OK), "ask_risky" (the default: risky steps such as deleting, sending or running commands wait for an OK) or "alone" (works without asking, except payments, passwords and sensitive steps).';

function requireContext(context) {
  if (!context?.userId) throw new Error('Missing user context.');
  return { userId: context.userId, workspaceId: context.workspaceId || null, projectId: context.projectId || null };
}

/** Cats (and their helpers) may look at Cats but never create, change or wake them. */
function refuseInsideCatRun() {
  if (!currentScheduledRun()) return null;
  return { success: false, error: "A Cat's run can't create, change, pause or wake Cats. Ask the user to do it in a chat." };
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

function summary(cat) {
  if (!cat) return null;
  return {
    id: cat.id,
    name: cat.name,
    mission: cat.mission,
    state: cat.state,
    wakes_on: cat.triggers.filter((trigger) => trigger.kind !== 'chat').map((trigger) => trigger.text),
    next_wake: formatWhen(cat.nextWakeAt, cat.timezone),
    next_wake_at: cat.nextWakeAt,
    freedom: cat.freedom,
    last_run: cat.lastRun ? {
      status: cat.lastRun.status,
      started_at: cat.lastRun.startedAt,
      result: String(cat.lastRun.error || cat.lastRun.answer || '').slice(0, 400) || null,
    } : null,
    brain: cat.profileName || null,
    project: cat.projectName || null,
    always_allowed_tools: cat.allowedTools,
    waiting_for_user: cat.waiting,
    chat: cat.conversationId ? `/conversations/${cat.conversationId}` : null,
    page: `/cats/${cat.id}`,
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

/** Wake-ups from the tool's arguments: a schedule and/or watchers. */
function triggersFrom(args, existing = null) {
  const triggers = [];
  if (args.schedule) triggers.push({ kind: 'schedule', config: { schedule: String(args.schedule) } });
  for (const url of Array.isArray(args.watch_rss) ? args.watch_rss : []) triggers.push({ kind: 'rss', config: { url } });
  for (const url of Array.isArray(args.watch_pages) ? args.watch_pages : []) triggers.push({ kind: 'webpage', config: { url } });
  for (const folder of Array.isArray(args.watch_folders) ? args.watch_folders : []) triggers.push({ kind: 'folder', config: { path: folder } });
  if (args.watch_email) triggers.push({ kind: 'email', config: { from: args.watch_email.from || null, subject: args.watch_email.subject || null } });
  if (!existing) return triggers;
  // Changing one kind keeps the others.
  const replaced = new Set(triggers.map((trigger) => trigger.kind));
  const kept = existing.filter((trigger) => !replaced.has(trigger.kind)).map((trigger) => ({ id: trigger.id, kind: trigger.kind, config: trigger.config, enabled: trigger.enabled }));
  return [...kept, ...triggers];
}

const WAKE_PROPERTIES = {
  schedule: { type: 'string', description: `A timer. ${SCHEDULE_HELP}` },
  watch_email: {
    type: 'object',
    description: 'Wake on new email in the inbox set up in Settings → Connections, optionally only from someone or about something.',
    properties: { from: { type: 'string' }, subject: { type: 'string' } },
  },
  watch_rss: { type: 'array', items: { type: 'string' }, description: 'RSS or Atom feed addresses to watch for new posts.' },
  watch_pages: { type: 'array', items: { type: 'string' }, description: 'Web page addresses to watch for changes.' },
  watch_folders: { type: 'array', items: { type: 'string' }, description: 'Absolute folder paths to watch for added, changed or removed files.' },
};

export const listCatsTool = {
  name: 'list_cats',
  description: 'List the user\'s Cats (agents that work on their own): their missions, what wakes them, whether they are on, their next wake and last result.',
  category: 'schedule',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async (_args, context) => {
    const { userId } = requireContext(context);
    const cats = listCats(userId).map(summary);
    return { success: true, count: cats.length, cats };
  },
};

export const createCatTool = {
  name: 'create_cat',
  description: [
    'Create a Cat: an agent that works on its own for the user, e.g. "every weekday at 8am, summarise my unread email" or "tell me when this page changes".',
    'Use it when the user wants something done later, repeatedly, or whenever something happens. Each run happens without the user watching; its report goes to the Cat\'s chat, the user\'s inbox and a desktop notification, so write the mission as complete instructions.',
    'Give at least one wake-up: a schedule, or watchers (email, RSS, pages, folders). The user can always also write to it in its chat.',
    `Freedom: ${FREEDOM_HELP}`,
  ].join(' '),
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      mission: { type: 'string', description: 'What the Cat looks after, as complete instructions in plain words.' },
      name: { type: 'string', description: 'Short name, e.g. "Inbox Cat". Defaults to the start of the mission.' },
      avatar: { type: 'string', description: 'An emoji for its picture.' },
      ...WAKE_PROPERTIES,
      timezone: { type: 'string', description: 'IANA time zone such as "Europe/London". Defaults to this computer\'s.' },
      project_id: { type: 'string', description: 'A project it shares with the user. Defaults to this chat\'s project; "none" for none.' },
      profile_id: { type: 'string', description: 'The agent to use as its brain (its instructions, files and model).' },
      provider_profile_id: { type: 'string', description: 'A saved model to use instead of the brain\'s. Without either, the Cat follows the default model as it changes.' },
      freedom: { type: 'string', enum: ['ask_first', 'ask_risky', 'alone'], description: FREEDOM_HELP },
      allowed_sites: { type: 'array', items: { type: 'string' }, description: 'If given, the only sites it may visit, e.g. ["example.com"].' },
      pre_approved_tools: { type: 'array', items: { type: 'string' }, description: 'Tools it may use without asking, e.g. ["mail_send_message"]. Only list tools the user agreed to.' },
    },
    required: ['mission'],
  },
  execute: async (args, context) => {
    const refused = refuseInsideCatRun();
    if (refused) return refused;
    const { userId, workspaceId, projectId } = requireContext(context);
    try {
      const requestedProject = projectArg(args.project_id);
      const triggers = triggersFrom(args);
      if (!triggers.length) return { success: false, error: 'Say what wakes the Cat: a schedule, or something to watch (email, an RSS feed, a page or a folder).' };
      const cat = await createCat(userId, {
        name: args.name,
        avatar: args.avatar,
        mission: args.mission,
        timezone: args.timezone,
        projectId: requestedProject === undefined ? projectId : requestedProject,
        folderMode: 'own',
        profileId: args.profile_id || null,
        providerProfileId: args.provider_profile_id || null,
        freedom: args.freedom || 'ask_risky',
        allowedSites: Array.isArray(args.allowed_sites) ? args.allowed_sites : [],
        allowedTools: Array.isArray(args.pre_approved_tools) ? args.pre_approved_tools : [],
        triggers,
      }, { workspaceId, createdBy: 'agent' });
      const next = cat.nextWakeAt ? ` Next run ${formatWhen(cat.nextWakeAt, cat.timezone)}.` : '';
      return {
        success: true,
        cat: summary(cat),
        message: `Made the Cat "${cat.name}": it wakes on ${summary(cat).wakes_on.join(', ')}.${next} Its reports go to its chat and the inbox on the Cats page.`,
      };
    } catch (err) {
      return failure(err);
    }
  },
};

export const updateCatTool = {
  name: 'update_cat',
  description: `Change a Cat: its name, mission, wake-ups (a new schedule replaces its timer; watchers given replace that kind), time zone, project, brain, model, freedom, sites or pre-approved tools. ${SCHEDULE_HELP}`,
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Cat id (from list_cats).' },
      name: { type: 'string' },
      mission: { type: 'string' },
      ...WAKE_PROPERTIES,
      timezone: { type: 'string' },
      project_id: { type: 'string', description: 'New project id, or "none".' },
      profile_id: { type: 'string', description: 'New brain agent id, or empty for none.' },
      provider_profile_id: { type: 'string', description: 'New saved model id, or empty for the brain\'s.' },
      freedom: { type: 'string', enum: ['ask_first', 'ask_risky', 'alone'] },
      allowed_sites: { type: 'array', items: { type: 'string' } },
      pre_approved_tools: { type: 'array', items: { type: 'string' }, description: 'The full new list.' },
    },
    required: ['id'],
  },
  execute: async (args, context) => {
    const refused = refuseInsideCatRun();
    if (refused) return refused;
    const { userId } = requireContext(context);
    const current = getCat(userId, args.id);
    if (!current) return { success: false, error: 'Cat not found.' };
    const patch = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.mission !== undefined) patch.mission = args.mission;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    if (args.project_id !== undefined) patch.projectId = projectArg(args.project_id);
    if (args.profile_id !== undefined) patch.profileId = args.profile_id || null;
    if (args.provider_profile_id !== undefined) patch.providerProfileId = args.provider_profile_id || null;
    if (args.freedom !== undefined) patch.freedom = args.freedom;
    if (args.allowed_sites !== undefined) patch.allowedSites = args.allowed_sites;
    if (args.pre_approved_tools !== undefined) patch.allowedTools = args.pre_approved_tools;
    if (args.schedule || args.watch_email || args.watch_rss || args.watch_pages || args.watch_folders) {
      patch.triggers = triggersFrom(args, current.triggers);
    }
    try {
      return { success: true, cat: summary(updateCat(userId, args.id, patch)) };
    } catch (err) {
      return failure(err);
    }
  },
};

function toggleTool(name, enabled, description) {
  return {
    name,
    description,
    category: 'schedule',
    permission: PermissionLevel.MODERATE,
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'Cat id.' } }, required: ['id'] },
    execute: async (args, context) => {
      const refused = refuseInsideCatRun();
      if (refused) return refused;
      const { userId } = requireContext(context);
      try {
        const cat = setCatEnabled(userId, args.id, enabled);
        if (!cat) return { success: false, error: 'Cat not found.' };
        return { success: true, cat: summary(cat) };
      } catch (err) {
        return failure(err);
      }
    },
  };
}

export const pauseCatTool = toggleTool('pause_cat', false, 'Pause a Cat: nothing wakes it until it is resumed. A run in progress finishes first.');
export const resumeCatTool = toggleTool('resume_cat', true, 'Turn a paused Cat back on. Its timers count from now; nothing missed while paused is made up.');

export const deleteCatTool = {
  name: 'delete_cat',
  description: 'Delete a Cat, its run history and its browser sign-ins. Its chat is kept.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: { type: 'object', properties: { id: { type: 'string', description: 'Cat id.' } }, required: ['id'] },
  execute: async (args, context) => {
    const refused = refuseInsideCatRun();
    if (refused) return refused;
    const { userId } = requireContext(context);
    if (!deleteCat(userId, args.id)) return { success: false, error: 'Cat not found.' };
    return { success: true, deleted: args.id };
  },
};

export const wakeCatTool = {
  name: 'wake_cat',
  description: 'Wake a Cat now, outside its schedule. Returns as soon as it starts; its report arrives in its chat and the inbox. Pass cancel: true to stop a run in progress instead.',
  category: 'schedule',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Cat id.' },
      cancel: { type: 'boolean', description: 'Stop the run in progress instead.' },
    },
    required: ['id'],
  },
  execute: async (args, context) => {
    const refused = refuseInsideCatRun();
    if (refused) return refused;
    const { userId } = requireContext(context);
    try {
      if (args.cancel) {
        if (!getCat(userId, args.id)) return { success: false, error: 'Cat not found.' };
        return { success: true, cancelled: cancelCat(userId, args.id) };
      }
      const result = await wakeCatNow(userId, args.id);
      if (!result) return { success: false, error: 'Cat not found.' };
      return result.run
        ? { success: true, started: true, run_id: result.run.id, message: 'Started. Its report will appear in its chat and the inbox.' }
        : { success: true, started: false, queued: true, message: 'It is busy; it will run as soon as it is free.' };
    } catch (err) {
      return failure(err);
    }
  },
};

export const listCatRunsTool = {
  name: 'list_cat_runs',
  description: 'Recent runs of a Cat: what woke it, status (running, waiting for the user, succeeded, failed, cancelled, skipped) and results.',
  category: 'schedule',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Cat id.' },
      limit: { type: 'number', description: 'How many runs to return. Default 10.' },
    },
    required: ['id'],
  },
  execute: async (args, context) => {
    const { userId } = requireContext(context);
    const runs = listCatRuns(userId, args.id, Math.max(1, Math.min(50, Number(args.limit || 10))));
    if (!runs) return { success: false, error: 'Cat not found.' };
    return {
      success: true,
      count: runs.length,
      runs: runs.map((run) => ({
        status: run.status,
        woke_because: run.reason,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        result: String(run.error || run.answer || '').slice(0, 1500) || null,
        feedback: run.feedback,
      })),
    };
  },
};

export const catTools = [
  listCatsTool,
  createCatTool,
  updateCatTool,
  pauseCatTool,
  resumeCatTool,
  deleteCatTool,
  wakeCatTool,
  listCatRunsTool,
];

export default catTools;
