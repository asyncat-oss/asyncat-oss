import { c, col, setRl, setLl, log, ok, warn, info, banner } from './lib/colors.js';
import { LiveLine } from './lib/liveLine.js';
import { stopAll } from './lib/procs.js';

import * as _start    from './commands/start.js';
import * as _stop     from './commands/stop.js';
import * as _status   from './commands/status.js';
import * as _install  from './commands/install.js';
import * as _doctor   from './commands/doctor.js';
import * as _logs     from './commands/logs.js';
import * as _models   from './commands/models.js';
import * as _db       from './commands/db.js';
import * as _config   from './commands/config.js';
import * as _update   from './commands/update.js';
import * as _version  from './commands/version.js';
import * as _open     from './commands/open.js';
import * as _chat     from './commands/chat.js';
import * as _run      from './commands/run.js';
import * as _provider from './commands/provider.js';
import * as _sessions from './commands/sessions.js';

const cmds = {
  start:    () => _start,
  stop:     () => _stop,
  status:   () => _status,
  install:  () => _install,
  doctor:   () => _doctor,
  logs:     () => _logs,
  models:   () => _models,
  db:       () => _db,
  config:   () => _config,
  update:   () => _update,
  version:  () => _version,
  open:     () => _open,
  chat:     () => _chat,
  run:      () => _run,
  provider: () => _provider,
  sessions: () => _sessions,
};


function cmdHelp() {
  log('');
  log(`  ${col('bold', 'Services')}`);
  log(`  ${col('cyan', 'start')}    ${col('dim', '[--backend-only] [--frontend-only]')}   Start services`);
  log(`  ${col('cyan', 'stop')}               Stop all running services`);
  log(`  ${col('cyan', 'status')}   ${col('dim', 'ps')}        Show what is running`);
  log(`  ${col('cyan', 'restart')}            Stop then start`);
  log('');
  log(`  ${col('bold', 'AI  ·  the good stuff')}`);
  log(`  ${col('cyan', 'chat')}     ${col('dim', '[--web] [--think] [--style=concise]')}`);
  log(`           ${col('dim', 'Interactive AI chat with streaming (uses your workspace)')}`);
  log(`  ${col('cyan', 'run')}      ${col('dim', '[model]')}`);
  log(`           ${col('dim', 'Direct terminal chat with local llama-server (no den needed)')}`);
  log('');
  log(`  ${col('bold', 'Models')}`);
  log(`  ${col('cyan', 'models list')}                    List downloaded models`);
  log(`  ${col('cyan', 'models pull')}  ${col('dim', '<url> [file.gguf]')}  Download a GGUF model`);
  log(`  ${col('cyan', 'models serve')} ${col('dim', '<file.gguf>')}        Load model into llama-server`);
  log(`  ${col('cyan', 'models stop')}                    Unload & stop llama-server`);
  log(`  ${col('cyan', 'models ps')}                      Show running models`);
  log(`  ${col('cyan', 'models rm')}    ${col('dim', '<file.gguf>')}        Delete a model file`);
  log(`  ${col('cyan', 'models info')}  ${col('dim', '<file.gguf>')}        Show model details`);
  log('');
  log(`  ${col('bold', 'Provider')}`);
  log(`  ${col('cyan', 'provider list')}                  Show current AI provider`);
  log(`  ${col('cyan', 'provider set local')} ${col('dim', '<file.gguf>')}  Switch to local llama.cpp`);
  log(`  ${col('cyan', 'provider set cloud')} ${col('dim', '<key> [model]')} Switch to cloud (OpenAI)`);
  log(`  ${col('cyan', 'provider set custom')} ${col('dim', '<url> <key>')} Custom OpenAI-compat endpoint`);
  log(`  ${col('cyan', 'provider stop')}                  Stop the local model server`);
  log('');
  log(`  ${col('bold', 'Sessions')}`);
  log(`  ${col('cyan', 'sessions')}       ${col('dim', '[n]')}    List saved conversations (default 20)`);
  log(`  ${col('cyan', 'sessions rm')}    ${col('dim', '<id>')}   Delete a conversation`);
  log(`  ${col('cyan', 'sessions stats')}         Conversation statistics`);
  log('');
  log(`  ${col('bold', 'Setup & Maintenance')}`);
  log(`  ${col('cyan', 'install')}            Install deps, set up .env, check llama.cpp`);
  log(`  ${col('cyan', 'doctor')}             Full system health check`);
  log(`  ${col('cyan', 'update')}             Pull latest changes + reinstall`);
  log(`  ${col('cyan', 'logs')}    ${col('dim', '[backend|frontend|all]')}`);
  log(`  ${col('cyan', 'db')}      ${col('dim', '<backup|reset|seed>')}`);
  log(`  ${col('cyan', 'config')}  ${col('dim', '<show|get <KEY>|set KEY=VALUE>')}`);
  log(`  ${col('cyan', 'version')}            Show version info`);
  log(`  ${col('cyan', 'open')}    ${col('dim', 'o')}         Open asyncat in the browser`);
  log('');
  log(`  ${col('bold', 'REPL')}`);
  log(`  ${col('cyan', 'clear')}              Clear the screen`);
  log(`  ${col('cyan', 'help')}    ${col('dim', '?')}         Show this help`);
  log(`  ${col('cyan', 'exit')}    ${col('dim', 'quit q')}    Quit (stops all services)`);
  log('');
}


async function dispatch(tokens) {
  const [cmd, ...args] = tokens;
  if (!cmd) return;

  switch (cmd) {
    case 'start':    cmds.start().run(args);              break;
    case 'stop':     cmds.stop().run();                   break;
    case 'status':
    case 'ps':       cmds.status().run();                 break;
    case 'restart':
      cmds.stop().run();
      setTimeout(() => cmds.start().run(args), 500);
      break;
    case 'install':
    case 'setup':    await cmds.install().run();          break;
    case 'doctor':   cmds.doctor().run();                 break;
    case 'logs':     cmds.logs().run(args);               break;
    case 'models':   await cmds.models().run(args);       break;
    case 'db':       await cmds.db().run(args);           break;
    case 'config':   cmds.config().run(args);             break;
    case 'update':   cmds.update().run();                 break;
    case 'version':
    case 'v':        cmds.version().run();                break;
    case 'open':
    case 'o':        cmds.open().run();                   break;

    // ── New AI commands ─────────────────────────────────────────────────────
    case 'chat':     await cmds.chat().run(args);         break;
    case 'run':      await cmds.run().run(args);          break;
    case 'provider': await cmds.provider().run(args);     break;
    case 'sessions': await cmds.sessions().run(args);     break;

    // ── Aliases ──────────────────────────────────────────────────────────────
    case 's':        cmds.start().run(args);              break;
    case 'c':        await cmds.chat().run(args);         break;

    case 'clear':    console.clear(); banner();           break;
    case 'help':
    case '?':        cmdHelp();                           break;
    case 'exit':
    case 'quit':
    case 'q':
      stopAll();
      log(col('dim', '  bye ♡'));
      process.exit(0);
      break;
    default:
      warn(`Unknown command: ${col('white', cmd)}  (type ${col('cyan', 'help')})`);
  }
}

const MAIN_PROMPT     = col('magenta', 'asyncat') + col('dim', ' ▸ ') + c.reset;
const MAIN_PROMPT_LEN = 'asyncat ▸ '.length;

async function startREPL() {
  banner();
  cmds.status().run();

  const ll = new LiveLine(MAIN_PROMPT, MAIN_PROMPT_LEN);
  setRl(ll);   // keep getRl() working for chat.js
  setLl(ll);   // used by log() / ok() / warn()

  ll.on('line', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) { ll.prompt(); return; }

    const tokens = trimmed.split(/\s+/);
    await dispatch(tokens);

    const cmd = tokens[0].toLowerCase();
    if (cmd !== 'exit' && cmd !== 'quit' && cmd !== 'q') {
      // Restore main prompt in case chat mode changed it
      ll.restoreMainPrompt(MAIN_PROMPT, MAIN_PROMPT_LEN);
      ll.prompt();
    }
  });

  ll.on('close', () => {
    ll.close();
    stopAll();
    process.exit(0);
  });

  ll.start();
}

const argv = process.argv.slice(2);

if (argv.length > 0) {
  const first = argv[0];
  if (first === '--version' || first === '-v') {
    cmds.version().run();
  } else if (first === '--help' || first === '-h') {
    banner();
    cmdHelp();
  } else {
    await dispatch(argv);
  }
} else {
  await startREPL();
}
