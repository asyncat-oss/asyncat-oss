import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-secret-masking-'));
process.env.DB_PATH = path.join(scratch, 'asyncat.db');

process.env.ASYNCAT_DATA_PATH = path.join(scratch, 'data');
const { MASKED_VALUE, mergeMasked } = await import('../src/connectors/connectorConfig.js');
const { listConnectors } = await import('../src/connectors/connectorManager.js');
const { maskSecret } = await import('../src/config/configController.js');

after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test('connector listings show env keys but never their values', () => {
  const configPath = path.join(scratch, 'data', 'mcp.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    mcpServers: { github: { command: 'npx', args: ['server'], env: { GITHUB_TOKEN: 'ghp_realsecretvalue' }, disabled: true } },
  }));

  const [server] = listConnectors();
  assert.deepEqual(server.env, { GITHUB_TOKEN: MASKED_VALUE });
  assert.equal(JSON.stringify(server).includes('ghp_realsecretvalue'), false);
});

test('sending the masked placeholder back keeps the stored env value', () => {
  const stored = { GITHUB_TOKEN: 'ghp_realsecretvalue', REGION: 'eu' };
  assert.deepEqual(
    mergeMasked(stored, { GITHUB_TOKEN: MASKED_VALUE, REGION: 'us', NEW_KEY: 'x' }),
    { GITHUB_TOKEN: 'ghp_realsecretvalue', REGION: 'us', NEW_KEY: 'x' },
  );
  assert.deepEqual(mergeMasked(undefined, { TOKEN: MASKED_VALUE }), {});
  assert.deepEqual(mergeMasked(stored, 'not-an-object'), {});
});

test('maskSecret reveals at most the last four characters', () => {
  assert.equal(maskSecret(''), '');
  assert.equal(maskSecret(undefined), '');
  assert.equal(maskSecret('short-key'), '****');
  assert.equal(maskSecret('sk-abcdefghijklmnop1234'), '****1234');
});
