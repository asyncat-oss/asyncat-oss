import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Tools that were merged into others keep their old names as aliases, so
// saved profiles, Cats, chat approvals, skills and old chats still work. The
// alias runs the new tool with reshaped arguments and is never listed.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `asyncat-aliases-${randomUUID()}-`));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
process.env.ASYNCAT_HOME = path.join(scratch, 'home');

const { default: db } = await import('../src/db/client.js');
const { initializeAgent } = await import('../src/agent/index.js');
const { toolRegistry } = await import('../src/agent/tools/toolRegistry.js');
const { AgentRuntime } = await import('../src/agent/AgentRuntime.js');
const toolAliasesModule = await import('../src/agent/tools/toolAliases.js');

await initializeAgent();

// A pretend old name for list_directory, whose argument was called "folder".
toolRegistry.registerAlias('list_folder_old', { to: 'list_directory', args: (old) => ({ path: old.folder }) });

test.after(() => {
  db.close();
  fs.rmSync(scratch, { recursive: true, force: true });
});

function workspace() {
  const dir = fs.mkdtempSync(path.join(scratch, 'ws-'));
  fs.writeFileSync(path.join(dir, 'pears.md'), 'Pears ripen best off the tree.\n');
  return dir;
}

test('an alias resolves to the new tool with adapted arguments', () => {
  assert.deepEqual(toolRegistry.resolve('list_folder_old', { folder: 'notes' }), { name: 'list_directory', args: { path: 'notes' }, aliasOf: 'list_folder_old' });
  assert.deepEqual(toolRegistry.resolve('read_file', { path: 'a' }), { name: 'read_file', args: { path: 'a' }, aliasOf: null });
  assert.deepEqual(toolRegistry.resolve('no_such_tool', {}), { name: 'no_such_tool', args: {}, aliasOf: null });
  assert.equal(toolRegistry.canonicalName('list_folder_old'), 'list_directory');
  assert.equal(toolRegistry.canonicalName('read_file'), 'read_file');
  assert.equal(toolRegistry.isAlias('list_folder_old'), true);
  assert.equal(toolRegistry.isAlias('read_file'), false);
});

test('aliases are not tools: they are never listed', () => {
  const names = new Set(toolRegistry.names());
  for (const { name } of toolRegistry.aliases()) {
    assert.ok(!names.has(name), `${name} is listed as a tool`);
    assert.equal(toolRegistry.has(name), false);
  }
  assert.ok(!toolRegistry.all().some((tool) => tool.name === 'list_folder_old'));
});

test('executing an old name runs the new tool', async () => {
  const dir = workspace();
  const result = await toolRegistry.execute('list_folder_old', { folder: '.' }, { workingDir: dir });
  assert.equal(result.success, true);
  assert.match(JSON.stringify(result), /pears\.md/);
});

test('approvals and allow-lists saved under an old name cover the new tool', () => {
  const runtime = new AgentRuntime({ aiClient: null, model: 'demo', workingDir: workspace(), allowedTools: ['list_folder_old', 'read_file'] });
  assert.equal(runtime.allowedTools.has('list_directory'), true);
  assert.equal(runtime.allowedTools.has('list_folder_old'), true);
  assert.equal(runtime.allowedTools.has('write_file'), false);
  runtime.sessionApprovedTools.add('list_folder_old');
  assert.equal(runtime.sessionApprovedTools.has('list_directory'), true);
  const allowed = runtime._toolDefinitionsForMode('look at the notes').map((tool) => tool.name);
  assert.ok(allowed.includes('list_directory'));
  assert.ok(!allowed.includes('write_file'));
});

test('a model that calls an old name gets the new tool in a run', async () => {
  const dir = workspace();
  const turns = [
    '<tool_call>\n{"name": "list_folder_old", "arguments": {"folder": "."}}\n</tool_call>',
    '**Answer:** There is one note, pears.md.',
  ];
  let turn = 0;
  const create = async (params) => {
    if (!params.stream) return { choices: [{ index: 0, message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }] };
    const text = turns[Math.min(turn++, turns.length - 1)];
    return (async function* stream() {
      yield { choices: [{ index: 0, delta: { content: text }, finish_reason: null }] };
      yield { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
    })();
  };
  const events = [];
  const runtime = new AgentRuntime({
    aiClient: { client: { chat: { completions: { create } } } },
    model: 'demo-model',
    supportsNativeTools: false,
    workingDir: dir,
    workspaceRoot: dir,
    autoApprove: true,
    ephemeral: true,
    onEvent: (event) => events.push(event),
  });
  await runtime.run('What notes are in this folder?', []);
  const started = events.filter((event) => event.type === 'tool_start').map((event) => event.data.tool);
  assert.deepEqual(started, ['list_directory']);
  const result = events.find((event) => event.type === 'tool_result')?.data.result;
  assert.equal(result?.success, true);
  assert.match(JSON.stringify(result), /pears\.md/);
});

test('every old name points at a registered tool, and none is still a tool', () => {
  const { TOOL_ALIASES } = toolAliasesModule;
  for (const [name, spec] of Object.entries(TOOL_ALIASES)) {
    assert.ok(toolRegistry.has(spec.to), `${name} points at ${spec.to}, which is not registered`);
    assert.equal(toolRegistry.has(name), false, `${name} is still registered as a tool`);
    assert.equal(toolRegistry.isAlias(name), true);
  }
});

test('the old browser tools map onto the one browser set', () => {
  const check = (name, args, expected) => {
    const resolved = toolRegistry.resolve(name, args);
    assert.deepEqual({ name: resolved.name, args: resolved.args }, expected, name);
    assert.equal(toolRegistry.validateArgs(resolved.name, resolved.args).valid, true, `${name} → ${resolved.name} args are valid`);
  };
  check('browse_url', { url: 'https://example.com', wait_for: '#app', timeout: 20 }, { name: 'preview_get_text', args: { url: 'https://example.com' } });
  check('screenshot_page', { url: 'https://example.com', full_page: true }, { name: 'preview_screenshot', args: { url: 'https://example.com', full_page: true } });
  check('browser_navigate', { url: 'https://example.com' }, { name: 'preview_navigate', args: { url: 'https://example.com' } });
  check('browser_click', { selector: '#buy', wait: 500 }, { name: 'preview_click', args: { selector: '#buy' } });
  check('browser_type', { selector: '#q', text: 'pears', press_enter: true }, { name: 'preview_type', args: { selector: '#q', text: 'pears', submit: true } });
  check('browser_fill', { fields: { '#name': 'Ann', '#city': 'Leeds' }, submit_selector: 'button[type=submit]' }, {
    name: 'preview_fill',
    args: { fields: [{ selector: '#name', value: 'Ann' }, { selector: '#city', value: 'Leeds' }], submit: 'button[type=submit]' },
  });
  check('browser_extract', { selector: '.price' }, { name: 'preview_get_text', args: { selector: '.price' } });
  check('browser_extract', { structure: { title: 'h1', price: '.price' } }, { name: 'preview_get_text', args: { selector: 'h1, .price' } });
  check('browser_extract', { selector: 'a.download', attribute: 'href', multiple: true }, { name: 'preview_get_text', args: { selector: 'a.download', attribute: 'href' } });
});
