// den/src/cats/catMigration.js
// ─── Scheduled tasks → Cats ──────────────────────────────────────────────────
// Before Cats, a scheduled task ran a prompt on a timer. Each one becomes a
// Cat with a timer: the same name, schedule and time zone (and next run),
// prompt (now its mission), project, agent (its brain), model, pre-approved
// tools and on/off state. It keeps its chat and its recent runs.
//
// Runs once per task: `migrated_from` records where a Cat came from, so
// running it again changes nothing. The old rows are left as they were.

import db from '../db/client.js';
import { insertCat, parseJson } from './catStore.js';

const MIGRATED_PREFIX = 'scheduled_task:';
const RUNS_KEPT = 50;

function tableExists(database, name) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function existing(database, table, id, userId, ownerColumn) {
  if (!id) return null;
  try {
    return database.prepare(`SELECT id FROM ${table} WHERE id = ? AND ${ownerColumn} = ?`).get(id, userId)?.id || null;
  } catch {
    return null;
  }
}

const RUN_STATUS = { running: 'failed', succeeded: 'succeeded', failed: 'failed', cancelled: 'cancelled', skipped: 'skipped' };

/** Move every scheduled task that isn't a Cat yet. Returns { cats }. */
export function migrateScheduledTasksToCats(database = db, { now = new Date() } = {}) {
  if (!tableExists(database, 'scheduled_tasks')) return { cats: 0 };
  const tasks = database.prepare(`
    SELECT * FROM scheduled_tasks
    WHERE ('${MIGRATED_PREFIX}' || id) NOT IN (SELECT migrated_from FROM cats WHERE migrated_from IS NOT NULL)
    ORDER BY created_at ASC
  `).all();
  let moved = 0;
  for (const task of tasks) {
    const migrate = database.transaction(() => {
      const projectId = existing(database, 'projects', task.project_id, task.user_id, 'owner_id');
      const profileId = existing(database, 'agent_profiles', task.profile_id, task.user_id, 'user_id');
      const providerProfileId = existing(database, 'ai_provider_profiles', task.provider_profile_id, task.user_id, 'user_id');
      const schedule = parseJson(task.schedule, {});
      const enabled = Boolean(task.enabled);
      const catId = insertCat(task.user_id, {
        name: task.name,
        avatar: '',
        mission: task.prompt,
        profileId,
        providerProfileId,
        providerSnapshot: parseJson(task.provider_snapshot, {}),
        projectId,
        folderMode: projectId ? 'project' : 'own',
        freedom: 'ask_risky',
        allowedTools: parseJson(task.allowed_tools, []),
        timezone: task.timezone || null,
        enabled,
        conversationId: task.conversation_id || null,
        lastRunAt: task.last_run_at || null,
        runCount: task.run_count || 0,
        createdAt: task.created_at,
        triggers: [{
          kind: 'schedule',
          trusted: true,
          config: { schedule },
          enabled: enabled || schedule.kind !== 'once',
          nextAt: enabled ? task.next_run_at || null : null,
        }],
      }, {
        workspaceId: task.workspace_id || null,
        createdBy: task.created_by || 'user',
        migratedFrom: `${MIGRATED_PREFIX}${task.id}`,
        keepTimes: true,
        now,
      });

      // Its chat is now the Cat's: messages written there go to the Cat.
      if (task.conversation_id) {
        database.prepare(`
          UPDATE conversations SET metadata = json_set(CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END, '$.catId', ?)
          WHERE id = ?
        `).run(catId, task.conversation_id);
      }

      if (tableExists(database, 'scheduled_task_runs')) {
        const runs = database.prepare(`
          SELECT * FROM scheduled_task_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT ?
        `).all(task.id, RUNS_KEPT);
        const insertRun = database.prepare(`
          INSERT OR IGNORE INTO cat_runs (
            id, cat_id, trigger_id, trigger_kind, reason, status, scheduled_for, started_at, finished_at,
            answer, error, agent_session_id, conversation_id
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const run of runs) {
          insertRun.run(
            `${catId.slice(0, 8)}-${run.id}`,
            catId,
            run.trigger === 'manual' ? 'manual' : 'schedule',
            run.trigger === 'manual' ? 'Run now' : run.trigger === 'catch_up' ? 'Made up after a missed time' : 'Scheduled run',
            RUN_STATUS[run.status] || 'failed',
            run.scheduled_for || null,
            run.started_at,
            run.finished_at || run.started_at,
            run.answer || null,
            run.status === 'running' ? (run.error || 'Asyncat stopped before this run finished.') : run.error || null,
            run.agent_session_id || null,
            run.conversation_id || null,
          );
        }
      }
      return catId;
    });
    try {
      migrate();
      moved += 1;
    } catch (err) {
      console.warn(`[cats] Couldn't move the scheduled task "${task.name}" to a Cat:`, err.message);
    }
  }
  return { cats: moved };
}
