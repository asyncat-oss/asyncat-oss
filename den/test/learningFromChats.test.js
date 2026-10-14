import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

// Settings → Privacy & safety → Learning from chats. "Remember things from
// chats" (on unless turned off) lets the agent pull memories out of a chat;
// "Suggest skills from my chats" (off unless turned on) drafts a skill after
// a chat that worked through a task and waits for Save or Not now. A scripted
// model shows which side requests each switch allows.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-learning-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
process.env.ASYNCAT_HOME = path.join(scratch, 'home');
delete process.env.ASYNCAT_REMEMBER_CHATS;
delete process.env.ASYNCAT_SUGGEST_SKILLS;

const { default: db } = await import('../src/db/client.js');
const { initializeAgent } = await import('../src/agent/index.js');
const { AgentRuntime } = await import('../src/agent/AgentRuntime.js');
const { USER_SKILLS_DIR } = await import('../src/agent/skills.js');
const { learningSettings, setLearningSettings } = await import('../src/agent/learningSettings.js');
const { listSkillSuggestions } = await import('../src/agent/skillSuggestions.js');
const { subscribeAppEvents } = await import('../src/lib/appEvents.js');
const { default: learningRouter } = await import('../src/agent/learningRoutes.js');
const { default: express } = await import('express');

await initializeAgent();

const userId = randomUUID();
const workspaceId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, 'demo@example.test', 'Demo')").run(userId);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Home', ?)").run(workspaceId, userId);

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { id: userId }; next(); });
app.use('/api/learning', learningRouter);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api/learning`;
const api = async (method, url, body) => {
  const res = await fetch(`${base}${url}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() };
};

const events = [];
const stopListening = subscribeAppEvents((event) => events.push(event));

test.after(() => {
  stopListening();
  server.close();
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

function newChat() {
  const id = randomUUID();
  db.prepare("INSERT INTO conversations (id, user_id, workspace_id, title) VALUES (?, ?, ?, 'Fruit notes')").run(id, userId, workspaceId);
  const folder = path.join(scratch, id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'pears.md'), 'Pears ripen best off the tree.\n');
  fs.writeFileSync(path.join(folder, 'plums.md'), 'Plums want a sunny wall.\n');
  return { id, folder };
}

const call = (name, args) => `<tool_call>\n${JSON.stringify({ name, arguments: args })}\n</tool_call>`;

// Look around, write a file, then answer at length: enough for both a
// memory and a skill draft.
const TURNS = [
  `**Thought:** Look at the notes first.\n${call('list_directory', { path: '.' })}\n${call('read_file', { path: 'pears.md' })}\n${call('read_file', { path: 'plums.md' })}`,
  `**Thought:** Write the summary.\n${call('write_file', { path: 'summary.md', content: '# Fruit notes\n\nPears ripen off the tree; plums like a sunny wall.\n' })}`,
  '**Thought:** Done.\n**Answer:** I read both notes and wrote summary.md: pears ripen best off the tree, and plums want a sunny wall.',
];

const DRAFT_PROMPT = /extract reusable agent skill patterns/;
const MEMORY_PROMPT = /extract durable facts/;

/** An OpenAI-style client that replays TURNS and records every side request. */
function fakeClient({ skillName = 'fruit-notes-summary' } = {}) {
  const asked = [];
  const runPrompts = [];
  let turn = 0;
  const create = async (params) => {
    const system = String(params.messages?.find((message) => message.role === 'system')?.content || '');
    if (params.stream) {
      runPrompts.push(system);
      const text = TURNS[Math.min(turn, TURNS.length - 1)];
      turn += 1;
      return (async function* stream() {
        yield { choices: [{ index: 0, delta: { content: text }, finish_reason: null }] };
        yield { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
      })();
    }
    asked.push(system);
    let content = '{}';
    if (MEMORY_PROMPT.test(system)) {
      content = JSON.stringify({ memories: [{ kind: 'preference', key: 'fruit_notes', content: 'The user keeps fruit growing notes as markdown.', importance: 0.7 }] });
    } else if (DRAFT_PROMPT.test(system)) {
      content = JSON.stringify({ should_create: true, name: skillName, description: 'Summarise a folder of fruit notes into one file.', when_to_use: 'Summarising notes', tags: ['notes'], key_steps: ['Read each note', 'Write summary.md'], pitfalls: [] });
    }
    return { choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] };
  };
  return { asked, runPrompts, aiClient: { client: { chat: { completions: { create } } } } };
}

async function chatRun(chat, { operation = 'agent', skillName, history = [] } = {}) {
  const { asked, runPrompts, aiClient } = fakeClient({ skillName });
  const runtime = new AgentRuntime({
    aiClient,
    model: 'demo-model',
    isLocal: false,
    supportsNativeTools: false,
    userId,
    workspaceId,
    workingDir: chat.folder,
    workspaceRoot: chat.folder,
    autoApprove: true,
    usageContext: { operation, conversationId: chat.id, userMessageId: `u-${chat.id}`, assistantMessageId: `a-${chat.id}` },
  });
  const result = await runtime.run('Write a summary of the fruit notes in this folder to summary.md', history);
  return { result, asked, runPrompts };
}

const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, what) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await settle(25);
  }
}

const count = (sql, ...params) => db.prepare(sql).get(...params).n;
const skillFiles = () => (fs.existsSync(USER_SKILLS_DIR) ? fs.readdirSync(USER_SKILLS_DIR) : []);
const suggestionRows = (chatId) => count('SELECT COUNT(*) AS n FROM agent_skill_suggestions WHERE conversation_id = ?', chatId);

test('out of the box: memories are kept, skills are not suggested', async () => {
  assert.deepEqual(learningSettings(), { rememberChats: true, suggestSkills: false });
  assert.deepEqual((await api('GET', '/')).json.settings, { rememberChats: true, suggestSkills: false });

  const chat = newChat();
  const { asked } = await chatRun(chat);
  await until(() => count("SELECT COUNT(*) AS n FROM agent_memory WHERE source = 'auto'") > 0, 'a memory');
  await settle();

  assert.ok(asked.some((system) => MEMORY_PROMPT.test(system)), 'memories are extracted');
  assert.equal(asked.some((system) => DRAFT_PROMPT.test(system)), false, 'the model is never asked for a skill');
  assert.equal(suggestionRows(chat.id), 0);
  assert.deepEqual(skillFiles(), [], 'and no skill is written');
});

test('with suggestions on, a draft waits in the chat until Save writes it', async () => {
  setLearningSettings({ suggestSkills: true });
  const chat = newChat();
  const before = events.length;
  const { asked } = await chatRun(chat);
  await until(() => suggestionRows(chat.id) === 1, 'a suggestion');

  assert.equal(asked.filter((system) => DRAFT_PROMPT.test(system)).length, 1, 'one model call drafts it');
  assert.deepEqual(skillFiles(), [], 'nothing is written yet');
  const [suggestion] = listSkillSuggestions(userId, chat.id);
  assert.equal(suggestion.name, 'fruit-notes-summary');
  assert.equal(suggestion.description, 'Summarise a folder of fruit notes into one file.');
  assert.equal(suggestion.messageId, `a-${chat.id}`, 'it belongs to the answer that prompted it');

  const announced = events.slice(before).find((event) => event.type === 'skill.suggested');
  assert.ok(announced, 'screens are told');
  assert.equal(announced.userId, userId);
  assert.equal(announced.data.conversationId, chat.id);
  assert.equal(announced.data.suggestion.id, suggestion.id);

  const listed = await api('GET', `/suggestions?conversationId=${chat.id}`);
  assert.deepEqual(listed.json.suggestions.map((item) => item.id), [suggestion.id], 'it survives a reload');

  const saved = await api('POST', `/suggestions/${suggestion.id}/save`);
  assert.equal(saved.status, 200);
  assert.equal(saved.json.skill.name, 'fruit-notes-summary');
  assert.deepEqual(skillFiles(), ['fruit-notes-summary.md']);
  const file = fs.readFileSync(path.join(USER_SKILLS_DIR, 'fruit-notes-summary.md'), 'utf8');
  assert.match(file, /^name: fruit-notes-summary$/m);
  assert.match(file, /^description: Summarise a folder of fruit notes into one file\.$/m);
  assert.match(file, /^created_by: chat-suggestion$/m, 'filed as one the user saved');
  assert.doesNotMatch(file, /skill-synthesizer|auto-synthesized/);
  assert.match(file, /1\. Read each note\n2\. Write summary\.md/);
  assert.equal(suggestionRows(chat.id), 0, 'the draft is gone once saved');
  assert.ok(events.some((event) => event.type === 'skill.closed' && event.data.id === suggestion.id && event.data.saved), 'other windows close the card');

  assert.equal((await api('POST', `/suggestions/${suggestion.id}/save`)).status, 404, 'saving twice finds nothing');
});

test('Not now drops the draft and writes nothing', async () => {
  const chat = newChat();
  await chatRun(chat, { skillName: 'pear-and-plum-digest' });
  await until(() => suggestionRows(chat.id) === 1, 'a suggestion');
  const [suggestion] = listSkillSuggestions(userId, chat.id);

  const dropped = await api('DELETE', `/suggestions/${suggestion.id}`);
  assert.equal(dropped.status, 200);
  assert.equal(suggestionRows(chat.id), 0);
  assert.equal(skillFiles().includes('pear-and-plum-digest.md'), false);
});

test('a chat keeps one draft, and none for a skill you already have', async () => {
  const chat = newChat();
  await chatRun(chat, { skillName: 'first-draft' });
  await until(() => suggestionRows(chat.id) === 1, 'a suggestion');
  const [first] = listSkillSuggestions(userId, chat.id);
  await chatRun(chat, { skillName: 'second-draft' });
  await until(() => listSkillSuggestions(userId, chat.id)[0]?.name === 'second-draft', 'the newer draft');
  assert.equal(suggestionRows(chat.id), 1);
  assert.ok(events.some((event) => event.type === 'skill.closed' && event.data.id === first.id), 'the older card goes');

  const other = newChat();
  const { asked } = await chatRun(other, { skillName: 'fruit-notes-summary' });
  await until(() => asked.some((system) => DRAFT_PROMPT.test(system)), 'the draft request');
  await settle();
  assert.equal(suggestionRows(other.id), 0, 'already saved above');
});

test('only chats get suggestions: not Cats or helpers', async () => {
  const chat = newChat();
  const { asked } = await chatRun(chat, { operation: 'cat', skillName: 'cat-skill' });
  await settle();
  assert.equal(asked.some((system) => DRAFT_PROMPT.test(system)), false);
  assert.equal(suggestionRows(chat.id), 0);
});

test('turning suggestions off drops the drafts still waiting', async () => {
  const chat = newChat();
  await chatRun(chat, { skillName: 'waiting-draft' });
  await until(() => suggestionRows(chat.id) === 1, 'a suggestion');

  const res = await api('PUT', '/', { suggestSkills: false });
  assert.deepEqual(res.json.settings, { rememberChats: true, suggestSkills: false });
  assert.equal(count('SELECT COUNT(*) AS n FROM agent_skill_suggestions'), 0);
  assert.equal((await api('PUT', '/', { suggestSkills: 'yes' })).status, 400);

  const later = newChat();
  const { asked } = await chatRun(later, { skillName: 'not-asked' });
  await settle();
  assert.equal(asked.some((system) => DRAFT_PROMPT.test(system)), false, 'off means no model call');
  assert.equal(suggestionRows(later.id), 0);
});

test('with "Remember things from chats" off, nothing is pulled out of a chat', async () => {
  const res = await api('PUT', '/', { rememberChats: false });
  assert.deepEqual(res.json.settings, { rememberChats: false, suggestSkills: false });
  db.prepare('DELETE FROM agent_memory').run();

  const chat = newChat();
  const history = [
    { role: 'user', content: 'Summarise my garden notes' },
    { role: 'assistant', content: 'Which folder are they in?' },
    { role: 'user', content: 'Actually, use the fruit notes in this folder instead' },
  ];
  const { result, asked, runPrompts } = await chatRun(chat, { history });
  await settle();

  assert.match(result.answer, /wrote summary\.md/, 'the chat itself works');
  assert.equal(asked.some((system) => MEMORY_PROMPT.test(system)), false, 'no extraction call');
  assert.equal(count('SELECT COUNT(*) AS n FROM agent_memory'), 0, 'no memories or corrections');
  assert.match(runPrompts[0], /save a memory only when they ask you to remember something/);
  assert.doesNotMatch(runPrompts[0], /Proactively save/);

  await api('PUT', '/', { rememberChats: true });
  assert.equal(learningSettings().rememberChats, true);
});
