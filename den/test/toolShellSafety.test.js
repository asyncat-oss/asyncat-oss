import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { diskUsageTool, portScanTool } from '../src/agent/tools/osTools.js';
import { jsonQueryTool } from '../src/agent/tools/dataTools.js';

// These tools are permission:'safe', so the agent runs them without asking the
// user. They used to build a shell command string from model-supplied values,
// which let prompt-injected model output run arbitrary commands. Each tool now
// passes those values as argv entries (no shell), so a payload with shell
// metacharacters must run no second command.

function freshMarker() {
  return path.join(os.tmpdir(), `asyncat-shell-safety-${process.pid}-${randomUUID()}`);
}

test('disk_usage does not run injected shell commands via path', async () => {
  const marker = freshMarker();
  await diskUsageTool.execute({ path: `/ ; touch ${marker}` });
  assert.equal(fs.existsSync(marker), false, 'injected command must not have run');
  if (fs.existsSync(marker)) fs.rmSync(marker, { force: true });
});

test('disk_usage still reports usage for a real path', async () => {
  const res = await diskUsageTool.execute({ path: '/' });
  assert.equal(res.success, true);
  assert.ok(res.total, 'expected a total size field');
});

test('port_scan coerces a non-integer port and runs nothing from it', async () => {
  const marker = freshMarker();
  const res = await portScanTool.execute({ port: `0; touch ${marker}` });
  assert.equal(fs.existsSync(marker), false, 'injected command must not have run');
  assert.equal(res.port, null, 'a non-numeric port must not be passed through');
  if (fs.existsSync(marker)) fs.rmSync(marker, { force: true });
});

test('json_query does not run injected shell commands via query', async (t) => {
  // jq is optional; when it is absent json_query uses a pure-JS fallback that
  // never touches a shell, so this test is only meaningful (and only needs to
  // run) when jq is installed.
  const res = await jsonQueryTool.execute({ data: { a: 1 }, query: '.a' }, { workingDir: process.cwd() });
  if (res.engine !== 'jq') { t.skip('jq not installed'); return; }

  const marker = freshMarker();
  await jsonQueryTool.execute({ data: { a: 1 }, query: `. ; touch ${marker}` }, { workingDir: process.cwd() });
  assert.equal(fs.existsSync(marker), false, 'injected command must not have run');
  if (fs.existsSync(marker)) fs.rmSync(marker, { force: true });
});
