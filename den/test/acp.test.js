import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The Agent Client Protocol client (den/src/agent/acp/), against a fake ACP
// agent (test/fixtures/fakeAcpAgent.mjs): a turn's events, approvals, the
// folder rules, Plan mode, resuming, stopping, and the saved agent list.

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_AGENT = path.join(here, 'fixtures', 'fakeAcpAgent.mjs');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-acp-'));
const folder = path.join(scratch, 'project');
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(path.join(scratch, 'outside.txt'), 'secret');

const { AcpConnection } = await import('../src/agent/acp/acpConnection.js');
const { runAcpAgent, insideFolder, toolContentText } = await import('../src/agent/acp/acpRunner.js');
const acpAgents = await import('../src/agent/acp/acpAgents.js');
const { isAcpEngine } = await import('../src/agent/externalAgents.js');

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const agent = { name: 'fake', engine: 'acp:fake', title: 'Fake agent', command: process.execPath, args: [FAKE_AGENT], env: {}, approvedDownload: null };

function collect() {
  const events = [];
  return { events, emit: (type, data) => events.push({ type, data }) };
}

test('the connection introduces Asyncat and gets the agent’s answer', async () => {
  const connection = new AcpConnection({ command: process.execPath, args: [FAKE_AGENT], cwd: folder, env: process.env });
  await connection.start();
  const init = await connection.request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } } });
  assert.equal(init.agentInfo.name, 'fake-acp');
  assert.equal(init.agentCapabilities.loadSession, true);
  await assert.rejects(connection.request('no/such/method'), /Method not found/);
  await connection.close();
  await assert.rejects(connection.request('initialize'), /not running/);
});

test('a turn streams thoughts, a plan, text and a tool call; the write is approved and stays in the folder', async () => {
  const { events, emit } = collect();
  const asked = [];
  const result = await runAcpAgent({
    agent,
    goal: 'Please write my notes',
    workingDir: folder,
    requestPermission: async (request) => { asked.push(request); return { decision: 'allow' }; },
    emit,
  });
  assert.equal(result.stopReason, 'answer');
  assert.equal(result.answer, 'I wrote notes.md.');
  assert.match(result.externalSessionId, /^sess_/);
  assert.equal(fs.readFileSync(path.join(folder, 'notes.md'), 'utf8'), 'hello from acp');

  assert.equal(asked.length, 1);
  assert.equal(asked[0].tool, 'edit_file');
  assert.equal(asked[0].permission, 'dangerous');
  assert.match(asked[0].description, /Fake agent: Write notes\.md/);
  assert.match(asked[0].diff, /\+hello from acp/);

  const types = events.map((event) => event.type);
  for (const type of ['reasoning_delta', 'plan_update', 'tool_start', 'tool_result', 'delta']) assert.ok(types.includes(type), `${type} missing`);
  const done = events.find((event) => event.type === 'tool_result');
  assert.equal(done.data.result.success, true);
  assert.match(done.data.result.output, /Wrote: hello from acp/);
  const plan = events.find((event) => event.type === 'plan_update').data.plan;
  assert.deepEqual(plan.map((entry) => entry.status), ['completed', 'in_progress']);
});

test('a refused step is not done', async () => {
  fs.rmSync(path.join(folder, 'notes.md'), { force: true });
  const { events, emit } = collect();
  const result = await runAcpAgent({ agent, goal: 'write it', workingDir: folder, requestPermission: async () => ({ decision: 'deny' }), emit });
  assert.equal(result.answer, 'You said no, so I left it.');
  assert.equal(fs.existsSync(path.join(folder, 'notes.md')), false);
  assert.equal(events.find((event) => event.type === 'tool_result').data.result.success, false);
});

test('Plan mode picks the agent’s plan mode and refuses changes without asking', async () => {
  const asked = [];
  const chat = await runAcpAgent({ agent, goal: 'hello there', workingDir: folder, agentMode: 'plan', requestPermission: async (r) => { asked.push(r); return { decision: 'allow' }; } });
  assert.match(chat.answer, /mode: plan/);
  const write = await runAcpAgent({ agent, goal: 'write it', workingDir: folder, agentMode: 'plan', requestPermission: async (r) => { asked.push(r); return { decision: 'allow' }; } });
  assert.equal(write.answer, 'You said no, so I left it.');
  assert.equal(asked.length, 0, 'Plan mode never asks to change things');
  assert.equal(fs.existsSync(path.join(folder, 'notes.md')), false);
});

test('files outside the chat’s folder are refused', async () => {
  const result = await runAcpAgent({ agent, goal: 'escape the folder', workingDir: folder, requestPermission: async () => ({ decision: 'allow' }) });
  assert.match(result.answer, /Refused: .*outside this chat's folder/);
  assert.throws(() => insideFolder('/etc/passwd', folder), /outside/);
  assert.equal(insideFolder(path.join(folder, 'new.txt'), folder), path.join(fs.realpathSync(folder), 'new.txt'));
  fs.symlinkSync(scratch, path.join(folder, 'link'));
  assert.throws(() => insideFolder(path.join(folder, 'link', 'outside.txt'), folder), /outside/, 'links out of the folder are followed');
});

test('a later turn resumes the session without showing the replay again', async () => {
  const first = await runAcpAgent({ agent, goal: 'hello', workingDir: folder });
  const { events, emit } = collect();
  const second = await runAcpAgent({ agent, goal: 'again', workingDir: folder, externalSessionId: first.externalSessionId, emit });
  assert.equal(second.externalSessionId, first.externalSessionId);
  assert.equal(events.some((event) => event.type === 'delta' && /replayed/.test(event.data.content)), false);
  assert.match(second.answer, /You said: again$/);
});

test('stopping a turn cancels it at the agent', async () => {
  const controller = new AbortController();
  const started = Date.now();
  setTimeout(() => controller.abort(), 300);
  const result = await runAcpAgent({ agent, goal: 'go slow', workingDir: folder, abortSignal: controller.signal });
  assert.equal(result.stopReason, 'aborted');
  assert.ok(Date.now() - started < 5000);
});

test('ACP agents are saved with sealed keys, and npx ones wait for an OK', async () => {
  assert.equal(isAcpEngine('acp:gemini'), true);
  assert.equal(isAcpEngine('acp:../x'), false);
  assert.equal(isAcpEngine('codex'), false);

  const saved = acpAgents.saveAcpAgent({ name: 'fake', title: 'Fake agent', command: process.execPath, args: [FAKE_AGENT], env: { FAKE_TOKEN: 'secret-token-value' } });
  assert.equal(saved.engine, 'acp:fake');
  assert.equal(saved.installed, true);
  assert.deepEqual(saved.env, { FAKE_TOKEN: '********' });
  assert.equal(fs.readFileSync(acpAgents.acpConfigPath(), 'utf8').includes('secret-token-value'), false);
  assert.equal(acpAgents.getAcpAgent('fake').env.FAKE_TOKEN, 'secret-token-value');
  acpAgents.saveAcpAgent({ title: 'Fake agent', command: process.execPath, args: [FAKE_AGENT], env: { FAKE_TOKEN: '********' } }, { existing: 'fake' });
  assert.equal(acpAgents.getAcpAgent('fake').env.FAKE_TOKEN, 'secret-token-value', 'masked values keep the key');
  assert.throws(() => acpAgents.saveAcpAgent({ name: 'fake', command: 'x' }), /already an agent/);

  const check = await acpAgents.checkAcpAgent('fake', { cwd: folder });
  assert.equal(check.agent.name, 'fake-acp');
  assert.equal(check.loadSession, true);

  process.env.npm_config_cache = path.join(scratch, 'npm-cache');
  const adapter = acpAgents.saveAcpAgent({ name: 'adapter', command: 'npx', args: ['-y', 'some-acp-adapter'] });
  assert.equal(adapter.needsDownload, true);
  await assert.rejects(runAcpAgent({ agent: acpAgents.getAcpAgent('adapter'), goal: 'hi', workingDir: folder }), /download some-acp-adapter first/);
  const approved = acpAgents.saveAcpAgent({ command: 'npx', args: ['-y', 'some-acp-adapter'], approveDownload: true }, { existing: 'adapter' });
  assert.equal(approved.needsDownload, false);

  assert.equal(acpAgents.removeAcpAgent('adapter'), true);
  assert.equal(acpAgents.listAcpAgents().some((item) => item.name === 'adapter'), false);
  assert.equal(toolContentText([{ type: 'content', content: { type: 'text', text: 'hi' } }, { type: 'diff', path: '/a' }]), 'hi\nChanged /a');
});
