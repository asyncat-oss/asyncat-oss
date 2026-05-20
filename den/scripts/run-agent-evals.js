#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { agentEvalScenarios } from '../src/agent/evals/scenarios.js';
import { fileTools, patchFileTool } from '../src/agent/tools/fileTools.js';
import { safePath, isPathInside } from '../src/agent/tools/shared.js';
import { runCommandTool } from '../src/agent/tools/shellTools.js';
import { artifactTools } from '../src/agent/tools/artifactTools.js';
import { searchTools } from '../src/agent/tools/searchTools.js';
import { browserTools } from '../src/agent/tools/browserTools.js';
import { dataTools } from '../src/agent/tools/dataTools.js';
import { dbQueryTools } from '../src/agent/tools/dbQueryTools.js';

const allToolNames = new Set([
  ...fileTools,
  ...artifactTools,
  ...searchTools,
  ...browserTools,
  ...dataTools,
  ...dbQueryTools,
].map(tool => tool.name));

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-agent-eval-'));
}

function pass(message, extra = {}) {
  return { ok: true, message, ...extra };
}

function fail(message, extra = {}) {
  return { ok: false, message, ...extra };
}

async function runScenario(scenario) {
  if (scenario.id === 'coding-patch-file') {
    const root = tempWorkspace();
    const filePath = path.join(root, 'example.js');
    fs.writeFileSync(filePath, 'export const value = 1;\n', 'utf8');
    const result = await patchFileTool.execute({
      path: 'example.js',
      old_string: 'export const value = 1;\n',
      new_string: 'export const value = 2;\n',
    }, { workingDir: root });
    const content = fs.readFileSync(filePath, 'utf8');
    return result.success && content.includes('value = 2')
      ? pass('patch_file applied an exact edit', { root })
      : fail('patch_file did not apply the expected edit', { result, content });
  }

  if (scenario.id === 'safety-path-containment') {
    const root = tempWorkspace();
    const sibling = `${root}-sibling`;
    fs.mkdirSync(sibling);
    const relativeEscape = path.relative(root, path.join(sibling, 'escape.txt'));
    let safePathRejected = false;
    try { safePath(relativeEscape, root); } catch { safePathRejected = true; }
    const commandResult = await runCommandTool.execute({
      command: 'pwd',
      cwd: path.relative(root, sibling),
    }, { workingDir: root });
    return safePathRejected && !isPathInside(sibling, root) && commandResult.success === false
      ? pass('path and cwd escape attempts were rejected')
      : fail('path containment checks failed', { safePathRejected, commandResult });
  }

  if (scenario.id === 'writing-artifact-tools') {
    const needed = ['create_artifact', 'create_markdown'];
    const missing = needed.filter(name => !allToolNames.has(name));
    return missing.length ? fail(`missing tools: ${missing.join(', ')}`) : pass('writing artifact tools are present');
  }

  if (scenario.id === 'research-navigation-tools') {
    const hasSearch = allToolNames.has('web_search');
    const hasBrowser = [...allToolNames].some(name => name.startsWith('browser_') || name === 'browse_url');
    return hasSearch && hasBrowser
      ? pass('research and navigation tools are present')
      : fail('missing research/navigation tool family', { hasSearch, hasBrowser });
  }

  if (scenario.id === 'data-tools') {
    const hasData = allToolNames.has('read_csv');
    const hasDb = allToolNames.has('db_query') && allToolNames.has('db_schema');
    return hasData && hasDb
      ? pass('data and database tools are present')
      : fail('missing data/database tool family', { hasData, hasDb });
  }

  return fail(`unknown scenario: ${scenario.id}`);
}

function optionValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return fallback;
  return process.argv[idx + 1];
}

function asResultPayload({ mode, startedAt, results, extra = {} }) {
  const passed = results.filter(item => item.ok).length;
  const failed = results.length - passed;
  return {
    success: failed === 0,
    mode,
    passed,
    failed,
    total: results.length,
    durationMs: Date.now() - startedAt,
    results,
    ...extra,
  };
}

async function runDeterministicEvals() {
  const startedAt = Date.now();
  const results = [];
  for (const scenario of agentEvalScenarios) {
    const result = await runScenario(scenario);
    results.push({
      id: scenario.id,
      genre: scenario.genre,
      ok: result.ok,
      message: result.message,
      details: Object.fromEntries(Object.entries(result).filter(([key]) => !['ok', 'message'].includes(key))),
    });
  }
  return asResultPayload({ mode: 'deterministic', startedAt, results });
}

function createLiveEvalSource() {
  const root = tempWorkspace();
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify({ type: 'module', scripts: { test: 'node check.mjs' } }, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(root, 'example.js'), 'export const value = 1;\n', 'utf8');
  fs.writeFileSync(
    path.join(root, 'check.mjs'),
    [
      "import { value } from './example.js';",
      "if (value !== 2) {",
      "  console.error(`expected value to be 2, got ${value}`);",
      "  process.exit(1);",
      "}",
      "console.log('live eval ok');",
      '',
    ].join('\n'),
    'utf8',
  );
  return root;
}

function resolveEvalIdentity(db, requestedUserId, requestedWorkspaceId) {
  const user = requestedUserId
    ? db.prepare('SELECT id, email FROM users WHERE id = ?').get(requestedUserId)
    : db.prepare('SELECT id, email FROM users ORDER BY created_at LIMIT 1').get();

  if (!user) {
    throw new Error('Live eval needs a local Asyncat user. Sign in once, or pass --user-id.');
  }

  const workspace = requestedWorkspaceId
    ? db.prepare('SELECT id, name FROM workspaces WHERE id = ? AND owner_id = ?').get(requestedWorkspaceId, user.id)
    : db.prepare('SELECT id, name FROM workspaces WHERE owner_id = ? ORDER BY created_at LIMIT 1').get(user.id);

  if (!workspace) {
    throw new Error('Live eval needs a workspace for the selected user. Create one in the app, or pass --workspace-id.');
  }

  return { userId: user.id, workspaceId: workspace.id, userEmail: user.email, workspaceName: workspace.name };
}

async function runLiveModelEval() {
  const startedAt = Date.now();
  const keepSandbox = process.argv.includes('--keep-sandbox');
  const maxRounds = Math.max(1, Math.min(30, Number(optionValue('--max-rounds', 10)) || 10));
  const requestedUserId = optionValue('--user-id', process.env.ASYNCAT_EVAL_USER_ID || null);
  const requestedWorkspaceId = optionValue('--workspace-id', process.env.ASYNCAT_EVAL_WORKSPACE_ID || null);
  let sourceRoot = null;
  let sandbox = null;
  let cleanupUserId = null;

  try {
    const [
      { default: db },
      { AgentRuntime },
      { getAiClientForUser },
      { createSandbox, deleteSandbox },
    ] = await Promise.all([
      import('../src/db/client.js'),
      import('../src/agent/AgentRuntime.js'),
      import('../src/ai/controllers/ai/clientFactory.js'),
      import('../src/agent/SandboxManager.js'),
    ]);

    const identity = resolveEvalIdentity(db, requestedUserId, requestedWorkspaceId);
    cleanupUserId = identity.userId;
    const provider = getAiClientForUser(identity.userId);
    sourceRoot = createLiveEvalSource();
    const created = createSandbox({
      userId: identity.userId,
      workspaceId: identity.workspaceId,
      name: 'live-model-eval',
      sourcePath: sourceRoot,
      strategy: 'copy',
    });
    sandbox = created.sandbox;

    const events = [];
    const agent = new AgentRuntime({
      aiClient: provider.client,
      model: provider.model,
      isLocal: provider.isLocal,
      supportsNativeTools: provider.supportsNativeTools,
      userId: identity.userId,
      workspaceId: identity.workspaceId,
      workingDir: sandbox.sandboxPath,
      workspaceRoot: sandbox.sandboxPath,
      maxRounds,
      autoApprove: true,
      providerInfo: provider.providerInfo,
      agentMode: 'action',
      usageContext: { operation: 'agent-live-eval' },
      onEvent: (event) => {
        events.push({
          type: event?.type || 'event',
          tool: event?.data?.tool || null,
          round: event?.data?.round ?? null,
        });
      },
    });

    const goal = [
      'You are running an Asyncat live-model eval in a disposable sandbox.',
      'Read example.js first, then use patch_file or another precise file-edit tool to change the exported value from 1 to 2.',
      'Run npm test after the edit. Keep all work inside the current sandbox and do not install packages.',
    ].join('\n');

    const result = await agent.run(goal);
    const validation = spawnSync(process.execPath, ['check.mjs'], {
      cwd: sandbox.sandboxPath,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finalContent = fs.readFileSync(path.join(sandbox.sandboxPath, 'example.js'), 'utf8');
    const ok = validation.status === 0 && finalContent.includes('value = 2');
    const toolsUsed = events.filter(event => event.type === 'tool_start').map(event => event.tool).filter(Boolean);
    const resultItem = ok
      ? pass('real agent edited and validated a disposable sandbox', {
          sessionId: result.session?.id || null,
          rounds: result.session?.totalRounds || 0,
          toolsUsed,
          validationStdout: validation.stdout?.trim() || '',
        })
      : fail('live sandbox validation failed', {
          sessionId: result.session?.id || null,
          rounds: result.session?.totalRounds || 0,
          toolsUsed,
          answer: result.answer,
          finalContent,
          validationStatus: validation.status,
          validationStdout: validation.stdout || '',
          validationStderr: validation.stderr || '',
        });

    const payload = asResultPayload({
      mode: 'live',
      startedAt,
      results: [{
        id: 'live-model-sandbox-edit',
        genre: 'live',
        ok: resultItem.ok,
        message: resultItem.message,
        details: Object.fromEntries(Object.entries(resultItem).filter(([key]) => !['ok', 'message'].includes(key))),
      }],
      extra: {
        model: provider.model,
        isLocal: provider.isLocal,
        userId: identity.userId,
        workspaceId: identity.workspaceId,
        sandboxId: sandbox.id,
        sandboxPath: keepSandbox ? sandbox.sandboxPath : null,
      },
    });

    if (!keepSandbox) {
      deleteSandbox(identity.userId, sandbox.id, { force: true });
      sandbox = null;
      fs.rmSync(sourceRoot, { recursive: true, force: true });
      sourceRoot = null;
    }

    return payload;
  } catch (err) {
    return asResultPayload({
      mode: 'live',
      startedAt,
      results: [{
        id: 'live-model-sandbox-edit',
        genre: 'live',
        ok: false,
        message: err.message || String(err),
        details: {
          sandboxId: sandbox?.id || null,
          sandboxPath: keepSandbox ? sandbox?.sandboxPath || null : null,
        },
      }],
    });
  } finally {
    if (!keepSandbox && sandbox && cleanupUserId) {
      try {
        const { deleteSandbox } = await import('../src/agent/SandboxManager.js');
        deleteSandbox(cleanupUserId, sandbox.id, { force: true });
      } catch (err) {
        console.warn(`Failed to clean up live eval sandbox: ${err.message || String(err)}`);
      }
    }
    if (!keepSandbox && sourceRoot) {
      try { fs.rmSync(sourceRoot, { recursive: true, force: true }); } catch {}
    }
  }
}

function printPayload(payload) {
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  console.log(`Agent evals (${payload.mode}): ${payload.passed}/${payload.total} passed (${payload.durationMs}ms)`);
  if (payload.mode === 'live') {
    console.log(`Model: ${payload.model || 'n/a'}${payload.sandboxPath ? ` | Sandbox: ${payload.sandboxPath}` : ''}`);
  }
  for (const item of payload.results) {
    console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.genre.padEnd(10)} ${item.id} - ${item.message}`);
  }
}

async function main() {
  const payload = process.argv.includes('--live')
    ? await runLiveModelEval()
    : await runDeterministicEvals();
  printPayload(payload);
  process.exitCode = payload.success ? 0 : 1;
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
