import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// The approval gate decides whether a tool call runs. These tests use the
// runtime's own permission check with a throwaway database.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-approval-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');

const { AgentRuntime } = await import('../src/agent/AgentRuntime.js');
const { normalizeApprovalDecision, approvalAllows, approvalCoversRun } = await import('../src/agent/approvalDecisions.js');
const { editFileTool } = await import('../src/agent/tools/fileTools.js');

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function gate(overrides = {}) {
  return Object.assign(Object.create(AgentRuntime.prototype), {
    agentMode: 'action',
    autoApprove: false,
    sessionApprovedTools: new Set(),
    requestPermission: null,
    session: null,
    workingDir: scratch,
    _throwIfAborted() {},
    _buildPermissionDiff() { return null; },
  }, overrides);
}

const call = (tool) => ({ toolCall: { tool_name: tool, call_id: 'c1', arguments: {} }, permission: 'dangerous', actionDesc: tool, round: 1 });

test('without anyone to approve, dangerous tools are denied', async () => {
  const result = await gate()._checkPermission(call('run_command'));
  assert.equal(result.allowed, false);
  assert.equal(result.decision, 'no_approver');
});

test('safe tools, auto-approve and pre-approved tools still run without an approver', async () => {
  assert.equal((await gate()._checkPermission({ ...call('read_file'), permission: 'safe' })).allowed, true);
  assert.equal((await gate({ autoApprove: true })._checkPermission(call('run_command'))).allowed, true);
  assert.equal((await gate({ sessionApprovedTools: new Set(['run_command']) })._checkPermission(call('run_command'))).allowed, true);
});

test('every "allow" answer runs the call, and the lasting ones cover the rest of the run', async () => {
  for (const answer of ['allow', 'allow_session', 'allow_always', 'allow_always_tool']) {
    const runtime = gate({ requestPermission: async () => ({ decision: answer }) });
    const result = await runtime._checkPermission(call('run_command'));
    assert.equal(result.allowed, true, answer);
    assert.equal(runtime.sessionApprovedTools.has('run_command'), answer !== 'allow', answer);
  }
  const denied = await gate({ requestPermission: async () => ({ decision: 'something-else' }) })._checkPermission(call('run_command'));
  assert.equal(denied.allowed, false);
});

test('decision names are normalised the same way everywhere', () => {
  assert.equal(normalizeApprovalDecision('allow_always_command'), 'allow_always');
  assert.equal(normalizeApprovalDecision(undefined), 'deny');
  assert.equal(approvalAllows('deny'), false);
  assert.equal(approvalCoversRun('allow'), false);
  assert.equal(approvalCoversRun('allow_session'), true);
});

test('the approval diff for edit_file shows the change the tool makes', async () => {
  const folder = fs.mkdtempSync(path.join(scratch, 'diff-'));
  const file = path.join(folder, 'fruit.txt');
  const runtime = Object.assign(Object.create(AgentRuntime.prototype), { workingDir: folder });
  const diffFor = (args) => runtime._buildPermissionDiff('edit_file', { path: 'fruit.txt', ...args });
  const changed = (diff) => diff.split('\n').filter((line) => /^[-+][^-+]/.test(line));

  // old_string appears twice; start_line/end_line pick the second.
  fs.writeFileSync(file, 'pears = 1\nplums = 2\npears = 1\n');
  const ranged = { old_string: 'pears = 1', new_string: 'pears = 9', start_line: 3, end_line: 3 };
  const diff = diffFor(ranged);
  assert.deepEqual(changed(diff), ['-pears = 1', '+pears = 9']);
  assert.equal(diff.split('\n').indexOf('-pears = 1'), 4, 'the third line changes, not the first');
  await editFileTool.execute({ path: 'fruit.txt', ...ranged }, { workingDir: folder });
  assert.equal(fs.readFileSync(file, 'utf8'), 'pears = 1\nplums = 2\npears = 9\n');

  // A call the tool would refuse shows no diff.
  assert.equal(diffFor({ old_string: 'pears', new_string: 'apples' }), null, 'ambiguous');
  assert.equal(diffFor({ old_string: 'quinces', new_string: 'apples' }), null, 'not found');

  // A match with other indentation shows the lines that change.
  fs.writeFileSync(file, 'fruit:\n  pears: 1\n  plums: 2\n');
  assert.deepEqual(changed(diffFor({ old_string: 'pears: 1\nplums: 2', new_string: '  pears: 3\n  plums: 4' })),
    ['-  pears: 1', '+  pears: 3', '-  plums: 2', '+  plums: 4']);
});
