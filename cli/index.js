'use strict';

const readline = require('readline');
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

// ── help ──────────────────────────────────────────────────────────────────────
function cmdHelp() {
  log('');
  log(`  ${col('bold', 'Commands:')}`);
  log(`  ${col('cyan', 'start')}             Start backend + frontend`);
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

// ── route a command (parsed tokens) ──────────────────────────────────────────
async function dispatch(tokens) {
  const [cmd, ...args] = tokens;
  if (!cmd) return;

  switch (cmd) {
    case 'start':    cmds.start().run(); break;
    case 'stop':     cmds.stop().run();  break;
    case 'status':
    case 'ps':       cmds.status().run(); break;
    case 'restart':
      cmds.stop().run();
      setTimeout(() => cmds.start().run(), 500);
      break;
    case 'install':
    case 'setup':
      await cmds.install().run();
      break;
    case 'doctor':   cmds.doctor().run();        break;
    case 'logs':     cmds.logs().run(args);       break;
    case 'models':   await cmds.models().run(args); break;
    case 'db':       await cmds.db().run(args);   break;
    case 'config':   cmds.config().run(args);     break;
    case 'update':   cmds.update().run();          break;
    case 'version':
    case 'v':        cmds.version().run();         break;
    case 'clear':    console.clear(); banner();    break;
    case 'help':
    case '?':        cmdHelp();                    break;
    case 'exit':
    case 'quit':
    case 'q':
      stopAll();
      log(col('dim', '  bye ♡'));
      process.exit(0);
      break;
    case 's':
      // alias: 's' alone = start
      cmds.start().run();
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
    input:    process.stdin,
    output:   process.stdout,
    prompt:   col('magenta', 'asyncat') + col('dim', ' ▸ ') + c.reset,
    terminal: true,
  });

  setRl(rl);
  rl.prompt();

  rl.on('line', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) { rl.prompt(); return; }

    const tokens = trimmed.split(/\s+/);
    await dispatch(tokens);

    // don't re-prompt if we're exiting
    const cmd = tokens[0].toLowerCase();
    if (cmd !== 'exit' && cmd !== 'quit' && cmd !== 'q') rl.prompt();
  });

  rl.on('close', () => {
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
    // non-interactive: run command directly
    await dispatch(argv);
  } else {
    await startREPL();
  }
})();
