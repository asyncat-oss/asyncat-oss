// cli/commands/agent.js
// ─── CLI Agent Command ───────────────────────────────────────────────────────
// Runs the AI agent from the command line with interactive permission prompts.
//
// Usage:
//   ./cat agent "create a Flask API with user auth"
//   ./cat agent --auto-approve --max-rounds 30 "build a todo app"
//   ./cat agent --workspace ./myproject "what files are here?"
//   ./cat agent   (interactive mode)

import { col, log, ok, warn, info, getRl } from '../lib/colors.js';
import { getToken, getBase, streamPost, apiGet } from '../lib/denApi.js';
import readline from 'readline';
import path from 'path';
import { initTui, updateTuiEvent } from '../lib/agentTui.js';

// ── Permission display ──────────────────────────────────────────────────────

const PERM_ICONS = { safe: '🟢', moderate: '🟡', dangerous: '🔴' };
const PERM_COLORS = { safe: 'green', moderate: 'yellow', dangerous: 'red' };

/**
 * Ask user for permission before a dangerous tool executes.
 * This is called via the SSE 'permission_request' event.
 */
function askPermission(toolName, args, permission) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    log('');
    log(`  ${PERM_ICONS[permission] || '🔴'} ${col(PERM_COLORS[permission] || 'red', `Agent wants to run: ${toolName}`)}`);

    // Show a readable description of the action
    if (toolName === 'run_command') {
      log(`    ${col('cyan', '$')} ${col('white', args.command || '')}`);
      if (args.cwd) log(`    ${col('dim', `in: ${args.cwd}`)}`);
    } else if (toolName === 'write_file' || toolName === 'edit_file') {
      log(`    ${col('dim', `file: ${args.path}`)}`);
    } else if (toolName === 'run_python' || toolName === 'run_node') {
      const lines = (args.code || '').split('\n').slice(0, 6);
      log(`    ${col('dim', lines.join('\n    '))}`);
      if ((args.code || '').split('\n').length > 6) log(`    ${col('dim', '...')}`);
    } else {
      log(`    ${col('dim', JSON.stringify(args, null, 2).split('\n').map(l => '    ' + l).join('\n'))}`);
    }

    log('');
    log(`  ${col('dim', '[Y/Enter] Allow')}  ${col('dim', '[N] Deny')}  ${col('dim', '[A] Allow all this session')}`);
    rl.question(`  ${col('cyan', '▸')} `, answer => {
      rl.close();
      const a = (answer || '').trim().toLowerCase();
      if (a === 'n' || a === 'no') resolve('deny');
      else if (a === 'a' || a === 'all') resolve('allow_session');
      else resolve('allow'); // Y, Enter, anything else = allow
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

    case 'permission_request':
      // This is handled separately (see pendingPermissions below)
      break;
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

  // Permission decisions tracked per session (allow_session)
  const sessionApprovals = new Set();

  await streamPost('/api/agent/run', {
    goal,
    workingDir: options.workingDir || process.cwd(),
    maxRounds: options.maxRounds || 25,
    autoApprove: options.autoApprove || false,
  }, async (event) => {
    // Permission requests need interactive response
    if (event.type === 'permission_request') {
      const { requestId, args, permission } = event.data;
      const toolName = event.data.toolName || event.data.tool;

      if (options.autoApprove || sessionApprovals.has(toolName)) {
        // Respond to the API that permission is granted
        const res = await fetch(`${base}/api/agent/permissions/${requestId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ decision: options.autoApprove ? 'allow_session' : 'allow' }),
        });
        if (!res.ok) throw new Error(`Permission response failed (${res.status})`);
        return;
      }

      let decision;
      if (tui) decision = await tui.askPermission(toolName, args, permission);
      else decision = await askPermission(toolName, args, permission);

      if (decision === 'allow_session') sessionApprovals.add(toolName);

      const res = await fetch(`${base}/api/agent/permissions/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error(`Permission response failed (${res.status})`);
      return;
    }

    if (tui) {
      updateTuiEvent(tui, event, { verbose: options.verbose });
    } else {
      displayEvent(event, { verbose: options.verbose });
    }
  });
}

// ── Interactive mode ─────────────────────────────────────────────────────────

async function interactiveMode(options) {
  const mainRl = getRl();
  const savedListeners = mainRl ? mainRl.rawListeners('line') : [];
  const savedPrompt = mainRl ? mainRl._prompt : '';

  if (mainRl) {
    mainRl.removeAllListeners('line');
    mainRl.pause();
  }

  return new Promise((resolve) => {
    let tui;
    
    const exit = () => {
      if (tui) tui.destroy();
      if (mainRl) {
        mainRl.resume();
        for (const l of savedListeners) mainRl.on('line', l);
        mainRl.setPrompt(savedPrompt);
        info('Back in REPL. Type ' + col('cyan', 'help') + ' for commands.');
        mainRl.prompt();
      } else {
        console.log(`  ${col('dim', 'Agent exited.')}`);
        process.exit(0);
      }
      resolve();
    };

    let isRunning = false;

    const onSubmit = async (text) => {
      if (isRunning) return;
      
      if (text === '/exit' || text === '/quit') {
         exit();
         return;
      }
      
      tui.chat(`{blue-fg}You ▸{/blue-fg} ${text}`);
      tui.chat('');
      
      isRunning = true;
      try {
         await runAgent(text, { ...options, hideModelInfo: true }, tui);
      } finally {
         isRunning = false;
         tui.focusInput();
      }
    };

    tui = initTui(onSubmit, exit);
  });
}

// ── Exported run ─────────────────────────────────────────────────────────────

export async function run(args = []) {
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
