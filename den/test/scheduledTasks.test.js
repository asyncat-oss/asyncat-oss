import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const suffix = `${process.pid}-${Date.now()}-${randomUUID()}`;
const tempDb = path.join(os.tmpdir(), `asyncat-scheduled-tasks-${suffix}.db`);
const projectRoot = path.join(os.tmpdir(), `asyncat-scheduled-project-${suffix}`);
fs.mkdirSync(projectRoot, { recursive: true });
process.env.DB_PATH = tempDb;
process.env.ASYNCAT_HOST_TOKEN = 'scheduled-tasks-test';

const { default: db } = await import('../src/db/client.js');

const userId = randomUUID();
const workspaceId = randomUUID();
const projectId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Test')").run(userId, `${suffix}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Mine', ?)").run(workspaceId, userId);
db.prepare("INSERT INTO projects (id, name, created_by, owner_id, team_id) VALUES (?, 'Site', ?, ?, ?)")
  .run(projectId, userId, userId, workspaceId);
db.prepare("INSERT INTO project_folders (id, project_id, name, path, path_key, is_primary) VALUES (?, ?, 'Site', ?, ?, 1)")
  .run(randomUUID(), projectId, projectRoot, projectRoot.toLowerCase());
db.prepare(`
  INSERT INTO ai_provider_config (user_id, provider_type, provider_id, base_url, model, supports_tools)
  VALUES (?, 'custom', 'test', 'http://127.0.0.1:9/v1', 'test-model', 1)
`).run(userId);

// Old schedules and workflows, as the previous version left them.
db.exec(`
  CREATE TABLE scheduled_jobs (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, goal TEXT NOT NULL, schedule TEXT NOT NULL, timezone TEXT,
    user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, profile_id TEXT, provider_profile_id TEXT,
    provider_snapshot TEXT NOT NULL DEFAULT '{}', working_dir TEXT NOT NULL DEFAULT '.',
    enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, next_run_at TEXT NOT NULL,
    run_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE workflows (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, workspace_id TEXT, name TEXT NOT NULL, description TEXT,
    trigger_type TEXT NOT NULL DEFAULT 'manual', schedule TEXT, timezone TEXT, steps TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1, profile_id TEXT, provider_profile_id TEXT,
    provider_snapshot TEXT NOT NULL DEFAULT '{}', working_dir TEXT, last_run_at TEXT,
    run_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
const insertJob = db.prepare(`
  INSERT INTO scheduled_jobs (id, name, goal, schedule, timezone, user_id, workspace_id, working_dir, enabled, next_run_at, run_count)
  VALUES (?, ?, ?, ?, 'UTC', ?, ?, ?, ?, ?, ?)
`);
insertJob.run('job-daily', 'Morning news', 'Read the news', 'daily:07:30', userId, workspaceId, projectRoot, 1, '2026-01-01T07:30:00.000Z', 3);
insertJob.run('job-once-done', 'Old reminder', 'Remind me', 'once:60000', userId, workspaceId, '.', 0, '2026-01-01T07:30:00.000Z', 1);
const insertWorkflow = db.prepare(`
  INSERT INTO workflows (id, user_id, workspace_id, name, trigger_type, schedule, timezone, steps, enabled)
  VALUES (?, ?, ?, ?, ?, ?, 'UTC', ?, ?)
`);
insertWorkflow.run('wf-one', userId, workspaceId, 'Standup notes', 'schedule', '0 8 * * 1-5',
  JSON.stringify([{ prompt: 'Summarise yesterday' }]), 1);
insertWorkflow.run('wf-many', userId, workspaceId, 'Report', 'schedule', '0 9 * * 1',
  JSON.stringify([{ prompt: 'Collect numbers' }, { prompt: 'Write the report', useContext: true }]), 1);
insertWorkflow.run('wf-manual', userId, workspaceId, 'Clean up', 'manual', null, JSON.stringify([{ prompt: 'Tidy the inbox' }]), 1);
insertWorkflow.run('wf-empty', userId, workspaceId, 'Nothing', 'manual', null, '[]', 1);

const scheduler = await import('../src/agent/Scheduler.js');
const bridge = await import('../src/lib/hostBridge.js');
const { chatService } = await import('../src/ai/controllers/ai/chatService.js');
const { schedulerTools } = await import('../src/agent/tools/schedulerTools.js');
const { runInScheduledContext } = await import('../src/agent/scheduledRunContext.js');
const { toolRegistry } = await import('../src/agent/tools/toolRegistry.js');
const { scheduledRunToolNames } = await import('../src/agent/toolScopes.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// The agent is replaced by a script: each prompt decides what its run does.
const calls = [];
const blocked = new Map();
const runTask = async ({ task, abortSignal, conversationHistory }) => {
  calls.push({ prompt: task.prompt, conversationHistory });
  if (task.prompt.startsWith('fail')) throw new Error('Model offline');
  const stopped = () => Object.assign(new Error('Agent run stopped by user.'), { name: 'AbortError' });
  if (abortSignal.aborted) throw stopped();
  if (task.prompt.startsWith('block')) {
    const gate = deferred();
    blocked.set(task.prompt, gate);
    abortSignal.addEventListener('abort', () => gate.reject(stopped()));
    await gate.promise;
  }
  return { answer: `## Done\n\nDone: ${task.prompt}`, sessionId: null };
};

// The run reaches the agent a few awaits after it starts.
async function gateFor(prompt) {
  for (let i = 0; i < 400 && !blocked.has(prompt); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  return blocked.get(prompt);
}

async function hostMessages() {
  return bridge.waitForHostMessages({ waitMs: 0 });
}

scheduler.startScheduler({ runTask, tickMs: 3_600_000, firstTickMs: 3_600_000 });

after(() => {
  scheduler.stopScheduler();
  db.close();
  fs.rmSync(projectRoot, { recursive: true, force: true });
  for (const file of [tempDb, `${tempDb}-wal`, `${tempDb}-shm`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

// Turn every other task off so a test's clock ticks only touch its own tasks.
function isolate(...tasks) {
  const ids = tasks.map((task) => task.id);
  db.prepare(`UPDATE scheduled_tasks SET enabled = 0, next_run_at = NULL WHERE id NOT IN (${ids.map(() => '?').join(', ')})`).run(...ids);
}

const byName = (name) => scheduler.listTasks(userId).find((task) => task.name === name);
const runsOf = (task) => scheduler.listTaskRuns(userId, task.id, 50);

test('old schedules and workflows become scheduled tasks, once', () => {
  const daily = byName('Morning news');
  assert.deepEqual(daily.schedule, { kind: 'daily', time: '07:30' });
  assert.equal(daily.enabled, true);
  assert.equal(daily.projectId, projectId, 'a working folder that belongs to a project keeps that project');
  assert.equal(daily.runCount, 3);

  const done = byName('Old reminder');
  assert.equal(done.enabled, false);
  assert.equal(done.schedule.kind, 'once');

  const standup = byName('Standup notes');
  assert.deepEqual(standup.schedule, { kind: 'weekdays', time: '08:00' });
  assert.equal(standup.enabled, true);
  assert.equal(standup.timezone, 'UTC');
  assert.equal(standup.prompt, 'Summarise yesterday');

  const report = byName('Report');
  assert.equal(report.enabled, false, 'several steps are created paused');
  assert.deepEqual(report.schedule, { kind: 'weekly', time: '09:00', days: [1] });
  assert.match(report.prompt, /1\. Collect numbers\n\n2\. Write the report/);

  const manual = byName('Clean up');
  assert.equal(manual.enabled, false, 'manual workflows become paused tasks');
  assert.equal(byName('Nothing'), undefined, 'a workflow with no steps is left out');

  const before = scheduler.listTasks(userId).length;
  assert.deepEqual(scheduler.migrateLegacyData(), { jobs: 0, workflows: 0 });
  assert.equal(scheduler.listTasks(userId).length, before);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'workflows'").get(), 'old tables stay');
});

test('a task runs when due, answers in its own chat and notifies', async () => {
  await hostMessages();
  const task = scheduler.createTask(userId, {
    name: 'Inbox', prompt: 'Summarise my email', schedule: 'every weekday at 8am', timezone: 'UTC',
  }, { workspaceId, now: new Date('2026-10-12T07:00:00Z') });
  isolate(task);
  assert.equal(task.scheduleText, 'Weekdays at 8:00');
  assert.equal(task.nextRunAt, '2026-10-12T08:00:00.000Z');
  assert.equal(task.model?.model, 'test-model', 'the model in use is saved with the task');
  const stateMessage = (await hostMessages()).find((message) => message.type === 'scheduled.state');
  assert.ok(stateMessage.payload.enabled >= 1, 'the desktop app hears how many tasks are on');

  assert.equal(scheduler.tick(new Date('2026-10-12T07:59:00Z')).length, 0);
  const started = scheduler.tick(new Date('2026-10-12T08:00:10Z'));
  assert.equal(started.length, 1);
  assert.equal(started[0].status, 'running');
  await scheduler.waitForRuns();

  const after1 = scheduler.getTask(userId, task.id);
  assert.equal(after1.nextRunAt, '2026-10-13T08:00:00.000Z');
  assert.equal(after1.lastRun.status, 'succeeded');
  assert.ok(after1.conversationId);
  const conversation = await chatService.getConversation(userId, after1.conversationId);
  assert.equal(conversation.title, 'Inbox');
  assert.equal(conversation.messages.length, 2);
  assert.match(conversation.messages[0].content, /^Scheduled run · .+\n\nSummarise my email$/);
  assert.equal(conversation.messages[1].type, 'assistant');
  assert.match(conversation.messages[1].content, /Done: Summarise my email/);
  assert.equal(conversation.metadata.scheduledTaskId, task.id);

  const notify = (await hostMessages()).find((message) => message.type === 'notify');
  assert.deepEqual(notify.payload, { title: 'Inbox', body: 'Done', route: `/conversations/${after1.conversationId}` });

  // The next run lands in the same chat and sees the last exchange.
  scheduler.tick(new Date('2026-10-13T08:00:05Z'));
  await scheduler.waitForRuns();
  const conversation2 = await chatService.getConversation(userId, after1.conversationId);
  assert.equal(conversation2.messages.length, 4);
  assert.equal(calls.at(-1).conversationHistory.length, 2);
});

test('a failed run says why in the chat and the notification', async () => {
  const task = scheduler.createTask(userId, { name: 'Broken', prompt: 'fail please', schedule: 'daily 10:00', timezone: 'UTC' },
    { workspaceId, now: new Date('2026-10-12T09:00:00Z') });
  isolate(task);
  await hostMessages();
  scheduler.tick(new Date('2026-10-12T10:00:00Z'));
  await scheduler.waitForRuns();
  const [run] = runsOf(task);
  assert.equal(run.status, 'failed');
  assert.equal(run.error, 'Model offline');
  const conversation = await chatService.getConversation(userId, scheduler.getTask(userId, task.id).conversationId);
  assert.match(conversation.messages[1].content, /didn't finish: Model offline/);
  const notify = (await hostMessages()).find((message) => message.type === 'notify');
  assert.equal(notify.payload.body, "Didn't finish: Model offline");
});

test('Run now returns at once, never overlaps, and a run can be cancelled', async () => {
  const task = scheduler.createTask(userId, { name: 'Slow', prompt: 'block slow', schedule: 'daily 11:00', timezone: 'UTC' },
    { workspaceId, now: new Date('2026-10-12T09:00:00Z') });
  isolate(task);
  const run = scheduler.runTaskNow(userId, task.id);
  assert.equal(run.status, 'running');
  assert.equal(scheduler.getTask(userId, task.id).running, true);
  assert.throws(() => scheduler.runTaskNow(userId, task.id), /already running/);

  // Its scheduled time comes while it is still running: that run is skipped.
  scheduler.tick(new Date('2026-10-12T11:00:00Z'));
  const skipped = runsOf(task).find((item) => item.status === 'skipped');
  assert.match(skipped.error, /previous run was still going/);
  assert.equal(scheduler.getTask(userId, task.id).nextRunAt, '2026-10-13T11:00:00.000Z');

  assert.equal(scheduler.cancelTask(userId, task.id), true);
  await scheduler.waitForRuns();
  const cancelled = runsOf(task).find((item) => item.id === run.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(scheduler.getTask(userId, task.id).conversationId, null, 'a cancelled run adds nothing to the chat');
  assert.equal(scheduler.cancelTask(userId, task.id), false);
});

test('at most two tasks run at once; the third waits for a free slot', async () => {
  const now = new Date('2026-10-12T09:00:00Z');
  const tasks = ['block a', 'block b', 'block c'].map((prompt) => scheduler.createTask(userId, {
    name: prompt, prompt, schedule: { kind: 'daily', time: '12:00' }, timezone: 'UTC',
  }, { workspaceId, now }));
  isolate(...tasks);
  const started = scheduler.tick(new Date('2026-10-12T12:00:00Z'));
  assert.equal(started.length, 2);
  assert.throws(() => scheduler.runTaskNow(userId, tasks[2].id), /already running/i);
  assert.equal(scheduler.getTask(userId, tasks[2].id).nextRunAt, '2026-10-12T12:00:00.000Z', 'still due');

  (await gateFor('block a')).resolve();
  for (let i = 0; i < 400 && scheduler.getTask(userId, tasks[0].id).running; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const more = scheduler.tick(new Date('2026-10-12T12:00:30Z'));
  assert.equal(more.length, 1);
  (await gateFor('block b')).resolve();
  (await gateFor('block c')).resolve();
  await scheduler.waitForRuns();
  for (const task of tasks) assert.equal(runsOf(task)[0].status, 'succeeded');
});

test('a run missed while asleep is made up once within 12 hours, skipped after', async () => {
  const late = scheduler.createTask(userId, { name: 'Late', prompt: 'late one', schedule: 'daily 08:00', timezone: 'UTC' },
    { workspaceId, now: new Date('2026-10-14T07:00:00Z') });
  const missed = scheduler.createTask(userId, { name: 'Missed', prompt: 'missed one', schedule: 'daily 08:00', timezone: 'UTC' },
    { workspaceId, now: new Date('2026-10-14T07:00:00Z') });
  isolate(late, missed);

  scheduler.tick(new Date('2026-10-14T14:00:00Z'));
  await scheduler.waitForRuns();
  assert.equal(runsOf(late)[0].trigger, 'catch_up');
  assert.equal(runsOf(late)[0].status, 'succeeded');
  assert.equal(runsOf(missed)[0].status, 'succeeded');

  // Both due 08:00 on the 15th; the computer wakes at 21:00.
  scheduler.tick(new Date('2026-10-15T21:00:00Z'));
  await scheduler.waitForRuns();
  assert.equal(runsOf(late)[0].status, 'skipped');
  assert.equal(scheduler.getTask(userId, late.id).nextRunAt, '2026-10-16T08:00:00.000Z');
});

test('pausing stops runs; resuming starts from now without making up missed runs', () => {
  const task = scheduler.createTask(userId, { name: 'Pausable', prompt: 'pause me', schedule: 'daily 08:00', timezone: 'UTC' },
    { workspaceId, now: new Date('2026-10-12T07:00:00Z') });
  const paused = scheduler.setTaskEnabled(userId, task.id, false);
  assert.equal(paused.state, 'paused');
  assert.equal(paused.nextRunAt, null);
  assert.equal(scheduler.tick(new Date('2026-10-12T08:00:00Z')).filter((run) => run.taskId === task.id).length, 0);

  const resumed = scheduler.setTaskEnabled(userId, task.id, true, { now: new Date('2026-10-15T09:00:00Z') });
  assert.equal(resumed.nextRunAt, '2026-10-16T08:00:00.000Z');
});

test('a one-off runs once and stays done until given a new time', async () => {
  const task = scheduler.createTask(userId, {
    name: 'Once', prompt: 'just once', schedule: 'tomorrow at 7am', timezone: 'UTC',
  }, { workspaceId, now: new Date('2026-10-20T12:00:00Z') });
  isolate(task);
  assert.equal(task.nextRunAt, '2026-10-21T07:00:00.000Z');
  scheduler.tick(new Date('2026-10-21T07:00:00Z'));
  await scheduler.waitForRuns();
  const done = scheduler.getTask(userId, task.id);
  assert.equal(done.state, 'done');
  assert.equal(done.enabled, false);
  assert.throws(() => scheduler.setTaskEnabled(userId, task.id, true, { now: new Date('2026-10-21T08:00:00Z') }), /time has passed/);
  assert.equal(scheduler.updateTask(userId, task.id, { name: 'Once again' }).state, 'done', 'renaming keeps it done');

  const again = scheduler.updateTask(userId, task.id, { schedule: { kind: 'once', date: '2026-10-25', time: '09:00' } },
    { now: new Date('2026-10-21T08:00:00Z') });
  assert.equal(again.enabled, true);
  assert.equal(again.nextRunAt, '2026-10-25T09:00:00.000Z');

  // Run now doesn't use up a one-off's turn.
  scheduler.runTaskNow(userId, task.id);
  await scheduler.waitForRuns();
  assert.equal(scheduler.getTask(userId, task.id).state, 'active');
  assert.equal(scheduler.getTask(userId, task.id).nextRunAt, '2026-10-25T09:00:00.000Z');
});

test('editing keeps the every-N-hours rhythm and checks input', () => {
  const task = scheduler.createTask(userId, { prompt: 'Check the build', schedule: 'every 3 hours', timezone: 'UTC' },
    { workspaceId, now: new Date('2026-10-12T09:00:00Z') });
  assert.equal(task.name, 'Check the build', 'the name defaults to the prompt');
  assert.equal(task.nextRunAt, '2026-10-12T12:00:00.000Z');
  const renamed = scheduler.updateTask(userId, task.id, { name: 'Build', schedule: { kind: 'every_hours', interval: 3 } },
    { now: new Date('2026-10-12T10:00:00Z') });
  assert.equal(renamed.nextRunAt, '2026-10-12T12:00:00.000Z');

  assert.throws(() => scheduler.createTask(userId, { prompt: '', schedule: 'daily 9' }), /what the task should do/);
  assert.throws(() => scheduler.createTask(userId, { prompt: 'x', schedule: 'whenever' }), /isn't a schedule/);
  assert.throws(() => scheduler.createTask(userId, { prompt: 'x', schedule: 'every 5 minutes' }), /15 minutes/);
  assert.throws(() => scheduler.createTask(userId, { prompt: 'x', schedule: 'daily 9', projectId: 'nope' }), /project was not found/);
  assert.throws(() => scheduler.createTask(userId, { prompt: 'x', schedule: 'daily 9', allowedTools: ['rm -rf'] }), /isn't a tool name/);
  assert.equal(scheduler.getTask(randomUUID(), task.id), null, 'other users cannot see it');
});

test('runs left running by a crash are marked failed at the next start', () => {
  const task = byName('Clean up');
  db.prepare("INSERT INTO scheduled_task_runs (id, task_id, status, started_at) VALUES (?, ?, 'running', ?)")
    .run('crashed-run', task.id, new Date().toISOString());
  assert.equal(scheduler.recoverInterruptedRuns(), 1);
  const run = runsOf(task).find((item) => item.id === 'crashed-run');
  assert.equal(run.status, 'failed');
  assert.match(run.error, /stopped before this run finished/);
});

test('a scheduled run cannot create, change or start scheduled tasks', async () => {
  const create = schedulerTools.find((tool) => tool.name === 'create_scheduled_task');
  const list = schedulerTools.find((tool) => tool.name === 'list_scheduled_tasks');
  const args = { prompt: 'Spawn more tasks', schedule: 'every hour' };
  const inside = await runInScheduledContext({ taskId: 'x' }, () => create.execute(args, { userId, workspaceId }));
  assert.equal(inside.success, false);
  assert.match(inside.error, /can't create/);
  const listed = await runInScheduledContext({ taskId: 'x' }, () => list.execute({}, { userId }));
  assert.equal(listed.success, true, 'looking is allowed');

  const outside = await create.execute(args, { userId, workspaceId, projectId });
  assert.equal(outside.success, true);
  assert.equal(outside.task.schedule, 'Every hour');
  assert.equal(outside.task.project, 'Site', "the chat's project is used by default");

  toolRegistry.registerAll(schedulerTools);
  toolRegistry.register({ name: 'read_file', category: 'file', execute: async () => ({}) });
  toolRegistry.register({ name: 'web_search', category: 'search', execute: async () => ({}) });
  const withProject = scheduledRunToolNames({ hasProject: true });
  const withoutProject = scheduledRunToolNames({ hasProject: false });
  assert.ok(withProject.includes('read_file'));
  assert.ok(!withoutProject.includes('read_file'), 'no project, no file tools');
  assert.ok(withoutProject.includes('web_search'));
  for (const names of [withProject, withoutProject]) {
    assert.ok(!names.some((name) => name.includes('scheduled_task')), 'scheduling tools are left out');
  }
});

test('deleting a task stops it and keeps its chat', async () => {
  const task = byName('Inbox');
  assert.equal(scheduler.deleteTask(userId, task.id), true);
  assert.equal(scheduler.getTask(userId, task.id), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM scheduled_task_runs WHERE task_id = ?').get(task.id).n, 0);
  const conversation = await chatService.getConversation(userId, task.conversationId);
  assert.equal(conversation.messages.length, 4);
});
