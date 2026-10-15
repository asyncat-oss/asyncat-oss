import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const suffix = `${process.pid}-${Date.now()}-${randomUUID()}`;
const tempDb = path.join(os.tmpdir(), `asyncat-cats-${suffix}.db`);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-cats-'));
const projectRoot = path.join(scratch, 'project');
fs.mkdirSync(projectRoot, { recursive: true });
process.env.DB_PATH = tempDb;
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
process.env.ASYNCAT_HOST_TOKEN = 'cats-test';

const { default: db } = await import('../src/db/client.js');

const userId = randomUUID();
const workspaceId = randomUUID();
const projectId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Test')").run(userId, `${suffix}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Mine', ?)").run(workspaceId, userId);
db.prepare("INSERT INTO projects (id, name, created_by, owner_id, team_id) VALUES (?, 'Garden', ?, ?, ?)")
  .run(projectId, userId, userId, workspaceId);
db.prepare("INSERT INTO project_folders (id, project_id, name, path, path_key, is_primary) VALUES (?, ?, 'Garden', ?, ?, 1)")
  .run(randomUUID(), projectId, projectRoot, projectRoot.toLowerCase());
db.prepare(`
  INSERT INTO ai_provider_config (user_id, provider_type, provider_id, base_url, model, supports_tools)
  VALUES (?, 'custom', 'test', 'http://127.0.0.1:9/v1', 'test-model', 1)
`).run(userId);

// What an install from before Cats left: an old schedule, and a scheduled
// task with a chat and a run.
db.exec(`
  CREATE TABLE scheduled_jobs (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, goal TEXT NOT NULL, schedule TEXT NOT NULL, timezone TEXT,
    user_id TEXT NOT NULL, workspace_id TEXT NOT NULL, profile_id TEXT, provider_profile_id TEXT,
    provider_snapshot TEXT NOT NULL DEFAULT '{}', working_dir TEXT NOT NULL DEFAULT '.',
    enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, next_run_at TEXT NOT NULL,
    run_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
db.prepare(`
  INSERT INTO scheduled_jobs (id, name, goal, schedule, timezone, user_id, workspace_id, working_dir, enabled, next_run_at, run_count)
  VALUES ('job-daily', 'Morning news', 'Read the news', 'daily:07:30', 'UTC', ?, ?, ?, 1, '2026-01-01T07:30:00.000Z', 3)
`).run(userId, workspaceId, projectRoot);

const legacy = await import('../src/agent/Scheduler.js');
const { chatService } = await import('../src/ai/controllers/ai/chatService.js');
const taskChat = await chatService.saveConversation(userId, [
  { id: 'old-u', type: 'user', content: 'Scheduled run · Mon\n\nWater the plants', timestamp: '2026-10-01T08:00:00.000Z' },
  { id: 'old-a', type: 'assistant', content: 'Watered.', timestamp: '2026-10-01T08:00:05.000Z' },
], { workspaceId, title: 'Plants', metadata: { scheduledTaskId: 'task-plants' } });
db.prepare(`
  INSERT INTO scheduled_tasks (id, user_id, workspace_id, name, prompt, schedule, timezone, enabled, project_id,
    provider_snapshot, allowed_tools, conversation_id, next_run_at, run_count)
  VALUES ('task-plants', ?, ?, 'Plants', 'Water the plants', ?, 'UTC', 1, ?, ?, ?, ?, '2026-10-20T08:00:00.000Z', 1)
`).run(userId, workspaceId, JSON.stringify({ kind: 'daily', time: '08:00' }), projectId,
  JSON.stringify({ provider_id: 'test', base_url: 'http://127.0.0.1:9/v1', model: 'test-model' }),
  JSON.stringify(['mail_send_message']), taskChat.conversationId);
db.prepare(`
  INSERT INTO scheduled_task_runs (id, task_id, status, trigger, started_at, finished_at, answer)
  VALUES ('run-1', 'task-plants', 'succeeded', 'schedule', '2026-10-01T08:00:00.000Z', '2026-10-01T08:00:05.000Z', 'Watered.')
`).run();

const engine = await import('../src/cats/catEngine.js');
const store = await import('../src/cats/catStore.js');
const inbox = await import('../src/cats/catInbox.js');
const { migrateScheduledTasksToCats } = await import('../src/cats/catMigration.js');
const bridge = await import('../src/lib/hostBridge.js');
const { catTools } = await import('../src/agent/tools/catTools.js');
const { runInScheduledContext } = await import('../src/agent/scheduledRunContext.js');
const { checkAgentUrl } = await import('../src/agent/tools/urlPolicy.js');
const { memoryScope } = await import('../src/agent/tools/memoryTools.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// The agent is replaced by a script: each mission decides what a run does.
const calls = [];
const blocked = new Map();
const runCat = async ({ cat, wake, abortSignal, conversationHistory, onEvent, requestPermission, askUser }) => {
  calls.push({ cat: cat.name, wake, conversationHistory });
  const mission = cat.mission;
  const stopped = () => Object.assign(new Error('Agent run stopped by user.'), { name: 'AbortError' });
  if (abortSignal.aborted) throw stopped();
  if (mission.startsWith('fail')) throw new Error('Model offline');
  if (mission.startsWith('block')) {
    const gate = deferred();
    blocked.set(cat.name, gate);
    abortSignal.addEventListener('abort', () => gate.reject(stopped()));
    await gate.promise;
  }
  if (mission.startsWith('risky')) {
    onEvent({ type: 'tool_start', data: { tool: 'run_command', toolCallId: 'c1', args: { command: 'rm notes.txt' } } });
    const decision = await requestPermission({ tool: 'run_command', permission: 'dangerous', description: 'Run rm notes.txt', args: { command: 'rm notes.txt' } });
    onEvent({ type: 'tool_result', data: { tool: 'run_command', toolCallId: 'c1', result: { success: decision.decision !== 'deny' } } });
    return { answer: `Decision: ${decision.decision}${decision.reason ? ` (${decision.reason})` : ''}`, sessionId: null, usage: { inputTokens: 10, outputTokens: 5 } };
  }
  if (mission.startsWith('ask')) {
    const reply = await askUser({ question: 'Which bed?', choices: ['one', 'two'] });
    return { answer: `They said: ${reply.answer}`, sessionId: null };
  }
  if (mission.startsWith('tokens')) {
    onEvent({ type: 'usage_update', data: { inputTokens: 900, outputTokens: 200 } });
    await new Promise((resolve, reject) => {
      abortSignal.addEventListener('abort', () => reject(stopped()));
      setTimeout(resolve, 2000);
    });
  }
  if (wake.kind === 'chat') return { answer: `You said: ${wake.message}`, sessionId: null };
  onEvent({ type: 'tool_start', data: { tool: 'fetch_url', toolCallId: 'f1', args: { url: 'https://news.example.com/garden' } } });
  onEvent({ type: 'tool_result', data: { tool: 'fetch_url', toolCallId: 'f1', result: { success: true } } });
  return { answer: `## Done\n\nDone: ${mission}`, sessionId: null, usage: { inputTokens: 20, outputTokens: 5 } };
};

async function gateFor(name) {
  for (let i = 0; i < 400 && !blocked.has(name); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  return blocked.get(name);
}

async function until(fn, what) {
  for (let i = 0; i < 400; i += 1) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function hostMessages() {
  return bridge.waitForHostMessages({ waitMs: 0 });
}

// Watchers see fake mail, feeds, pages and folders.
const fake = { mail: [], feed: { feed: { title: 'Garden blog' }, items: [] }, page: '<p>Price: 10</p>', files: {} };
const deps = {
  listMail: async () => fake.mail,
  fetchFeed: async () => fake.feed,
  fetchPage: async () => fake.page,
  snapshotFolder: async () => ({ ...fake.files }),
};

engine.startCatEngine({
  runCat,
  deps,
  tickMs: 3_600_000,
  firstTickMs: 3_600_000,
  migrate: () => { legacy.migrateLegacyData(); migrateScheduledTasksToCats(); },
});

after(() => {
  engine.stopCatEngine();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
  for (const file of [tempDb, `${tempDb}-wal`, `${tempDb}-shm`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

// Turn every other Cat off so a test's clock ticks only touch its own.
function isolate(...cats) {
  const ids = cats.map((cat) => cat.id);
  db.prepare(`UPDATE cats SET enabled = 0 WHERE id NOT IN (${ids.map(() => '?').join(', ')})`).run(...ids);
}

const byName = (name) => engine.listCats(userId).find((cat) => cat.name === name);
const runsOf = (cat) => engine.listCatRuns(userId, cat.id, 50);
const schedule = (text, extra = {}) => ({ kind: 'schedule', config: { schedule: text }, ...extra });

test('old schedules and scheduled tasks become Cats with timers, once', async () => {
  const plants = byName('Plants');
  assert.ok(plants, 'the scheduled task became a Cat');
  assert.equal(plants.mission, 'Water the plants');
  assert.equal(plants.enabled, true);
  assert.equal(plants.projectId, projectId);
  assert.equal(plants.folderMode, 'project');
  assert.equal(plants.folder, projectRoot, 'it works in its project folder');
  assert.deepEqual(plants.allowedTools, ['mail_send_message']);
  assert.equal(plants.model?.model, 'test-model');
  const timer = plants.triggers.find((trigger) => trigger.kind === 'schedule');
  assert.deepEqual(timer.config.schedule, { kind: 'daily', time: '08:00' });
  assert.equal(timer.nextAt, '2026-10-20T08:00:00.000Z', 'the next run is kept');
  assert.ok(plants.triggers.some((trigger) => trigger.kind === 'chat'), 'every Cat can be written to');
  assert.equal(plants.conversationId, taskChat.conversationId, 'it keeps its chat');
  const conversation = await chatService.getConversation(userId, plants.conversationId);
  assert.equal(conversation.metadata.catId, plants.id);
  assert.equal(runsOf(plants)[0].answer, 'Watered.', 'and its run history');

  const news = byName('Morning news');
  assert.ok(news, 'an older schedule went through scheduled tasks to a Cat');
  assert.equal(news.triggers.find((trigger) => trigger.kind === 'schedule').text, 'Daily at 7:30');

  const count = engine.listCats(userId).length;
  assert.deepEqual(migrateScheduledTasksToCats(), { cats: 0 });
  assert.equal(engine.listCats(userId).length, count, 'running it again changes nothing');
  assert.ok(db.prepare("SELECT 1 FROM scheduled_tasks WHERE id = 'task-plants'").get(), 'the old row stays');
});

test('a Cat wakes on time, reports in its chat and inbox, and notifies', async () => {
  await hostMessages();
  const cat = await engine.createCat(userId, {
    name: 'Inbox Cat', mission: 'Summarise my email', timezone: 'UTC', triggers: [schedule('every weekday at 8am')],
  }, { workspaceId, now: new Date('2026-10-12T07:00:00Z') });
  isolate(cat);
  assert.equal(cat.nextWakeAt, '2026-10-12T08:00:00.000Z');
  assert.equal(cat.folderMode, 'own');
  assert.ok(cat.folder.startsWith(process.env.ASYNCAT_DATA_PATH), 'its own folder is in the data folder');
  assert.match(cat.browserPartition, /^persist:asyncat-cat-/);
  assert.ok(cat.conversationId, 'its chat is ready from the start');
  const stateMessage = (await hostMessages()).find((message) => message.type === 'scheduled.state');
  assert.ok(stateMessage.payload.enabled >= 1, 'the desktop app hears how many Cats are on');

  assert.equal(engine.tick(new Date('2026-10-12T07:59:00Z')).length, 0);
  const started = engine.tick(new Date('2026-10-12T08:00:10Z'));
  assert.equal(started.length, 1);
  await engine.waitForRuns();

  const after1 = engine.getCat(userId, cat.id);
  assert.equal(after1.nextWakeAt, '2026-10-13T08:00:00.000Z');
  assert.equal(after1.lastRun.status, 'succeeded');
  assert.equal(after1.lastRun.reason, 'Weekdays at 8:00');
  assert.equal(after1.lastRun.inputTokens, 20);
  const conversation = await chatService.getConversation(userId, after1.conversationId);
  assert.equal(conversation.messages.length, 3, 'hello, what woke it, its report');
  assert.match(conversation.messages[1].content, /^Scheduled run · .+\n\nWeekdays at 8:00$/);
  assert.match(conversation.messages[2].content, /Done: Summarise my email/);

  const [result] = inbox.listInbox(userId, { catId: cat.id });
  assert.equal(result.kind, 'result');
  assert.equal(result.title, 'Done');
  assert.equal(after1.unread, 1);
  const notify = (await hostMessages()).find((message) => message.type === 'notify');
  assert.equal(notify.payload.title, 'Inbox Cat');
  assert.match(notify.payload.body, /^Done/);

  const timeline = inbox.listTimeline(cat.id).map((event) => `${event.kind}: ${event.title}`);
  assert.ok(timeline.includes('page: Opened news.example.com/garden'), 'pages it visited are on the timeline');
  assert.ok(timeline.includes('finished: Done'));

  engine.tick(new Date('2026-10-13T08:00:05Z'));
  await engine.waitForRuns();
  assert.equal(calls.at(-1).conversationHistory.length, 3, 'the next run sees the chat so far');
});

test('a failed run says why in the chat and the inbox', async () => {
  const cat = await engine.createCat(userId, { name: 'Broken', mission: 'fail please', timezone: 'UTC', triggers: [schedule('daily 10:00')] },
    { workspaceId, now: new Date('2026-10-12T09:00:00Z') });
  isolate(cat);
  engine.tick(new Date('2026-10-12T10:00:00Z'));
  await engine.waitForRuns();
  const [run] = runsOf(cat);
  assert.equal(run.status, 'failed');
  assert.equal(run.error, 'Model offline');
  const conversation = await chatService.getConversation(userId, engine.getCat(userId, cat.id).conversationId);
  assert.match(conversation.messages.at(-1).content, /didn't finish: Model offline/);
  assert.equal(inbox.listInbox(userId, { catId: cat.id })[0].title, "Didn't finish: Model offline");
});

test('a Cat never runs twice at once; its timer is skipped meanwhile; a run can be stopped', async () => {
  const cat = await engine.createCat(userId, { name: 'Slow', mission: 'block slow', timezone: 'UTC', triggers: [schedule('daily 11:00')] },
    { workspaceId, now: new Date('2026-10-12T09:00:00Z') });
  isolate(cat);
  const first = await engine.wakeCatNow(userId, cat.id);
  assert.equal(first.run.status, 'running');
  assert.equal(engine.getCat(userId, cat.id).running, true);
  const second = await engine.wakeCatNow(userId, cat.id);
  assert.equal(second.queued, true, 'Run now while running waits for the run to end');

  engine.tick(new Date('2026-10-12T11:00:00Z'));
  const skipped = runsOf(cat).find((run) => run.status === 'skipped');
  assert.match(skipped.error, /last run was still going/);

  assert.equal(engine.cancelCat(userId, cat.id), true);
  await until(() => runsOf(cat).find((run) => run.id === first.run.id).status === 'cancelled', 'the cancel');
  // The queued Run now starts once the first has stopped; stop it too.
  await gateFor('Slow');
  await until(() => engine.getCat(userId, cat.id).running, 'the queued run');
  engine.cancelCat(userId, cat.id);
  await engine.waitForRuns();
  assert.equal(engine.cancelCat(userId, cat.id), false);
});

test('at most two Cats work at once; a Cat waiting for an answer leaves its slot', async () => {
  const now = new Date('2026-10-12T09:00:00Z');
  const cats = [];
  for (const name of ['block a', 'block b', 'block c']) {
    cats.push(await engine.createCat(userId, { name, mission: name, timezone: 'UTC', triggers: [schedule('daily 12:00')] }, { workspaceId, now }));
  }
  isolate(...cats);
  assert.equal(engine.tick(new Date('2026-10-12T12:00:00Z')).length, 2);
  assert.equal(engine.getCat(userId, cats[2].id).queued, 1, 'the third waits in line');
  assert.equal(engine.getCat(userId, cats[2].id).running, false);

  (await gateFor('block a')).resolve();
  await until(() => !engine.getCat(userId, cats[0].id).running && engine.getCat(userId, cats[2].id).running, 'the third to start');
  (await gateFor('block b')).resolve();
  (await gateFor('block c')).resolve();
  await engine.waitForRuns();
  for (const cat of cats) assert.equal(runsOf(cat)[0].status, 'succeeded');
});

test('a time missed while asleep is made up once within 12 hours, skipped after', async () => {
  const late = await engine.createCat(userId, { name: 'Late', mission: 'late one', timezone: 'UTC', triggers: [schedule('daily 08:00')] },
    { workspaceId, now: new Date('2026-10-14T07:00:00Z') });
  isolate(late);
  engine.tick(new Date('2026-10-14T14:00:00Z'));
  await engine.waitForRuns();
  assert.equal(runsOf(late)[0].status, 'succeeded');

  engine.tick(new Date('2026-10-15T21:00:00Z'));
  await engine.waitForRuns();
  assert.equal(runsOf(late)[0].status, 'skipped');
  assert.match(runsOf(late)[0].error, /more than 12 hours/);
  assert.equal(engine.getCat(userId, late.id).nextWakeAt, '2026-10-16T08:00:00.000Z');
});

test('pausing stops wakes; resuming counts from now without making up missed ones', async () => {
  const cat = await engine.createCat(userId, { name: 'Pausable', mission: 'pause me', timezone: 'UTC', triggers: [schedule('daily 08:00')] },
    { workspaceId, now: new Date('2026-10-12T07:00:00Z') });
  const paused = engine.setCatEnabled(userId, cat.id, false);
  assert.equal(paused.state, 'paused');
  assert.equal(paused.nextWakeAt, null);
  assert.equal(engine.tick(new Date('2026-10-12T08:00:00Z')).length, 0);
  const resumed = engine.updateCat(userId, cat.id, { enabled: true }, { now: new Date('2026-10-15T09:00:00Z') });
  assert.equal(resumed.nextWakeAt, '2026-10-16T08:00:00.000Z');
});

test('a one-off time runs once; editing keeps an every-N-hours rhythm and checks input', async () => {
  const once = await engine.createCat(userId, { name: 'Once', mission: 'just once', timezone: 'UTC', triggers: [schedule('tomorrow at 7am')] },
    { workspaceId, now: new Date('2026-10-20T12:00:00Z') });
  isolate(once);
  engine.tick(new Date('2026-10-21T07:00:00Z'));
  await engine.waitForRuns();
  const done = engine.getCat(userId, once.id);
  assert.equal(done.lastRun.status, 'succeeded');
  assert.equal(done.nextWakeAt, null);
  assert.equal(done.triggers.find((trigger) => trigger.kind === 'schedule').enabled, false, 'its time has had its turn');

  const build = await engine.createCat(userId, { mission: 'Check the build', timezone: 'UTC', triggers: [schedule('every 3 hours')] },
    { workspaceId, now: new Date('2026-10-12T09:00:00Z') });
  assert.equal(build.name, 'Check the build', 'the name defaults to the mission');
  assert.equal(build.nextWakeAt, '2026-10-12T12:00:00.000Z');
  const timer = build.triggers.find((trigger) => trigger.kind === 'schedule');
  const edited = engine.updateCat(userId, build.id, {
    name: 'Build', triggers: [{ id: timer.id, kind: 'schedule', config: { schedule: { kind: 'every_hours', interval: 3 } } }],
  }, { now: new Date('2026-10-12T10:00:00Z') });
  assert.equal(edited.nextWakeAt, '2026-10-12T12:00:00.000Z');

  await assert.rejects(() => engine.createCat(userId, { mission: '' }), /mission/);
  await assert.rejects(() => engine.createCat(userId, { mission: 'x', triggers: [schedule('whenever')] }), /isn't a schedule/);
  await assert.rejects(() => engine.createCat(userId, { mission: 'x', triggers: [schedule('every 5 minutes')] }), /15 minutes/);
  await assert.rejects(() => engine.createCat(userId, { mission: 'x', projectId: 'nope' }), /project was not found/);
  await assert.rejects(() => engine.createCat(userId, { mission: 'x', allowedTools: ['rm -rf'] }), /isn't a tool name/);
  await assert.rejects(() => engine.createCat(userId, { mission: 'x', freedom: 'anything' }), /Freedom/);
  await assert.rejects(() => engine.createCat(userId, { mission: 'x', allowedSites: ['not a site'] }), /isn't a site/);
  await assert.rejects(() => engine.createCat(userId, { mission: 'x', triggers: [{ kind: 'rss', config: { url: 'ftp://x' } }] }), /RSS/);
  assert.equal(engine.getCat(randomUUID(), build.id), null, 'other users cannot see it');
});

test('freedom decides which steps wait for an OK; the run pauses and resumes', async () => {
  assert.equal(engine.freedomAllows('alone', { permission: 'dangerous' }), true);
  assert.equal(engine.freedomAllows('alone', { permission: 'dangerous', sensitive: 'payment' }), false, 'sensitive steps are always asked');
  assert.equal(engine.freedomAllows('ask_risky', { permission: 'moderate' }), true);
  assert.equal(engine.freedomAllows('ask_risky', { permission: 'dangerous' }), false);
  assert.equal(engine.freedomAllows('ask_first', { permission: 'moderate' }), false);

  const cat = await engine.createCat(userId, { name: 'Risky', mission: 'risky cleanup', timezone: 'UTC', freedom: 'ask_risky' }, { workspaceId });
  isolate(cat);
  await engine.wakeCatNow(userId, cat.id);
  await until(() => inbox.listInbox(userId, { catId: cat.id, kinds: ['approval'] }).length === 1, 'the approval');
  const [ask] = inbox.listInbox(userId, { catId: cat.id, kinds: ['approval'] });
  assert.equal(ask.title, 'Run rm notes.txt');
  assert.equal(ask.data.tool, 'run_command');
  assert.equal(engine.getCat(userId, cat.id).state, 'waiting');
  assert.equal(runsOf(cat)[0].status, 'waiting');
  assert.ok((await hostMessages()).some((message) => message.type === 'notify' && /wants your OK/.test(message.payload.title)));

  inbox.answerInboxItem(userId, ask.id, { decision: 'deny', note: 'keep the notes' });
  await engine.waitForRuns();
  assert.match(runsOf(cat)[0].answer, /Decision: deny \(The user said no: keep the notes\)/);
  assert.throws(() => inbox.answerInboxItem(userId, ask.id, { decision: 'allow_once' }), /already answered/);

  // "Allow from now on" adds the tool to what the Cat may use without asking.
  await engine.wakeCatNow(userId, cat.id);
  await until(() => inbox.listInbox(userId, { catId: cat.id, kinds: ['approval'] }).length === 1, 'the second approval');
  const [again] = inbox.listInbox(userId, { catId: cat.id, kinds: ['approval'] });
  inbox.answerInboxItem(userId, again.id, { decision: 'allow_always' });
  await engine.waitForRuns();
  assert.match(runsOf(cat)[0].answer, /Decision: allow_always/);
  assert.deepEqual(engine.getCat(userId, cat.id).allowedTools, ['run_command']);
  const timeline = inbox.listTimeline(cat.id).map((event) => event.title);
  assert.ok(timeline.includes('You said no') && timeline.includes('You allowed it from now on'));

  const alone = await engine.createCat(userId, { name: 'Alone', mission: 'risky alone', timezone: 'UTC', freedom: 'alone' }, { workspaceId });
  await engine.wakeCatNow(userId, alone.id);
  await engine.waitForRuns();
  assert.match(runsOf(alone)[0].answer, /Decision: allow$/, 'working alone needs no OK');
});

test('an unanswered approval expires and the step is not done', async () => {
  const item = inbox.createInboxItem({ userId, catId: byName('Risky').id, kind: 'approval', title: 'Delete it?' });
  const result = await inbox.waitForAnswer(item.id, { timeoutMs: 1000 });
  assert.equal(result.status, 'expired');
  assert.equal(inbox.getInboxItem(userId, item.id).status, 'expired');
  assert.throws(() => inbox.answerInboxItem(userId, item.id, { decision: 'allow_once' }), /Too late/);
});

test('questions go to the inbox and the answer comes back', async () => {
  const cat = await engine.createCat(userId, { name: 'Curious', mission: 'ask which bed', timezone: 'UTC' }, { workspaceId });
  isolate(cat);
  await engine.wakeCatNow(userId, cat.id);
  await until(() => inbox.listInbox(userId, { catId: cat.id, kinds: ['question'] }).length === 1, 'the question');
  const [question] = inbox.listInbox(userId, { catId: cat.id, kinds: ['question'] });
  assert.equal(question.title, 'Which bed?');
  assert.deepEqual(question.data.choices, ['one', 'two']);
  assert.equal(inbox.inboxCounts(userId).waiting >= 1, true);
  inbox.answerInboxItem(userId, question.id, { answer: 'two' });
  await engine.waitForRuns();
  assert.equal(runsOf(cat)[0].answer, 'They said: two');
});

test('daily limits: no more runs once used up (one notice a day); tokens stop a run', async () => {
  const cat = await engine.createCat(userId, { name: 'Thrifty', mission: 'save money', timezone: 'UTC', limits: { runsPerDay: 1 } }, { workspaceId });
  isolate(cat);
  await engine.wakeCatNow(userId, cat.id);
  await engine.waitForRuns();
  await assert.rejects(() => engine.wakeCatNow(userId, cat.id), /daily limit/);
  await assert.rejects(() => engine.wakeCatNow(userId, cat.id), /daily limit/);
  assert.equal(runsOf(cat).filter((run) => run.status === 'skipped').length, 2);
  const notices = inbox.listInbox(userId, { catId: cat.id, kinds: ['notice'] });
  assert.equal(notices.length, 1, 'one notice a day');
  assert.match(notices[0].body, /1 run for today/);
  assert.match(engine.getCat(userId, cat.id).limitReached, /1 run for today/);

  const hungry = await engine.createCat(userId, { name: 'Hungry', mission: 'tokens galore', timezone: 'UTC', limits: { tokensPerDay: 500 } }, { workspaceId });
  isolate(hungry);
  await engine.wakeCatNow(userId, hungry.id);
  await engine.waitForRuns();
  assert.equal(runsOf(hungry)[0].status, 'failed');
  assert.match(runsOf(hungry)[0].error, /500 tokens for today/);
});

test('watchers take note first, then wake the Cat on what is new', async () => {
  const cat = await engine.createCat(userId, {
    name: 'Watcher', mission: 'watch things', timezone: 'UTC',
    triggers: [
      { kind: 'email', config: { from: 'garden' } },
      { kind: 'rss', config: { url: 'https://blog.example.com/feed.xml' } },
      { kind: 'webpage', config: { url: 'https://shop.example.com/seeds' } },
      { kind: 'folder', config: { path: projectRoot } },
    ],
  }, { workspaceId, now: new Date('2026-10-12T09:00:00Z') });
  isolate(cat);
  fake.mail = [{ uid: '7', from: 'Garden Club <club@example.com>', subject: 'Old news' }];
  fake.feed = { feed: { title: 'Garden blog' }, items: [{ guid: 'p1', title: 'First post', url: 'https://blog.example.com/1' }] };
  fake.files = { 'plan.md': '10:1' };

  engine.tick(new Date('2026-10-12T09:00:30Z'));
  await engine.waitForRuns();
  assert.equal(runsOf(cat).length, 0, 'the first look only takes note');
  assert.ok(inbox.listTimeline(cat.id).some((event) => event.kind === 'watching'));

  fake.mail = [...fake.mail, { uid: '8', from: 'Garden Club <club@example.com>', subject: 'Seed swap on Sunday' }, { uid: '9', from: 'Shop <ads@example.com>', subject: 'Sale' }];
  engine.tick(new Date('2026-10-12T09:06:00Z'));
  await engine.waitForRuns();
  const emailRun = runsOf(cat)[0];
  assert.equal(emailRun.triggerKind, 'email');
  assert.match(emailRun.reason, /New email from Garden Club .+: “Seed swap on Sunday”/);
  assert.match(calls.at(-1).wake.details, /Seed swap on Sunday/);
  assert.doesNotMatch(calls.at(-1).wake.details, /Sale/, 'only mail matching its filter');

  fake.feed = { feed: { title: 'Garden blog' }, items: [{ guid: 'p2', title: 'Second post', url: 'https://blog.example.com/2' }, ...fake.feed.items] };
  fake.page = '<p>Price: 12</p>';
  db.prepare("UPDATE cat_triggers SET next_at = ? WHERE cat_id = ? AND kind IN ('rss','webpage')").run('2026-10-12T09:00:00.000Z', cat.id);
  engine.tick(new Date('2026-10-12T10:00:00Z'));
  await engine.waitForRuns();
  const reasons = runsOf(cat).map((run) => run.reason).join(' | ');
  assert.match(reasons, /New post on Garden blog: “Second post”/);
  assert.match(reasons, /shop\.example\.com changed/);
  assert.ok(calls.some((call) => /\+ Price: 12/.test(call.wake.details || '')), 'the page change is described');

  fake.files = { 'plan.md': '10:1', 'beds.csv': '20:2' };
  db.prepare("UPDATE cat_triggers SET next_at = ? WHERE cat_id = ? AND kind = 'folder'").run('2026-10-12T09:00:00.000Z', cat.id);
  engine.tick(new Date('2026-10-12T10:05:00Z'));
  await engine.waitForRuns();
  assert.ok(runsOf(cat).some((run) => /New file in project: beds\.csv/.test(run.reason)), 'a new file wakes it');

  const failing = { ...deps, listMail: async () => { throw new Error('IMAP is down'); } };
  const watcherRow = db.prepare("SELECT * FROM cat_triggers WHERE cat_id = ? AND kind = 'email'").get(cat.id);
  const { checkWatcher } = await import('../src/cats/catTriggers.js');
  await assert.rejects(() => checkWatcher('email', {}, { initialized: true }, failing), /IMAP is down/);
  assert.ok(watcherRow.next_at, 'a watcher always has its next look');
});

test('a message in its chat wakes the Cat and the answer follows it', async () => {
  const cat = await engine.createCat(userId, { name: 'Chatty', mission: 'talk', timezone: 'UTC' }, { workspaceId });
  isolate(cat);
  const woke = await engine.wakeCatNow(userId, cat.id, { message: 'How are the tomatoes?' });
  assert.ok(woke.run);
  await engine.waitForRuns();
  const conversation = await chatService.getConversation(userId, woke.conversationId);
  const last = conversation.messages.slice(-2);
  assert.equal(last[0].type, 'user');
  assert.equal(last[0].content, 'How are the tomatoes?');
  assert.equal(last[1].content, 'You said: How are the tomatoes?');
  assert.equal(inbox.listInbox(userId, { catId: cat.id, kinds: ['result'] }).length, 0, 'a chat answer needs no inbox item');
  assert.equal(calls.at(-1).wake.kind, 'chat');
});

test("feedback goes into the Cat's memory, which only that Cat sees", async () => {
  const cat = byName('Inbox Cat');
  const [run] = runsOf(cat).filter((item) => item.status === 'succeeded');
  const feedback = inbox.recordRunFeedback(userId, run.id, { rating: 'down', note: 'Put urgent mail first.' });
  assert.match(feedback.memory, /didn't like .+ Next time: Put urgent mail first\./);
  const row = db.prepare("SELECT * FROM agent_memory WHERE key = ?").get(`cat_feedback_${run.id}`);
  assert.equal(row.cat_id, cat.id);
  assert.equal(row.memory_type, 'feedback');
  assert.equal(runsOf(cat).find((item) => item.id === run.id).feedback, 'down');
  assert.equal(inbox.listInbox(userId, { catId: cat.id, kinds: ['result'] }).filter((item) => item.runId === run.id).length, 0, 'reviewed results leave the inbox');

  const visible = (scope) => db.prepare(`SELECT COUNT(*) AS n FROM agent_memory WHERE key = ? ${scope.sql}`).get(`cat_feedback_${run.id}`, ...scope.params).n;
  assert.equal(visible(memoryScope({ catId: cat.id })), 1, 'the Cat sees it');
  assert.equal(visible(memoryScope({ catId: byName('Chatty').id })), 0, 'another Cat does not');
  assert.equal(visible(memoryScope({})), 0, 'chats do not');
  assert.equal(await runInScheduledContext({ catId: cat.id }, () => visible(memoryScope({}))), 1, "inside the Cat's run it is in scope by itself");
});

test("a Cat's run keeps to its sites and can't create or wake Cats", async () => {
  const sites = ['example.com'];
  const allowed = await runInScheduledContext({ catId: 'x', allowedSites: sites }, () => checkAgentUrl('https://news.example.com/'));
  assert.equal(allowed.ok, true);
  const refused = await runInScheduledContext({ catId: 'x', allowedSites: sites }, () => checkAgentUrl('https://elsewhere.org/'));
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /isn't on this Cat's list of sites/);
  assert.equal((await checkAgentUrl('https://elsewhere.org/')).ok, true, 'chats are not limited');

  const create = catTools.find((tool) => tool.name === 'create_cat');
  const list = catTools.find((tool) => tool.name === 'list_cats');
  const args = { mission: 'Spawn more Cats', schedule: 'every hour' };
  const inside = await runInScheduledContext({ catId: 'x' }, () => create.execute(args, { userId, workspaceId }));
  assert.equal(inside.success, false);
  assert.match(inside.error, /can't create/);
  assert.equal((await runInScheduledContext({ catId: 'x' }, () => list.execute({}, { userId }))).success, true, 'looking is allowed');

  const outside = await create.execute({ ...args, name: 'Hourly' }, { userId, workspaceId, projectId });
  assert.equal(outside.success, true);
  assert.deepEqual(outside.cat.wakes_on, ['Every hour']);
  assert.equal(outside.cat.project, 'Garden', "the chat's project is shared by default");
  const none = await create.execute({ mission: 'no wake-up' }, { userId, workspaceId });
  assert.equal(none.success, false);
  assert.match(none.error, /what wakes the Cat/);
});

test('runs left running by a crash are marked failed; open questions expire', () => {
  const cat = byName('Pausable');
  db.prepare("INSERT INTO cat_runs (id, cat_id, status, started_at) VALUES ('crashed-run', ?, 'waiting', ?)").run(cat.id, new Date().toISOString());
  db.prepare("INSERT INTO cat_inbox (id, user_id, cat_id, kind, title) VALUES ('orphan', ?, ?, 'question', 'Still there?')").run(userId, cat.id);
  assert.equal(engine.recoverInterruptedRuns(), 1);
  const run = runsOf(cat).find((item) => item.id === 'crashed-run');
  assert.equal(run.status, 'failed');
  assert.match(run.error, /stopped before this run finished/);
  inbox.expireOrphanedItems();
  assert.equal(inbox.getInboxItem(userId, 'orphan').status, 'expired');
});

test('deleting a Cat stops it and keeps its chat', async () => {
  const cat = byName('Inbox Cat');
  assert.equal(engine.deleteCat(userId, cat.id), true);
  assert.equal(engine.getCat(userId, cat.id), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cat_runs WHERE cat_id = ?').get(cat.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cat_inbox WHERE cat_id = ?').get(cat.id).n, 0);
  const conversation = await chatService.getConversation(userId, cat.conversationId);
  assert.ok(conversation.messages.length >= 3);
});

test('a Cat without a picture gets no emoji, and the old filled-in ones are cleared', async () => {
  const plain = await engine.createCat(userId, { name: 'Plain', mission: 'Look after the plants.', timezone: 'UTC' });
  assert.equal(plain.avatar, '', 'the page shows the plain cat glyph');
  const chosen = await engine.createCat(userId, { name: 'Fox', avatar: '🦊', mission: 'Watch the fox.', timezone: 'UTC' });
  assert.equal(chosen.avatar, '🦊', 'a picked one stays');

  db.prepare("UPDATE cats SET avatar = '🐱' WHERE id = ?").run(plain.id);
  assert.equal(store.hydrateCat(db.prepare('SELECT * FROM cats WHERE id = ?').get(plain.id), { includeRuns: false }).avatar, '', 'read as no picture');
  store.ensureCatTables(db);
  assert.equal(db.prepare('SELECT avatar FROM cats WHERE id = ?').get(plain.id).avatar, '');
  assert.equal(db.prepare('SELECT avatar FROM cats WHERE id = ?').get(chosen.id).avatar, '🦊');
});
