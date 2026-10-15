import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTools, groupTools, permissionCounts, toolGroupLabel, toolPlatforms } from './toolCatalog.js';

const tools = [
  { name: 'read_file', description: 'Read a file', category: 'file', permission: 'safe' },
  { name: 'screen_key', description: 'Press a key', category: 'screen', permission: 'dangerous' },
  { name: 'edit_file', description: 'Change a file', category: 'file', permission: 'moderate' },
  { name: 'tool_search', description: 'Find a tool', category: 'plan', permission: 'safe' },
  { name: 'todo_write', description: 'Keep a list', category: 'planning', permission: 'safe' },
  { name: 'local_rag_search', description: 'Search your folders', category: 'rag', permission: 'safe' },
  { name: 'mystery', description: 'No group given' },
];

test('group names are sentence case, with plain names for the odd keys', () => {
  assert.equal(toolGroupLabel('git'), 'Git');
  assert.equal(toolGroupLabel('file'), 'Files');
  assert.equal(toolGroupLabel('ai'), 'AI and models');
  assert.equal(toolGroupLabel('rag'), 'Document search');
  assert.equal(toolGroupLabel('task_state'), 'Task state');
  assert.equal(toolGroupLabel(''), 'General');
  assert.equal(toolGroupLabel(undefined), 'General');
});

test('a tool with no platform notes runs everywhere and needs nothing', () => {
  assert.deepEqual(toolPlatforms('read_file'), { platforms: ['mac', 'linux', 'win'], deps: null, restricted: false });
  const key = toolPlatforms('screen_key');
  assert.deepEqual(key.platforms, ['mac', 'linux']);
  assert.equal(key.restricted, true);
  assert.match(key.deps.linux, /xdotool/);
  assert.equal(toolPlatforms('screen_click').restricted, false);
});

test('the system filter keeps tools that run there, the search looks at names, descriptions and groups', () => {
  assert.deepEqual(filterTools(tools, { os: 'win' }).map((tool) => tool.name).includes('screen_key'), false);
  assert.equal(filterTools(tools, { os: 'linux' }).length, tools.length);
  assert.deepEqual(filterTools(tools, { query: 'FILE' }).map((tool) => tool.name), ['read_file', 'edit_file']);
  assert.deepEqual(filterTools(tools, { query: 'document search' }).map((tool) => tool.name), ['local_rag_search']);
  assert.deepEqual(filterTools(tools, { query: 'key', os: 'mac' }).map((tool) => tool.name), ['screen_key']);
  assert.equal(filterTools(tools, { query: '  ' }).length, tools.length);
});

test('groups keep their first order, share a name when den has two keys for it, and sort their tools', () => {
  const groups = groupTools(tools);
  assert.deepEqual(groups.map((group) => group.label), ['Files', 'Screen', 'Planning', 'Document search', 'General']);
  assert.deepEqual(groups[0].tools.map((tool) => tool.name), ['edit_file', 'read_file']);
  assert.deepEqual(groups[2].tools.map((tool) => tool.name), ['todo_write', 'tool_search']);
});

test('permission counts', () => {
  assert.deepEqual(permissionCounts(tools), { safe: 4, moderate: 1, dangerous: 1 });
  assert.deepEqual(permissionCounts(), { safe: 0, moderate: 0, dangerous: 0 });
});
