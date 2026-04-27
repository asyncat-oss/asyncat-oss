// cli/commands/agent.js
// ─── CLI Agent Command ───────────────────────────────────────────────────────
// Runs the AI agent from the command line with interactive permission prompts.
//
// Usage:
//   ./cat agent "create a Flask API with user auth"
//   ./cat agent --auto-approve --max-rounds 30 "build a todo app"
//   ./cat agent --workspace ./myproject "what files are here?"
//   ./cat agent   (interactive mode)

import { col, log, warn } from '../lib/colors.js';
import { apiGet, apiPost, getToken, getBase, streamPost } from '../lib/denApi.js';
import { logger } from '../lib/logger.js';
import readline from 'readline';
import path from 'path';
import { spawn } from 'child_process';
import { ROOT } from '../lib/env.js';

// ── Permission display ──────────────────────────────────────────────────────

const PERM_ICONS = { safe: '🟢', moderate: '🟡', dangerous: '🔴' };
const PERM_COLORS = { safe: 'green', moderate: 'yellow', dangerous: 'red' };
let lastUsage = null;

function usageWithCost(usage) {
  const model = String(usage.model || '').toLowerCase();
  const table = [
    ['gpt-4o-mini', 0.15, 0.60],
    ['gpt-4o', 2.50, 10.00],
    ['gpt-4.1-mini', 0.40, 1.60],
    ['gpt-4.1', 2.00, 8.00],
    ['claude-3-5-sonnet', 3.00, 15.00],
    ['claude-3-5-haiku', 0.80, 4.00],
  ];
  const hit = table.find(([name]) => model.includes(name));
  if (!hit || usage.isLocal) return usage;
  const [, inPerM, outPerM] = hit;
  return {
    ...usage,
    costUsd: ((usage.inputTokens || 0) / 1_000_000 * inPerM) + ((usage.outputTokens || 0) / 1_000_000 * outPerM),
  };
}

function askUserQuestion(data) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = data.question || 'The agent needs more information.';
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const defaultAnswer = data.default || '';

    log('');
    log(`  ${col('cyan', '?')} ${col('bold', question)}`);
    if (choices.length > 0) {
      choices.forEach((choice, idx) => log(`    ${col('dim', `[${idx + 1}]`)} ${choice}`));
    }
    if (defaultAnswer) log(`    ${col('dim', `Default: ${defaultAnswer}`)}`);

    rl.question(`  ${col('cyan', '▸')} `, answer => {
      rl.close();
      const raw = (answer || '').trim();
      if (!raw && defaultAnswer) { resolve(defaultAnswer); return; }
      if (/^\d+$/.test(raw) && choices.length > 0) {
        const idx = Number(raw) - 1;
        if (choices[idx]) { resolve(choices[idx]); return; }
      }
      resolve(raw);
    });
  });
}

// ── Event renderer ──────────────────────────────────────────────────────────

function displayEvent(event, opts = {}) {
  const { type, data } = event;

  switch (type) {
    case 'model_info':
      log(`  ${col('dim', `Model: ${data.model}  [${data.provider}]`)}`);
      log('');
      break;

    case 'thinking':
      log('');
      const roundNum = (data.round !== undefined) ? data.round + 1 : 1;
      if (data.thought) {
        log(`  ${col('dim', '╭─')} ${col('yellow', '🧠 Thinking')} ${col('dim', `(Round ${roundNum})`)}`);
        for (const line of data.thought.split('\n')) {
          log(`  ${col('dim', '│')}  ${col('dim', line)}`);
        }
        log(`  ${col('dim', '╰─')}`);
      } else {
        log(`  ${col('dim', '🧠 Thinking')} ${col('dim', `(Round ${roundNum})`)}`);
      }
      break;

    case 'tool_start':
      log('');
      log(`  ${col('dim', '╭─')} ${PERM_ICONS[data.permission] || '🔧'} ${col('cyan', data.tool)}`);
      if (data.description) {
        const descLines = data.description.split('\n');
        for (const line of descLines) {
          log(`  ${col('dim', '│')}  ${col('dim', line)}`);
        }
      }
      break;

    case 'tool_result':
      if (data.result?.success) {
        // Show a brief preview of the result
        const content = data.result.content || data.result.listing || data.result.results ||
          data.result.message || data.result.files || '';
        const preview = typeof content === 'string'
          ? content.split('\n').slice(0, 3).join('\n')
          : JSON.stringify(content).slice(0, 100);
        
        log(`  ${col('dim', '├─')} ${col('green', '✔ Success')}`);
        if (preview) {
          for (const line of preview.split('\n')) {
            log(`  ${col('dim', '│')}  ${col('dim', line)}`);
          }
          const total = typeof content === 'string' ? content.split('\n').length : 0;
          if (total > 3) log(`  ${col('dim', `│  … (${total - 3} more lines hidden)`)}`);
        }
        log(`  ${col('dim', '╰─')}`);
      } else {
        log(`  ${col('dim', '├─')} ${col('red', '✘ Failed')}`);
        log(`  ${col('dim', '│')}  ${col('dim', data.result?.error || 'Unknown error')}`);
        log(`  ${col('dim', '╰─')}`);
      }
      break;

    case 'answer':
      log('');
      log(`  ${col('magenta', '🤖 Asyncat')} ${col('dim', '▸')}`);
      for (const line of (data.answer || '').split('\n')) {
        log(`  ${line}`);
      }
      log('');
      break;

    case 'done':
      log(`  ${col('dim', `━━  ${data.rounds} round${data.rounds !== 1 ? 's' : ''}  ━━`)}`);
      log('');
      break;

    case 'error':
      log('');
      if (data.message && (data.message.includes('fetch failed') || data.message.includes('ECONNREFUSED') || data.message.includes('Connection error'))) {
        warn(`  Agent error: Could not connect to the AI model.`);
        log('');
        log(`  ${col('dim', 'It seems no AI model is currently loaded or running.')}`);
        log(`  ${col('dim', 'Please start a model using:')}`);
        log(`    ${col('cyan', './cat run')}      ${col('dim', 'to load your default local model')}`);
        log(`    ${col('cyan', './cat models')}   ${col('dim', 'to manage and start models')}`);
      } else {
        warn(`  Agent error: ${data.message || 'Unknown error'}`);
      }
      log('');
      break;

    case 'usage_update':
      lastUsage = data;
      break;

    case 'permission_request':
      // This is handled separately (see pendingPermissions below)
      break;

    case 'compaction': {
      log(`  ${col('dim', `⟲ compacted ${data.droppedMessages} messages (~${data.tokensBefore}→${data.tokensAfter} tokens)`)}`);
      break;
    }

    case 'plan_update': {
      const plan = Array.isArray(data.plan) ? data.plan : [];
      log('');
      log(`  ${col('dim', '╭─')} ${col('magenta', '📋 Plan')}`);
      if (plan.length === 0) {
        log(`  ${col('dim', '│  (empty)')}`);
      } else {
        for (const item of plan) {
          const icon = item.status === 'completed'
            ? col('green', '✔')
            : item.status === 'in_progress'
              ? col('yellow', '◉')
              : col('dim', '○');
          const label = item.status === 'in_progress' && item.activeForm ? item.activeForm : item.content;
          log(`  ${col('dim', '│')}  ${icon} ${label || ''}`);
        }
      }
      log(`  ${col('dim', '╰─')}`);
      break;
    }
  }
}

// ── Fetch provider info ─────────────────────────────────────────────────────

async function getProviderInfo(base, token) {
  try {
    const res = await fetch(`${base}/api/ai/providers/config`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return res.json();
  } catch {}
  return null;
}

// ── Core stream runner ──────────────────────────────────────────────────────

async function runAgent(goal, options = {}, tui = null) {
  lastUsage = null;
  // Auth
  let token, base;
  try {
    token = await getToken();
    base  = getBase();
  } catch (e) {
    warn(`  ${e.message}`);
    warn(`  Run ${col('cyan', './cat start')} to start the backend first.`);
    return;
  }

  // Show what model will be used (skip in interactive loop if hidden)
  if (!options.hideModelInfo) {
    const providerInfo = await getProviderInfo(base, token);
    if (providerInfo?.model) {
      const providerLabel = providerInfo.provider_type === 'local' ? 'local' : providerInfo.provider_type || 'cloud';
      log(`  ${col('dim', `Model: ${providerInfo.model}  [${providerLabel}]`)}`);
    } else {
      log(`  ${col('dim', 'Model: using configured provider')}`);
    }
    log('');
  }

  await streamPost('/api/agent/run', {
    goal,
    workingDir: options.workingDir || process.cwd(),
    maxRounds: options.maxRounds || 25,
    autoApprove: options.autoApprove || false,
  }, async (event) => {
    if (event.type === 'ask_user') {
      const answer = await askUserQuestion(event.data);
      const res = await fetch(`${base}/api/agent/ask/${event.data.requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answer }),
      });
      if (!res.ok) throw new Error(`Question response failed (${res.status})`);
      return;
    }

    displayEvent(event, { verbose: options.verbose });
  });

  if (lastUsage) {
    const usage = usageWithCost(lastUsage);
    const cost = usage.costUsd ? `  ~$${usage.costUsd.toFixed(4)}` : '';
    log(`  ${col('dim', `Usage: ${Number(usage.totalTokens || 0).toLocaleString()} tokens${cost}`)}`);
  }
}

// ── Interactive mode ─────────────────────────────────────────────────────────

async function interactiveMode(_options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'cat')], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', () => resolve());
  });
}

// ── Exported run ─────────────────────────────────────────────────────────────

export async function run(args = []) {
  logger.agent.info(`Agent command started: ${args.join(' ')}`);
  if (args[0] === 'undo') {
    try {
      const data = await apiPost('/api/agent/checkpoints/restore', { id: args[1] || null });
      log(`  ${col('green', '✔')} Restored checkpoint ${data.checkpoint?.id || ''}`);
    } catch (e) {
      warn(`  Undo failed: ${e.message}`);
    }
    return;
  }

  if (args[0] === 'checkpoints') {
    try {
      const data = await apiGet('/api/agent/checkpoints');
      const cps = data.checkpoints || [];
      if (!cps.length) { log(`  ${col('dim', 'No checkpoints yet.')}`); return; }
      for (const cp of cps) log(`  ${cp.id}  ${cp.kind}  ${cp.workspace}  ${cp.createdAt}`);
    } catch (e) {
      warn(`  Checkpoints failed: ${e.message}`);
    }
    return;
  }

  const options = {
    autoApprove: args.includes('--auto-approve') || args.includes('-y'),
    verbose:     args.includes('--verbose') || args.includes('-v'),
    maxRounds:   25,
    workingDir:  process.cwd(),
  };

  // --max-rounds N
  const maxIdx = args.indexOf('--max-rounds');
  if (maxIdx !== -1 && args[maxIdx + 1]) {
    options.maxRounds = parseInt(args[maxIdx + 1]) || 25;
  }

  // --workspace DIR
  const wsIdx = args.indexOf('--workspace');
  if (wsIdx !== -1 && args[wsIdx + 1]) {
    options.workingDir = path.resolve(args[wsIdx + 1]);
  }

  // Collect non-flag tokens as the goal
  const flagValues = new Set();
  if (maxIdx !== -1) flagValues.add(args[maxIdx + 1]);
  if (wsIdx  !== -1) flagValues.add(args[wsIdx  + 1]);

  const goalTokens = args.filter(a => !a.startsWith('-') && !flagValues.has(a));
  const goal = goalTokens.join(' ').trim();

  if (goal) {
    // One-shot: agent works to completion then returns
    log('');
    log(`  ${col('bold', '🤖 Agent')} ${col('dim', `▸ ${goal}`)}`);
    log('');
    await runAgent(goal, options);
  } else {
    // Interactive REPL mode
    await interactiveMode(options);
  }
}
