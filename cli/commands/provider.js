// asyncat provider [list|get|set]
// Manage the AI provider config — reads/writes den/.env for cloud/custom,
// and calls the den API for local llama.cpp server control.

import path from 'path';
import { ROOT, readEnv, setKey } from '../lib/env.js';
import { log, ok, warn, err, info, col } from '../lib/colors.js';
import { getToken, apiGet, apiPost, getBase } from '../lib/denApi.js';

const DEN_ENV = path.join(ROOT, 'den/.env');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readProviderEnv() {
  const env = readEnv('den/.env');
  return {
    baseUrl:  env['AI_BASE_URL']  || '',
    apiKey:   env['AI_API_KEY']   || '',
    model:    env['AI_MODEL']     || '',
    llamaPort: env['LLAMA_SERVER_PORT'] || '8765',
  };
}

async function getLlamaStatus() {
  try {
    const data = await apiGet('/api/ai/providers/server/status');
    return data;
  } catch (_) { return null; }
}

async function getLocalModels() {
  try {
    const data = await apiGet('/api/ai/providers/local-models');
    return data.models || [];
  } catch (_) { return []; }
}

// ── list / get ────────────────────────────────────────────────────────────────

async function listProviders() {
  const { baseUrl, model, apiKey, llamaPort } = readProviderEnv();

  log('');
  log(`  ${col('bold', 'AI Provider Configuration')}`);
  log(col('dim', '  ' + '─'.repeat(48)));

  // Local llama.cpp status
  let llamaStatus = null;
  try { llamaStatus = await getLlamaStatus(); } catch (_) {}

  const llamaRunning = llamaStatus?.status === 'ready' || llamaStatus?.status === 'loading';
  const llamaModel   = llamaStatus?.modelFile || llamaStatus?.model || '';
  const llamaIcon    = llamaRunning ? col('green', '●') : col('dim', '○');

  log(`  ${llamaIcon} ${col('white', 'local  llama.cpp')}   ${col('dim', `port ${llamaPort}`)}`);
  if (llamaRunning) {
    log(`      ${col('dim', 'status:')} ${col('green', llamaStatus.status)}`);
    if (llamaModel) log(`      ${col('dim', 'model: ')} ${col('cyan', llamaModel)}`);
  } else {
    log(`      ${col('dim', 'status:')} ${col('dim', llamaStatus?.status || 'offline')}`);
    log(`      ${col('dim', 'hint:  ')} ${col('dim', 'models serve <filename.gguf>')}`);
  }

  log('');

  // Cloud / custom endpoint
  const cloudIcon = (!llamaRunning && baseUrl && !baseUrl.includes('127.0.0.1')) ? col('green', '●') : col('dim', '○');
  const displayUrl = baseUrl || col('dim', '(not configured)');
  const displayModel = model || col('dim', '(not set)');
  const displayKey = apiKey ? col('dim', apiKey.slice(0, 6) + '***') : col('dim', '(not set)');

  log(`  ${cloudIcon} ${col('white', 'cloud  openai / custom')}`);
  log(`      ${col('dim', 'url:   ')} ${col('cyan', displayUrl)}`);
  log(`      ${col('dim', 'model: ')} ${col('white', displayModel)}`);
  log(`      ${col('dim', 'key:   ')} ${displayKey}`);
  log('');

  log(`  ${col('dim', 'To switch providers:')}`);
  log(`    ${col('cyan', 'provider set local <model.gguf>')}`);
  log(`    ${col('cyan', 'provider set cloud <api-key> [model] [base-url]')}`);
  log(`    ${col('cyan', 'provider set custom <base-url> <api-key> [model]')}`);
  log('');
}

// ── set ───────────────────────────────────────────────────────────────────────

async function setLocal(args) {
  const modelFile = args[0];

  // Ensure den is reachable
  try { await getToken(); } catch (e) { err(e.message); return; }

  // List available local models
  const models = await getLocalModels();

  if (!modelFile) {
    if (models.length === 0) {
      warn('No local models found.');
      info(`Download one: ${col('cyan', 'models pull <url> <filename.gguf>')}`);
      return;
    }
    log('');
    log(`  ${col('bold', 'Available local models:')}`);
    for (const m of models) {
      log(`    ${col('cyan', '•')} ${col('white', m.filename)}  ${col('dim', m.sizeFormatted)}`);
    }
    log('');
    warn(`Specify a model: ${col('cyan', 'provider set local <filename.gguf>')}`);
    return;
  }

  // Find the model
  const found = models.find(m => m.filename === modelFile || m.name === modelFile);
  if (!found && models.length > 0) {
    warn(`Model not found: ${col('white', modelFile)}`);
    info(`Available: ${models.map(m => col('cyan', m.filename)).join(', ')}`);
    return;
  }

  const filename = found?.filename || modelFile;
  info(`Loading ${col('white', filename)} into llama-server…`);

  try {
    await apiPost('/api/ai/providers/server/start', { filename });
    ok(`llama-server started with ${col('white', filename)}`);
    info('Provider set to local. Chat with: ' + col('cyan', 'chat'));
  } catch (e) {
    err(`Failed to start server: ${e.message}`);
  }
}

async function setCloud(args) {
  // provider set cloud <api-key> [model] [base-url]
  const [apiKey, model, baseUrl] = args;

  if (!apiKey) {
    warn('Usage: provider set cloud <api-key> [model] [base-url]');
    info('Example: provider set cloud sk-abc123 gpt-4o');
    return;
  }

  const url   = baseUrl || 'https://api.openai.com/v1';
  const mdl   = model   || 'gpt-4o';

  setKey('den/.env', 'AI_BASE_URL', url);
  setKey('den/.env', 'AI_API_KEY',  apiKey);
  setKey('den/.env', 'AI_MODEL',    mdl);

  ok(`Cloud provider configured:`);
  info(`  URL   → ${col('cyan', url)}`);
  info(`  Model → ${col('cyan', mdl)}`);
  info(`  Key   → ${col('dim',  apiKey.slice(0, 6) + '***')}`);
  warn('Restart the backend for env changes to take effect: ' + col('cyan', 'restart'));
}

async function setCustom(args) {
  // provider set custom <base-url> <api-key> [model]
  const [baseUrl, apiKey, model] = args;

  if (!baseUrl || !apiKey) {
    warn('Usage: provider set custom <base-url> <api-key> [model]');
    info('Example: provider set custom http://localhost:1234/v1 none mistral');
    return;
  }

  const mdl = model || 'local';

  setKey('den/.env', 'AI_BASE_URL', baseUrl);
  setKey('den/.env', 'AI_API_KEY',  apiKey);
  setKey('den/.env', 'AI_MODEL',    mdl);

  ok(`Custom provider configured:`);
  info(`  URL   → ${col('cyan', baseUrl)}`);
  info(`  Model → ${col('cyan', mdl)}`);
  warn('Restart the backend for env changes to take effect: ' + col('cyan', 'restart'));
}

async function stopLocal() {
  try { await getToken(); } catch (e) { err(e.message); return; }
  try {
    await apiPost('/api/ai/providers/server/stop', {});
    ok('llama-server stopped.');
  } catch (e) {
    err(`Failed to stop: ${e.message}`);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function run(args = []) {
  const sub = (args[0] || 'list').toLowerCase();
  const rest = args.slice(1);

  switch (sub) {
    case 'list':
    case 'get':
    case 'status':
      await listProviders();
      break;

    case 'set': {
      const type = (rest[0] || '').toLowerCase();
      switch (type) {
        case 'local':  await setLocal(rest.slice(1));  break;
        case 'cloud':  await setCloud(rest.slice(1));  break;
        case 'custom': await setCustom(rest.slice(1)); break;
        case 'stop':   await stopLocal();              break;
        default:
          warn(`Unknown provider type: ${col('white', type || '(none)')}`);
          log(`  Usage: ${col('cyan', 'provider set')} ${col('dim', '<local|cloud|custom|stop>')}`);
      }
      break;
    }

    case 'stop':
      await stopLocal();
      break;

    default:
      warn(`Unknown provider subcommand: ${col('white', sub)}`);
      log(`  Usage: ${col('cyan', 'provider')} ${col('dim', '[list|get|set <type>|stop]')}`);
  }
}
