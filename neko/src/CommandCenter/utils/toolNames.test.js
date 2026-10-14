import test from 'node:test';
import assert from 'node:assert/strict';
import { RENAMED_TOOLS, currentToolName, editedPaths } from './toolNames.js';
import { TOOL_ALIASES } from '../../../../den/src/agent/tools/toolAliases.js';

test('old tool names map to the tools the backend runs instead', () => {
  const backend = Object.fromEntries(Object.entries(TOOL_ALIASES).map(([name, spec]) => [name, typeof spec === 'string' ? spec : spec.to]));
  assert.deepEqual(RENAMED_TOOLS, backend);
  assert.equal(currentToolName('patch_file'), 'edit_file');
  assert.equal(currentToolName('browse_url'), 'preview_get_text');
  assert.equal(currentToolName('read_file'), 'read_file');
  // Events without a tool name get a string, so callers can use startsWith.
  assert.equal(currentToolName(undefined), '');
  assert.equal(currentToolName(null), '');
  assert.equal(currentToolName('constructor'), 'constructor');
});

test('edited files come from edit_file and apply_patch calls, old names too', () => {
  assert.deepEqual(editedPaths('edit_file', { path: 'a.js' }), ['a.js']);
  assert.deepEqual(editedPaths('patch_file', { path: 'b.js' }), ['b.js']);
  assert.deepEqual(editedPaths('apply_patch', { edits: [{ path: 'a.js' }, { path: 'a.js' }, { path: 'c.js' }] }), ['a.js', 'c.js']);
  assert.deepEqual(editedPaths('apply_patch', { patch: '…' }, { results: [
    { path: 'a.js', action: 'edited' }, { path: 'new.js', action: 'created' }, { path: 'old.js', action: 'deleted' },
  ] }), ['a.js', 'new.js']);
  assert.deepEqual(editedPaths('search_replace_block', { path: 'd.js', edit_blocks: '…' }), ['d.js']);
  assert.deepEqual(editedPaths('read_file', { path: 'a.js' }), []);
});
