import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-secret-masking-'));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');

const { listMcpServers, mergeMcpEnv, MASKED_ENV_VALUE } = await import('../src/agent/tools/mcpTools.js');
const { maskSecret } = await import('../src/config/configController.js');

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test('MCP server listings show env keys but never their values', () => {
  const configPath = path.join(scratch, 'mcp.json');
  fs.writeFileSync(configPath, JSON.stringify({
    mcpServers: { github: { command: 'npx', args: ['server'], env: { GITHUB_TOKEN: 'ghp_realsecretvalue' } } },
  }));

  const [server] = listMcpServers(configPath);
  assert.deepEqual(server.env, { GITHUB_TOKEN: MASKED_ENV_VALUE });
  assert.equal(JSON.stringify(server).includes('ghp_realsecretvalue'), false);
});

test('sending the masked placeholder back keeps the stored env value', () => {
  const stored = { GITHUB_TOKEN: 'ghp_realsecretvalue', REGION: 'eu' };
  assert.deepEqual(
    mergeMcpEnv(stored, { GITHUB_TOKEN: MASKED_ENV_VALUE, REGION: 'us', NEW_KEY: 'x' }),
    { GITHUB_TOKEN: 'ghp_realsecretvalue', REGION: 'us', NEW_KEY: 'x' },
  );
  assert.deepEqual(mergeMcpEnv(undefined, { TOKEN: MASKED_ENV_VALUE }), { TOKEN: MASKED_ENV_VALUE });
  assert.deepEqual(mergeMcpEnv(stored, 'not-an-object'), {});
});

test('maskSecret reveals at most the last four characters', () => {
  assert.equal(maskSecret(''), '');
  assert.equal(maskSecret(undefined), '');
  assert.equal(maskSecret('short-key'), '****');
  assert.equal(maskSecret('sk-abcdefghijklmnop1234'), '****1234');
});
