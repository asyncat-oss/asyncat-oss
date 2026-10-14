import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { childEnv, isSecretEnvName } from '../src/agent/childEnv.js';
import { SECRET_CONFIG_KEYS } from '../src/db/sealSecrets.js';
import { runFile, runProcess } from '../src/agent/tools/shared.js';
import { runCommandTool } from '../src/agent/tools/shellTools.js';
import { processSpawnTool } from '../src/agent/tools/osTools.js';
import { envGetTool } from '../src/agent/tools/systemTools.js';
import { shellSessionManager } from '../src/agent/ShellSessionManager.js';
import { agentEnv } from '../src/agent/externalAgents.js';
import { acpEnv } from '../src/agent/acp/acpAgents.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const posix = process.platform !== 'win32';
const PLANTED = {
  OPENAI_API_KEY: 'sk-planted-openai',
  HF_TOKEN: 'hf_planted',
  NOTIFY_DISCORD_WEBHOOK: 'https://discord.example/api/webhooks/planted',
  GITHUB_TOKEN: 'ghp_planted',
  ANTHROPIC_API_KEY: 'sk-ant-planted',
};

function withPlanted(fn) {
  return async () => {
    const before = {};
    for (const [name, value] of Object.entries(PLANTED)) {
      before[name] = process.env[name];
      process.env[name] = value;
    }
    try {
      await fn();
    } finally {
      for (const [name, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  };
}

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-childenv-'));
}

test('secret variable names are recognised by whole words', () => {
  for (const name of [...SECRET_CONFIG_KEYS, 'ASYNCAT_SECRET_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'AWS_SECRET_ACCESS_KEY',
    'STRIPE_SECRET', 'DB_PASSWORD', 'npm_config__authtoken', 'MY_WEBHOOK_URL', 'SOME_APIKEY']) {
    assert.equal(isSecretEnvName(name), true, name);
  }
  for (const name of ['PATH', 'HOME', 'TOKENIZERS_PARALLELISM', 'SSH_AUTH_SOCK', 'KEYBOARD_LAYOUT', 'MONKEY', 'XDG_RUNTIME_DIR', 'LANG']) {
    assert.equal(isSecretEnvName(name), false, name);
  }
});

test('childEnv drops secrets, keeps the rest, and adds extra values after', () => {
  const source = { PATH: '/usr/bin', HOME: '/home/me', OPENAI_API_KEY: 'x', NOTIFY_SLACK_WEBHOOK: 'y', ANTHROPIC_API_KEY: 'z' };
  assert.deepEqual(childEnv({ source }), { PATH: '/usr/bin', HOME: '/home/me' });
  assert.deepEqual(childEnv({ source, keep: ['ANTHROPIC_API_KEY'] }), { PATH: '/usr/bin', HOME: '/home/me', ANTHROPIC_API_KEY: 'z' });
  // Values the agent asked for on purpose are not second-guessed; null removes.
  assert.deepEqual(childEnv({ source, extra: { MY_TOKEN: 't', HOME: null } }), { PATH: '/usr/bin', MY_TOKEN: 't' });
});

test('programs the agent runs never see saved keys', { skip: !posix }, withPlanted(async () => {
  const project = tempProject();
  const show = 'echo "[$OPENAI_API_KEY][$HF_TOKEN][$NOTIFY_DISCORD_WEBHOOK][$GITHUB_TOKEN]"';
  try {
    const command = await runCommandTool.execute({ command: show }, { workingDir: project, workspaceRoot: project });
    assert.equal(command.stdout, '[][][][]');

    const tool = await runProcess(show, [], { cwd: project });
    assert.equal(tool.stdout, '[][][][]');
    assert.equal(runFile('/bin/sh', ['-c', show]).stdout.trim(), '[][][][]');

    const session = shellSessionManager.create({ agentSessionId: 'childenv-test', name: 'default', cwd: project });
    try {
      const ran = await shellSessionManager.get('childenv-test', 'default').run(show, { timeout: 10_000 });
      assert.match(ran.output, /\[\]\[\]\[\]\[\]/);
    } finally {
      shellSessionManager.close('childenv-test', 'default');
    }
    assert.ok(session.id);

    const out = path.join(project, 'spawned.txt');
    const spawned = await processSpawnTool.execute({ command: `${show} > spawned.txt` }, { workingDir: project, workspaceRoot: project });
    assert.equal(spawned.success, true, spawned.error);
    for (let i = 0; i < 100 && !(fs.existsSync(out) && fs.readFileSync(out, 'utf8').includes(']')); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(fs.readFileSync(out, 'utf8').trim(), '[][][][]');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
}));

test('coding agents keep only the key they sign in with', withPlanted(() => {
  const codex = agentEnv('codex');
  assert.equal(codex.OPENAI_API_KEY, PLANTED.OPENAI_API_KEY);
  assert.equal(codex.HF_TOKEN, undefined);
  assert.equal(codex.ANTHROPIC_API_KEY, undefined);
  assert.equal(codex.NO_COLOR, '1');

  const claude = agentEnv('claude-code');
  assert.equal(claude.ANTHROPIC_API_KEY, PLANTED.ANTHROPIC_API_KEY);
  assert.equal(claude.OPENAI_API_KEY, undefined);
  assert.equal(claude.NOTIFY_DISCORD_WEBHOOK, undefined);

  const acp = acpEnv({ env: { MY_AGENT_KEY: 'saved-for-this-agent' } });
  assert.equal(acp.MY_AGENT_KEY, 'saved-for-this-agent');
  assert.equal(acp.OPENAI_API_KEY, undefined);
  assert.equal(acp.GITHUB_TOKEN, undefined);
}));

test('env_get masks webhooks and every secret name', withPlanted(async () => {
  const one = await envGetTool.execute({ keys: ['NOTIFY_DISCORD_WEBHOOK', 'OPENAI_API_KEY', 'PATH'] });
  assert.match(one.vars.NOTIFY_DISCORD_WEBHOOK, /^\[MASKED/);
  assert.match(one.vars.OPENAI_API_KEY, /^\[MASKED/);
  assert.equal(one.vars.PATH, process.env.PATH);
  const all = await envGetTool.execute({});
  for (const name of Object.keys(PLANTED)) assert.match(all.vars[name], /^\[MASKED/, name);
}));

// Every place under den/src/agent that starts a program says which
// environment it gets: none may fall back to den's own (with the secrets).
test('every program the agent starts is given an environment', () => {
  const root = path.join(here, '..', 'src', 'agent');
  const files = fs.readdirSync(root, { recursive: true }).filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'));
  const call = /(?<![.\w])(spawn|spawnSync|execFile|execFileSync|execSync|execFileAsync)\(/g;
  const missing = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(call)) {
      const before = text.slice(Math.max(0, match.index - 40), match.index);
      if (/function\s+$|import\s*\{[^}]*$|promisify\($/.test(before)) continue;
      // The call's own text, up to the statement end.
      const rest = text.slice(match.index, match.index + 600);
      const end = rest.search(/\);\s*(\n|$)|\)\s*\.(trim|catch|then)\(/);
      const body = end === -1 ? rest : rest.slice(0, end);
      if (!/\benv\b/.test(body)) missing.push(`${file}: ${body.split('\n')[0].slice(0, 100)}`);
    }
  }
  assert.deepEqual(missing, []);
});
