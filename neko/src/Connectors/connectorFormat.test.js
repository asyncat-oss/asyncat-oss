import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadSizeText, joinCommand, pairsText, parsePairs, splitCommand, statusLine, whereLine } from './connectorFormat.js';

test('status reads in plain words', () => {
  assert.equal(statusLine({ status: 'connected', toolCount: 12 }), 'Connected · 12 tools');
  assert.equal(statusLine({ status: 'connected', toolCount: 1 }), 'Connected · 1 tool');
  assert.equal(statusLine({ status: 'needs_sign_in' }), 'Needs sign-in');
  assert.equal(statusLine({ status: 'whatever' }), 'Starting…');
  assert.equal(whereLine({ kind: 'remote', url: 'https://mcp.example.com/mcp' }), 'mcp.example.com');
  assert.equal(whereLine({ kind: 'local', command: 'npx', args: ['-y', 'pkg'] }), 'npx -y pkg');
});

test('download sizes say how sure they are', () => {
  assert.equal(downloadSizeText({ bytes: 12_400_000, approximate: true, packages: 85 }), 'up to about 11.8 MB (85 packages)');
  assert.equal(downloadSizeText({ bytes: 700, ownFilesOnly: true, approximate: true, packages: 1 }), 'up to about 700 B, plus the packages it needs');
  assert.equal(downloadSizeText({ bytes: null }), 'an unknown amount');
  assert.equal(downloadSizeText({ bytes: 2_000_000, approximate: true, shallow: true, dependencies: 3 }), 'up to about 1.91 MB for the package itself, plus 3 packages it needs');
});

test('commands split and join with quotes kept', () => {
  assert.deepEqual(splitCommand('npx -y @scope/pkg --dir "/home/me/My Notes"'), { command: 'npx', args: ['-y', '@scope/pkg', '--dir', '/home/me/My Notes'] });
  assert.deepEqual(splitCommand('  node  server.js  '), { command: 'node', args: ['server.js'] });
  assert.deepEqual(splitCommand('run ""'), { command: 'run', args: [''] });
  assert.equal(joinCommand('npx', ['-y', 'pkg', '/a b']), 'npx -y pkg "/a b"');
  assert.deepEqual(splitCommand(joinCommand('node', ['a b', 'c'])), { command: 'node', args: ['a b', 'c'] });
});

test('key=value rows', () => {
  assert.deepEqual(parsePairs('A=1\n B = two words \nbroken\n=nokey'), { A: '1', B: 'two words' });
  assert.equal(pairsText({ A: '1', B: '2' }), 'A=1\nB=2');
  assert.deepEqual(parsePairs('Authorization: Bearer x', ':'), { Authorization: 'Bearer x' });
});

test('connector forms round-trip, keeping masked keys masked', async () => {
  const { localFormFrom, localPayload, remoteFormFrom, remotePayload } = await import('./connectorFormat.js');
  const local = { name: 'notes', title: 'notes', command: 'npx', args: ['-y', 'pkg', '/a b'], env: { KEY: '********' }, cwd: null };
  const localForm = localFormFrom(local);
  assert.equal(localForm.title, '', 'the default title stays empty');
  assert.deepEqual(localPayload(localForm), { command: 'npx', args: ['-y', 'pkg', '/a b'], env: { KEY: '********' } });
  const remote = { name: 'cloud', title: 'Cloud notes', url: 'https://x.test/mcp', transport: 'http', headers: { Authorization: '********' }, oauth: null };
  assert.deepEqual(remotePayload(remoteFormFrom(remote)), { url: 'https://x.test/mcp', type: 'http', headers: { Authorization: '********' }, title: 'Cloud notes' });
  assert.equal(remotePayload({ ...remoteFormFrom(null), url: ' https://y.test ', clientId: 'abc' }).oauth.clientId, 'abc');
});

test('connector tool names read as "Connector · tool"', async () => {
  const { connectorToolLabel, connectorToolParts } = await import('./connectorFormat.js');
  assert.equal(connectorToolLabel('mcp__team_notes__wipe_notes'), 'Team notes · wipe_notes');
  assert.deepEqual(connectorToolParts('mcp__github__create_issue'), { connector: 'Github', tool: 'create_issue' });
  assert.equal(connectorToolLabel('read_file'), null);
});
