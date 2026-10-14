import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// A temporary chat (an "ephemeral" run) is off the record: the run still
// streams, asks and uses tools, but nothing is kept once it ends. The same
// scripted run without the flag shows each kind of record would otherwise be
// written, so the test can't pass by accident.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-temporary-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
// Learned skills are written under ASYNCAT_HOME; keep them in the scratch folder.
process.env.ASYNCAT_HOME = path.join(scratch, 'home');
// Skill suggestions are off unless asked for; this test asks, so it can show
// a temporary chat still gets none.
process.env.ASYNCAT_SUGGEST_SKILLS = 'on';

const { default: db } = await import('../src/db/client.js');
const { initializeAgent } = await import('../src/agent/index.js');
const { AgentRuntime, listCheckpoints } = await import('../src/agent/AgentRuntime.js');
const { USER_SKILLS_DIR } = await import('../src/agent/skills.js');
const { getSnapshotsDir } = await import('../src/agent/workspacePaths.js');
const { buildAgentSystemPrompt } = await import('../src/agent/prompts/agentSystemPrompt.js');
const { recallMemoryTool } = await import('../src/agent/tools/memoryTools.js');

await initializeAgent();

test.after(() => {
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

const userId = randomUUID();
const workspaceId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, 'demo@example.test', 'Demo')").run(userId);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Home', ?)").run(workspaceId, userId);
const savedChatId = randomUUID();
db.prepare("INSERT INTO conversations (id, user_id, workspace_id, title) VALUES (?, ?, ?, 'Fruit notes')").run(savedChatId, userId, workspaceId);

function makeFolder(name) {
  const folder = path.join(scratch, name);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'pears.md'), 'Pears ripen best off the tree.\n');
  fs.writeFileSync(path.join(folder, 'plums.md'), 'Plums want a sunny wall.\n');
  return folder;
}

const call = (name, args) => `<tool_call>\n${JSON.stringify({ name, arguments: args })}\n</tool_call>`;

// The model's turns: look around, write a file (which takes a checkpoint
// first), then answer at length so memory extraction would run.
const TURNS = [
  `**Thought:** Look at the notes first.\n${call('list_directory', { path: '.' })}\n${call('read_file', { path: 'pears.md' })}\n${call('read_file', { path: 'plums.md' })}`,
  `**Thought:** Write the summary.\n${call('write_file', { path: 'summary.md', content: '# Fruit notes\n\nPears ripen off the tree; plums like a sunny wall.\n' })}`,
  '**Thought:** Done.\n**Answer:** I read both notes and wrote summary.md: pears ripen best off the tree, and plums want a sunny wall.',
];

/** An OpenAI-style client that replays the turns and records every side request. */
function fakeClient(turns = TURNS) {
  const asked = [];
  let turn = 0;
  const create = async (params) => {
    if (params.stream) {
      const text = turns[Math.min(turn, turns.length - 1)];
      turn += 1;
      return (async function* stream() {
        yield { choices: [{ index: 0, delta: { content: text }, finish_reason: null }] };
        yield { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
        yield { choices: [], usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 } };
      })();
    }
    const system = String(params.messages?.find((message) => message.role === 'system')?.content || '');
    asked.push(system);
    let content = '{}';
    if (/extract durable facts/.test(system)) {
      content = JSON.stringify({ memories: [{ kind: 'preference', key: 'fruit_notes', content: 'The user keeps fruit growing notes as markdown.', importance: 0.7 }] });
    } else if (/extract reusable agent skill patterns/.test(system)) {
      content = JSON.stringify({ should_create: true, name: 'fruit-notes-summary', description: 'Summarise fruit notes.', when_to_use: 'Summarising notes', tags: ['notes'], key_steps: ['Read', 'Write'], pitfalls: [] });
    }
    return { choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] };
  };
  return { asked, aiClient: { client: { chat: { completions: { create } } } } };
}

async function runOnce({ ephemeral }) {
  const folder = makeFolder(ephemeral ? 'temporary' : 'saved');
  const { asked, aiClient } = fakeClient();
  const events = [];
  const runtime = new AgentRuntime({
    aiClient,
    model: 'demo-model',
    isLocal: false,
    supportsNativeTools: false,
    userId,
    workspaceId,
    workingDir: folder,
    workspaceRoot: folder,
    autoApprove: true,
    ephemeral,
    onEvent: (event) => events.push(event),
    // The temporary chat names a chat that was never saved; its usage must not.
    usageContext: { operation: 'agent', conversationId: ephemeral ? 'unsaved-chat' : savedChatId, userMessageId: 'u1', assistantMessageId: 'a1' },
  });
  const history = [
    { role: 'user', content: 'Summarise my garden notes' },
    { role: 'assistant', content: 'Which folder are they in?' },
    { role: 'user', content: 'Actually, use the fruit notes in this folder instead' },
  ];
  const result = await runtime.run('Write a summary of the fruit notes in this folder to summary.md', history);
  // Memory extraction and the skill suggestion run after the answer, unawaited.
  await new Promise((resolve) => setTimeout(resolve, 150));
  return { result, folder, asked, events };
}

const count = (sql, ...params) => db.prepare(sql).get(...params).n;
const skillFiles = () => (fs.existsSync(USER_SKILLS_DIR) ? fs.readdirSync(USER_SKILLS_DIR) : []);

test('a temporary chat runs normally but leaves nothing behind', async () => {
  const { result, folder, asked, events } = await runOnce({ ephemeral: true });

  assert.match(result.answer, /wrote summary\.md/);
  assert.equal(fs.readFileSync(path.join(folder, 'summary.md'), 'utf8').includes('sunny wall'), true, 'tools still work');
  assert.ok(events.some((event) => event.type === 'checkpoint'), 'a checkpoint guards the run while it lasts');
  assert.equal(result.session.toolHistory.length, 4, 'the run keeps its tool history in memory');

  assert.equal(count('SELECT COUNT(*) AS n FROM agent_sessions'), 0, 'no saved session');
  assert.equal(count("SELECT COUNT(*) AS n FROM agent_sessions_fts WHERE agent_sessions_fts MATCH 'fruit'"), 0, 'nothing in the search index');
  assert.equal(count('SELECT COUNT(*) AS n FROM agent_tool_audit'), 0, 'no tool audit');
  assert.equal(count('SELECT COUNT(*) AS n FROM agent_memory'), 0, 'no memories or corrections');
  assert.equal(count('SELECT COUNT(*) AS n FROM agent_skill_suggestions'), 0, 'no skill suggestions');
  assert.equal(count('SELECT COUNT(*) AS n FROM agent_checkpoints'), 0, 'no saved checkpoint');
  assert.deepEqual(skillFiles(), [], 'no learned skills');
  assert.equal(listCheckpoints().length, 0, 'the checkpoint is gone once the run ends');
  assert.deepEqual(fs.existsSync(getSnapshotsDir(folder)) ? fs.readdirSync(getSnapshotsDir(folder)) : [], [], 'its snapshot is deleted');
  assert.equal(asked.some((system) => /extract durable facts|extract reusable agent skill patterns/.test(system)), false, 'the model is never asked what to learn');

  const usage = db.prepare('SELECT * FROM ai_model_usage_events').all();
  assert.ok(usage.length > 0, 'usage still counts tokens');
  for (const row of usage) {
    assert.equal(row.total_tokens, 160);
    assert.equal(row.conversation_id, null);
    assert.equal(row.message_id, null);
    assert.equal(row.assistant_message_id, null);
    assert.equal(row.agent_session_id, null);
    assert.doesNotMatch(row.metadata, /fruit|pears|plums/i, 'no message text in usage');
  }
});

test('a temporary chat has no tools that change memories', () => {
  const runtime = new AgentRuntime({ aiClient: fakeClient().aiClient, model: 'demo-model', userId, workspaceId, ephemeral: true });
  const names = runtime._toolDefinitionsForMode('remember that I like pears').map((tool) => tool.name);
  for (const name of ['save_memory', 'forget_memory', 'optimize_memory']) assert.equal(names.includes(name), false, name);
  assert.ok(names.includes('recall_memory'), 'it can still read memories');
  const saved = new AgentRuntime({ aiClient: fakeClient().aiClient, model: 'demo-model', userId, workspaceId });
  assert.ok(saved._toolDefinitionsForMode('remember that I like pears').some((tool) => tool.name === 'save_memory'));
});

test('a temporary chat\'s prompt asks for no memories', () => {
  const temporary = buildAgentSystemPrompt({ temporary: true });
  assert.match(temporary, /This is a temporary chat/);
  assert.doesNotMatch(temporary, /Proactively save/);
  assert.match(buildAgentSystemPrompt({}), /## Memory Guidance[\s\S]*Proactively save/);
});

test('a temporary chat reads memories without marking them as used', async () => {
  // A recall counts as a use, which ranks a memory and keeps it from fading;
  // a temporary chat reads without leaving that trace.
  const memoryId = randomUUID();
  db.prepare(`INSERT INTO agent_memory (id, user_id, workspace_id, memory_type, key, content, importance, source)
    VALUES (?, ?, ?, 'preference', 'pear_picking', 'Pears are picked before they ripen.', 0.7, 'user')`).run(memoryId, userId, workspaceId);
  const uses = () => db.prepare('SELECT access_count, last_accessed_at FROM agent_memory WHERE id = ?').get(memoryId);
  const before = uses();

  const { aiClient } = fakeClient([
    `**Thought:** Check what I know.\n${call('recall_memory', { query: 'pears ripen' })}\n${call('local_rag_search', { query: 'pears ripen', include_memory: true })}`,
    '**Thought:** Done.\n**Answer:** Pick pears before they ripen.',
  ]);
  const runtime = new AgentRuntime({
    aiClient, model: 'demo-model', isLocal: false, supportsNativeTools: false, userId, workspaceId,
    workingDir: makeFolder('recall'), autoApprove: true, ephemeral: true,
  });
  const result = await runtime.run('When should I pick pears?');
  const found = result.session.toolHistory.map((entry) => entry.result?.memories?.map((memory) => memory.key));
  assert.deepEqual(found, [['pear_picking'], ['pear_picking']], 'both tools found the memory');
  assert.deepEqual(uses(), before, 'but it is not marked as used');

  // The same recall in a saved chat is a use, so the check above means something.
  await recallMemoryTool.execute({ query: 'pears ripen' }, { userId, workspaceId });
  assert.equal(uses().access_count, before.access_count + 1);
  db.prepare('DELETE FROM agent_memory WHERE id = ?').run(memoryId);
});

test('the same run without the flag is saved and learned from', async () => {
  db.prepare('DELETE FROM ai_model_usage_events').run();
  const { result } = await runOnce({ ephemeral: false });
  const deadline = Date.now() + 3000;
  while ((count('SELECT COUNT(*) AS n FROM agent_memory WHERE source = ?', 'auto') === 0 || count('SELECT COUNT(*) AS n FROM agent_skill_suggestions') === 0) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.equal(count('SELECT COUNT(*) AS n FROM agent_sessions WHERE id = ?', result.session.id), 1);
  assert.ok(count('SELECT COUNT(*) AS n FROM agent_tool_audit') > 0);
  assert.ok(count('SELECT COUNT(*) AS n FROM agent_memory WHERE source = ?', 'auto') > 0, 'memories are extracted');
  assert.ok(count('SELECT COUNT(*) AS n FROM agent_memory WHERE source = ?', 'correction') > 0, 'the correction is learned');
  assert.ok(count('SELECT COUNT(*) AS n FROM agent_checkpoints') > 0, 'the checkpoint is kept for undo');
  assert.equal(count('SELECT COUNT(*) AS n FROM agent_skill_suggestions WHERE conversation_id = ?', savedChatId), 1, 'a skill is suggested');
  assert.deepEqual(skillFiles(), [], 'but not written until the user saves it');
});
