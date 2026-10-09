import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// The agent prompt carries a core set of tool definitions instead of all of
// them; tool_search makes the rest callable. These tests cover the selection
// and discovery logic on the runtime, using the real tool registry.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-toolsearch-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');

const { AgentRuntime } = await import('../src/agent/AgentRuntime.js');
const { initializeAgent } = await import('../src/agent/index.js');
const { toolRegistry } = await import('../src/agent/tools/toolRegistry.js');
const { toolSearchTool } = await import('../src/agent/tools/toolSearchTool.js');

await initializeAgent().catch(() => {});

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const proto = AgentRuntime.prototype;
const allDefs = () => proto._rankToolsForGoal(toolRegistry.all(), 'fix the bug in the parser');

test('the full catalog is far larger than the core sets', () => {
  assert.ok(toolRegistry.all().length > 100, `expected the full catalog, got ${toolRegistry.all().length}`);
  assert.ok(toolRegistry.has('tool_search'));
});

test('text mode describes a small core set that includes tool_search and the essentials', () => {
  const core = proto._selectCoreTools.call({ supportsNativeTools: false }, allDefs());
  const names = core.map(t => t.name);
  assert.ok(core.length <= 24, `text core set too big: ${core.length}`);
  for (const name of ['tool_search', 'read_file', 'run_command', 'ask_user']) {
    assert.ok(names.includes(name), `${name} missing from the core set`);
  }
});

test('native mode stays well under the 128-tool API limit', () => {
  const core = proto._selectCoreTools.call({ supportsNativeTools: true }, allDefs());
  assert.ok(core.length <= 40 && core.length < 128, `native core set: ${core.length}`);
});

test('small sets are sent whole, without tool_search', () => {
  const small = allDefs().filter(t => ['read_file', 'list_directory', 'tool_search'].includes(t.name));
  const core = proto._selectCoreTools.call({ supportsNativeTools: false }, small);
  assert.deepEqual(core.map(t => t.name).sort(), ['list_directory', 'read_file']);
});

test('sets that cannot reach tool_search are never trimmed', () => {
  const scoped = allDefs().filter(t => t.name !== 'tool_search');
  const core = proto._selectCoreTools.call({ supportsNativeTools: false }, scoped);
  assert.equal(core.length, scoped.length);
});

test('tool_search finds tools outside the core set and makes them callable natively', () => {
  const defs = allDefs();
  const runtime = {
    supportsNativeTools: true,
    loadedToolNames: new Set(),
    _toolDefinitionsForMode: () => defs,
    _selectCoreTools: proto._selectCoreTools,
  };
  runtime.coreToolNames = proto._selectCoreTools.call(runtime, defs).map(t => t.name);
  assert.ok(!runtime.coreToolNames.includes('git_status'), 'git_status should not be in the default core set');

  const found = proto._discoverTools.call(runtime, 'git status', 5, defs);
  assert.equal(found[0].name, 'git_status');

  const active = proto._activeNativeToolNames.call(runtime);
  assert.ok(active.includes('git_status'), 'a discovered tool must be declared on the next request');
  assert.ok(active.length <= 128);
});

test('tool_search only returns tools the run is allowed to use', () => {
  const planSafe = allDefs().filter(t => t.permission === 'safe');
  const runtime = { loadedToolNames: new Set() };
  const found = proto._discoverTools.call(runtime, 'delete file', 10, planSafe);
  assert.ok(found.every(t => t.permission === 'safe'));
  assert.ok(!found.some(t => t.name === 'file_delete'));
});

test('the tool_search tool reports matches and a hint when nothing matches', async () => {
  const defs = allDefs();
  const runtime = { loadedToolNames: new Set() };
  const context = { discoverTools: (query, limit) => proto._discoverTools.call(runtime, query, limit, defs) };

  const hit = await toolSearchTool.execute({ query: 'screenshots' }, context);
  assert.equal(hit.success, true);
  assert.ok(hit.tools.some(t => t.name.includes('screenshot')), JSON.stringify(hit.tools.map(t => t.name)));
  assert.ok(hit.tools.every(t => t.parameters), 'results must include parameter schemas');

  const miss = await toolSearchTool.execute({ query: 'zzqqxx' }, context);
  assert.equal(miss.count, 0);
  assert.match(miss.note, /Try different/);
});
