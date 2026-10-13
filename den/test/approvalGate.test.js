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
