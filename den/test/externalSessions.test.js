import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { findSessionFile, listExternalSessions, readExternalSession } from '../src/agent/externalSessions.js';
import { claudeUsageFromEvent, codexUsageFromRateLimits, latestCodexUsage } from '../src/agent/externalUsage.js';

const CLAUDE_ID = '11111111-2222-4333-8444-555555555555';
const CODEX_ID = '01a00000-0000-7000-8000-000000000001';

function writeJsonl(file, lines) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
}

function fixtureHomes() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-sessions-'));
  const claude = path.join(root, 'claude');
  const codex = path.join(root, 'codex');
  const project = path.join(root, 'work', 'demo');
  fs.mkdirSync(project, { recursive: true });

  writeJsonl(path.join(claude, 'projects', '-work-demo', `${CLAUDE_ID}.jsonl`), [
    { type: 'user', cwd: project, entrypoint: 'cli', sessionId: CLAUDE_ID, timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: 'Fix the failing test<system-reminder>ignore me</system-reminder>' } },
    { type: 'assistant', cwd: project, timestamp: '2026-10-01T10:00:05.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Looking at it.' }] } },
    { type: 'assistant', cwd: project, timestamp: '2026-10-01T10:00:06.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'npm test', description: 'Run tests' } }] } },
    { type: 'user', cwd: project, timestamp: '2026-10-01T10:00:09.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '1 failing', is_error: true }] } },
    { type: 'assistant', cwd: project, isSidechain: true, timestamp: '2026-10-01T10:00:10.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'subagent noise' }] } },
    { type: 'assistant', cwd: project, timestamp: '2026-10-01T10:00:12.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Fixed the off-by-one.' }] } },
    { type: 'ai-title', aiTitle: 'Fix failing test', sessionId: CLAUDE_ID },
    { type: 'user', cwd: project, isMeta: true, timestamp: '2026-10-01T10:01:00.000Z', message: { role: 'user', content: 'meta' } },
    { type: 'user', cwd: project, timestamp: '2026-10-01T10:02:00.000Z', message: { role: 'user', content: '<command-name>/review</command-name><command-args>src</command-args>' } },
  ]);

  writeJsonl(path.join(codex, 'sessions', '2026', '10', '02', `rollout-2026-10-02T09-00-00-${CODEX_ID}.jsonl`), [
    { type: 'session_meta', timestamp: '2026-10-02T09:00:00.000Z', payload: { id: CODEX_ID, cwd: project, originator: 'codex-tui', source: 'cli' } },
    { type: 'response_item', timestamp: '2026-10-02T09:00:01.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>\n<cwd>/x</cwd>' }] } },
    { type: 'response_item', timestamp: '2026-10-02T09:00:02.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'List the files' }] } },
    { type: 'response_item', timestamp: '2026-10-02T09:00:03.000Z', payload: { type: 'function_call', name: 'shell', call_id: 'call_1', arguments: JSON.stringify({ command: ['bash', '-lc', 'ls'] }) } },
    { type: 'response_item', timestamp: '2026-10-02T09:00:04.000Z', payload: { type: 'function_call_output', call_id: 'call_1', output: JSON.stringify({ output: 'a.txt\n', metadata: { exit_code: 0 } }) } },
    { type: 'response_item', timestamp: '2026-10-02T09:00:05.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'One file: a.txt' }] } },
    { type: 'event_msg', timestamp: '2026-10-02T09:00:06.000Z', payload: { type: 'token_count', rate_limits: { primary: { used_percent: 12.5, window_minutes: 300, resets_at: 1800000000 }, secondary: { used_percent: 40, window_minutes: 10080, resets_at: 1800500000 }, plan_type: 'plus' } } },
  ]);
  fs.writeFileSync(path.join(codex, 'session_index.jsonl'), `${JSON.stringify({ id: CODEX_ID, thread_name: 'Look around the repo', updated_at: '2026-10-02T09:00:06Z' })}\n`);

  // An automated run Asyncat or a script started.
  writeJsonl(path.join(codex, 'sessions', '2026', '10', '01', 'rollout-2026-10-01T08-00-00-01a00000-0000-7000-8000-000000000002.jsonl'), [
    { type: 'session_meta', payload: { id: '01a00000-0000-7000-8000-000000000002', cwd: project, originator: 'codex_exec', source: 'exec' } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Reply ok' }] } },
  ]);

  return { root, env: { CLAUDE_CONFIG_DIR: claude, CODEX_HOME: codex }, project };
}

test('lists Claude Code and Codex sessions with titles, folders and automated flags', () => {
  const { env, project, root } = fixtureHomes();
  try {
    const sessions = listExternalSessions({ env, limit: 10 });
    const claude = sessions.find((session) => session.engine === 'claude-code');
    const codex = sessions.find((session) => session.id === CODEX_ID);
    const automated = sessions.find((session) => session.source === 'codex_exec');

    assert.equal(claude.id, CLAUDE_ID);
    assert.equal(claude.title, 'Fix failing test');
    assert.equal(claude.cwd, project);
    assert.equal(claude.automated, false);
    assert.equal(codex.title, 'Look around the repo');
    assert.equal(codex.cwd, project);
    assert.equal(automated.automated, true);
    assert.equal(listExternalSessions({ env, engine: 'codex', limit: 10 }).every((session) => session.engine === 'codex'), true);
    assert.equal(listExternalSessions({ env, limit: 10, hideCwd: path.dirname(project) }).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('turns a Claude Code session into chat messages with its tool steps', async () => {
  const { env, root } = fixtureHomes();
  try {
    const session = await readExternalSession('claude-code', CLAUDE_ID, { env });
    const [user, answer, command] = session.messages;
    assert.equal(user.type, 'user');
    assert.equal(user.content, 'Fix the failing test');
    assert.equal(answer.type, 'assistant');
    assert.equal(answer.content, 'Looking at it.\n\nFixed the off-by-one.');
    assert.equal(answer.agentEvents.length, 1);
    assert.equal(answer.agentEvents[0].data.tool, 'run_command');
    assert.equal(answer.agentEvents[0].data.args.command, 'npm test');
    assert.deepEqual(answer.agentEvents[0].result, { success: false, error: '1 failing' });
    assert.equal(command.content, '/review src');
    assert.equal(session.messages.some((message) => /subagent noise|meta/.test(message.content)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('turns a Codex session into chat messages and skips injected context', async () => {
  const { env, root } = fixtureHomes();
  try {
    const session = await readExternalSession('codex', CODEX_ID, { env });
    assert.equal(session.title, 'Look around the repo');
    assert.equal(session.messages.length, 2);
    assert.equal(session.messages[0].content, 'List the files');
    assert.equal(session.messages[1].content, 'One file: a.txt');
    assert.deepEqual(session.messages[1].agentEvents[0].data.args, { command: 'ls' });
    assert.equal(session.messages[1].agentEvents[0].result.success, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('session ids cannot point outside the session folders', () => {
  const { env, root } = fixtureHomes();
  try {
    assert.equal(findSessionFile('claude-code', '../../etc/passwd', env), null);
    assert.equal(findSessionFile('codex', 'x/../../y', env), null);
    assert.ok(findSessionFile('codex', CODEX_ID, env));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reads plan usage from Claude Code events and Codex session files', () => {
  const claude = claudeUsageFromEvent({
    status: 'allowed_warning',
    unifiedWindows: { five_hour: { utilization: 0.42, resetsAt: 1800000000 }, seven_day: { utilization: 0.1, resetsAt: 1800500000 } },
  });
  assert.equal(claude.status, 'allowed_warning');
  assert.deepEqual(claude.windows.map((window) => [window.label, window.usedPercent, window.resetsAt]), [
    ['5-hour', 42, 1800000000000],
    ['Weekly', 10, 1800500000000],
  ]);

  const codex = codexUsageFromRateLimits({ primary: { used_percent: 8, window_minutes: 43200, resets_at: 1 }, plan_type: 'free' });
  assert.equal(codex.plan, 'free');
  assert.equal(codex.windows[0].label, 'Monthly');

  const { env, root } = fixtureHomes();
  try {
    const latest = latestCodexUsage({ env });
    assert.equal(latest.plan, 'plus');
    assert.deepEqual(latest.windows.map((window) => `${window.label} ${window.usedPercent}`), ['5-hour 12.5', 'Weekly 40']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a session copied to another folder or a forked Codex thread is listed once', () => {
  const { env, root, project } = fixtureHomes();
  try {
    // Claude Code keeps a copy when a session is resumed from another folder.
    const copy = path.join(env.CLAUDE_CONFIG_DIR, 'projects', '-old-place', `${CLAUDE_ID}.jsonl`);
    writeJsonl(copy, [
      { type: 'user', cwd: project, entrypoint: 'cli', timestamp: '2026-09-01T10:00:00.000Z', message: { role: 'user', content: 'older copy' } },
    ]);
    fs.utimesSync(copy, new Date('2026-09-01'), new Date('2026-09-01'));
    // A forked thread's file starts with its parent's session_meta.
    const forkId = '01a00000-0000-7000-8000-000000000003';
    writeJsonl(path.join(env.CODEX_HOME, 'sessions', '2026', '10', '03', `rollout-2026-10-03T09-00-00-${forkId}.jsonl`), [
      { type: 'session_meta', payload: { id: CODEX_ID, cwd: project, originator: 'codex-tui' } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Forked question' }] } },
    ]);

    const keys = listExternalSessions({ env, limit: 20 }).map((session) => `${session.engine}:${session.id}`);
    assert.equal(keys.length, new Set(keys).size);
    assert.ok(keys.includes(`codex:${forkId}`));
    assert.ok(keys.includes(`codex:${CODEX_ID}`));
    assert.notEqual(findSessionFile('claude-code', CLAUDE_ID, env), copy);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
