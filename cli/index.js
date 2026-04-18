'use strict';

const readline = require('readline');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { c, col, setRl, log, ok, warn, info, banner } = require('./lib/colors');
const { stopAll } = require('./lib/procs');

// ── lazy-load commands ────────────────────────────────────────────────────────
const cmds = {
  start:   () => require('./commands/start'),
  stop:    () => require('./commands/stop'),
  status:  () => require('./commands/status'),
  install: () => require('./commands/install'),
  doctor:  () => require('./commands/doctor'),
  logs:    () => require('./commands/logs'),
  models:  () => require('./commands/models'),
  db:      () => require('./commands/db'),
  config:  () => require('./commands/config'),
  update:  () => require('./commands/update'),
  version: () => require('./commands/version'),
};

// ── all valid top-level commands (used for tab completion) ────────────────────
const ALL_CMDS = [
  'start', 'stop', 'status', 'restart',
  'install', 'setup',
  'doctor', 'logs', 'models', 'db', 'config',
  'update', 'version',
  'clear', 'help', 'exit', 'quit',
];

// ── sub-command hints for tab completion ──────────────────────────────────────
const SUB_CMDS = {
  logs:   ['backend', 'frontend', 'all'],
  models: ['list', 'remove'],
  db:     ['backup', 'reset', 'seed'],
  config: ['show', 'get', 'set'],
  start:  ['--backend-only', '--frontend-only'],
};

function completer(line) {
  const tokens = line.trimStart().split(/\s+/);
  if (tokens.length <= 1) {
    // completing the main command
    const hits = ALL_CMDS.filter(c => c.startsWith(tokens[0]));
    return [hits.length ? hits : ALL_CMDS, tokens[0]];
  }
  // completing a sub-command
  const cmd  = tokens[0];
  const stub = tokens[tokens.length - 1];
  const subs = SUB_CMDS[cmd] || [];
  const hits = subs.filter(s => s.startsWith(stub));
  return [hits.length ? hits : subs, stub];
}

// ── help ──────────────────────────────────────────────────────────────────────
function cmdHelp() {
  log('');
  log(`  ${col('bold', 'Commands:')}`);
  log(`  ${col('cyan', 'start')}   ${col('dim', '[--backend-only] [--frontend-only]')}   Start services`);
  log(`  ${col('cyan', 'stop')}              Stop all running services`);
  log(`  ${col('cyan', 'status')}  ${col('dim', 'ps')}       Show what is running`);
  log(`  ${col('cyan', 'restart')}           Stop then start`);
  log(`  ${col('cyan', 'install')}           Install deps, set up .env, check llama.cpp`);
  log(`  ${col('cyan', 'doctor')}            Full system health check`);
  log(`  ${col('cyan', 'logs')}    ${col('dim', '[backend|frontend|all]')}`);
  log(`  ${col('cyan', 'models')}  ${col('dim', '[list|remove <name>]')}`);
  log(`  ${col('cyan', 'db')}      ${col('dim', '<backup|reset|seed>')}`);
  log(`  ${col('cyan', 'config')}  ${col('dim', '<show|get <KEY>|set KEY=VALUE>')}`);
  log(`  ${col('cyan', 'update')}            Pull latest changes + reinstall`);
  log(`  ${col('cyan', 'version')}           Show version info`);
  log(`  ${col('cyan', 'clear')}             Clear the screen`);
  log(`  ${col('cyan', 'help')}    ${col('dim', '?')}        Show this help`);
  log(`  ${col('cyan', 'exit')}    ${col('dim', 'quit q')}   Quit (stops all services)`);
  log('');
}

// ── persistent history ────────────────────────────────────────────────────────
const HISTORY_FILE = path.join(os.homedir(), '.asyncat_history');
const MAX_HISTORY  = 200;

function loadHistory() {
  try {
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
    // file is stored oldest→newest; readline.history is newest→oldest
    return lines.reverse().slice(0, MAX_HISTORY);
  } catch (_) { return []; }
}

function saveHistory(rl) {
  try {
    // rl.history is newest→oldest; write oldest→newest
    const lines = (rl.history || []).slice(0, MAX_HISTORY).reverse().join('\n');
    fs.writeFileSync(HISTORY_FILE, lines + '\n', 'utf8');
  } catch (_) {}
}

// ── route a command (parsed tokens) ──────────────────────────────────────────
async function dispatch(tokens) {
  const [cmd, ...args] = tokens;
  if (!cmd) return;

  switch (cmd) {
    case 'start':    cmds.start().run(args); break;
    case 'stop':     cmds.stop().run();      break;
    case 'status':
    case 'ps':       cmds.status().run();    break;
    case 'restart':
      cmds.stop().run();
      setTimeout(() => cmds.start().run(args), 500);
      break;
    case 'install':
    case 'setup':
      await cmds.install().run();
      break;
    case 'doctor':   cmds.doctor().run();         break;
    case 'logs':     cmds.logs().run(args);        break;
    case 'models':   await cmds.models().run(args); break;
    case 'db':       await cmds.db().run(args);    break;
    case 'config':   cmds.config().run(args);      break;
    case 'update':   cmds.update().run();           break;
    case 'version':
    case 'v':        cmds.version().run();          break;
    case 'clear':    console.clear(); banner();     break;
    case 'help':
    case '?':        cmdHelp();                     break;
    case 'exit':
    case 'quit':
    case 'q':
      stopAll();
      log(col('dim', '  bye ♡'));
      process.exit(0);
      break;
    case 's':
      cmds.start().run(args);
      break;
    default:
      warn(`Unknown command: ${col('white', cmd)}  (type ${col('cyan', 'help')})`);
  }
}

// ── REPL ──────────────────────────────────────────────────────────────────────
async function startREPL() {
  banner();
  cmds.status().run();

  const rl = readline.createInterface({
    input:       process.stdin,
    output:      process.stdout,
    prompt:      col('magenta', 'asyncat') + col('dim', ' ▸ ') + c.reset,
    terminal:    true,
    historySize: MAX_HISTORY,
    completer,
  });

  // restore history from last session
  rl.history = loadHistory();

  setRl(rl);
  rl.prompt();

  rl.on('line', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) { rl.prompt(); return; }

    const tokens = trimmed.split(/\s+/);
    await dispatch(tokens);

    const cmd = tokens[0].toLowerCase();
    if (cmd !== 'exit' && cmd !== 'quit' && cmd !== 'q') rl.prompt();
  });

  rl.on('close', () => {
    saveHistory(rl);
    stopAll();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('');
    log(col('dim', '  (ctrl+c again to quit, or type exit)'));
    rl.prompt();
  });
}

// ── entry point ───────────────────────────────────────────────────────────────
(async () => {
  const argv = process.argv.slice(2);

  if (argv.length > 0) {
    const first = argv[0];
    // handle top-level flags before entering REPL or dispatching
    if (first === '--version' || first === '-v') {
      cmds.version().run();
      return;
    }
    if (first === '--help' || first === '-h') {
      banner();
      cmdHelp();
      return;
    }
    // non-interactive: run command directly
    await dispatch(argv);
  } else {
    await startREPL();
  }
})();
