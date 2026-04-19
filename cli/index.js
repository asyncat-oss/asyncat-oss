import { c, col, setRl, setLl, log, ok, warn, info, banner, setLiveLogsEnabled, getLiveLogsEnabled } from './lib/colors.js';
import { LiveLine } from './lib/liveLine.js';
import { loadTheme, setTheme, getTheme, getThemeName, THEME_NAMES } from './lib/theme.js';
import { stashAdd, stashList, stashRm, stashClear } from './lib/stash.js';
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
import * as _watch    from './commands/watch.js';
import * as _alias    from './commands/alias.js';
import * as _recent   from './commands/recent.js';
import * as _bench    from './commands/bench.js';
import * as _context  from './commands/context.js';
import * as _snippets from './commands/snippets.js';
import * as _macros   from './commands/macros.js';
import * as _history  from './commands/history.js';
import * as _uninstall from './commands/uninstall.js';

loadTheme();

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
  watch:    () => _watch,
  alias:    () => _alias,
  recent:   () => _recent,
  bench:    () => _bench,
  context:  () => _context,
  snippets: () => _snippets,
  macros:   () => _macros,
  history:  () => _history,
  uninstall: () => _uninstall,
};

// ── /theme handler ─────────────────────────────────────────────────────────────
function handleTheme(args) {
  const name = args[0];
  if (!name) {
    info(`Current theme: ${col('cyan', getThemeName())}`);
    info(`Available: ${THEME_NAMES.map(n => col('cyan', n)).join('  ')}`);
    return;
  }
  if (setTheme(name)) {
    ok(`Theme set to ${col('cyan', name)} — run ${col('cyan', 'clear')} to see it applied`);
  } else {
    warn(`Unknown theme "${name}". Available: ${THEME_NAMES.join(', ')}`);
  }
}

// ── /stash handler ─────────────────────────────────────────────────────────────
function handleStash(args) {
  const sub = args[0];

  if (!sub || sub === 'list') {
    const items = stashList();
    if (items.length === 0) { info('Stash is empty.'); return; }
    log('');
    for (const it of items) {
      const date = new Date(it.ts).toLocaleDateString();
      log(`  ${col('cyan', it.id)}  ${col('dim', date)}  ${it.text}`);
    }
    log('');
    return;
  }

  if (sub === 'rm') {
    const id = args[1];
    if (!id) { warn('Usage: stash rm <id>'); return; }
    if (stashRm(id)) ok(`Removed stash entry ${col('cyan', id)}`);
    else warn(`No entry matching "${id}"`);
    return;
  }

  if (sub === 'clear') {
    stashClear();
    ok('Stash cleared.');
    return;
  }

  // Treat everything as text to stash
  const text = args.join(' ');
  const id   = stashAdd(text);
  ok(`Stashed ${col('dim', `[${id}]`)}  ${text}`);
}

// ── /live-logs handler ────────────────────────────────────────────────────────────
function handleLiveLogs(args) {
  const sub = args[0];
  const enabled = getLiveLogsEnabled();

  if (!sub || sub === 'status') {
    info(`Live logs: ${enabled ? col('green', 'ON') : col('dim', 'off')}`);
    return;
  }

  if (sub === 'on' || sub === 'enable') {
    setLiveLogsEnabled(true);
    ok('Live logs enabled — backend/frontend output will now stream in REPL');
    return;
  }

  if (sub === 'off' || sub === 'disable') {
    setLiveLogsEnabled(false);
    ok('Live logs disabled — logs only written to files (use logs command to view)');
    return;
  }

  if (sub === 'toggle') {
    setLiveLogsEnabled(!enabled);
    ok(`Live logs ${!enabled ? 'enabled' : 'disabled'}`);
    return;
  }

  warn(`Unknown live-logs subcommand: ${col('white', sub)}`);
  log(`  Usage: ${col('cyan', 'live-logs')} ${col('dim', '[on|off|toggle|status]')}`);
}

// ── Help ───────────────────────────────────────────────────────────────────────
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
  log(`  ${col('bold', 'Sessions & Stash')}`);
  log(`  ${col('cyan', 'sessions')}       ${col('dim', '[n]')}    List saved conversations (default 20)`);
  log(`  ${col('cyan', 'sessions rm')}    ${col('dim', '<id>')}   Delete a conversation`);
  log(`  ${col('cyan', 'sessions stats')}         Conversation statistics`);
  log(`  ${col('cyan', 'stash')}          ${col('dim', '[text]')} Save text to stash (no arg = list)`);
  log(`  ${col('cyan', 'stash rm')}       ${col('dim', '<id>')}   Remove stash entry`);
  log(`  ${col('cyan', 'stash clear')}            Clear all stash entries`);
  log('');
  log(`  ${col('bold', 'Productivity & Automation')}`);
  log(`  ${col('cyan', 'watch')}          ${col('dim', '<interval> <cmd>')} Run command every N seconds`);
  log(`  ${col('cyan', 'bench')}          ${col('dim', '[count] <cmd>')}     Time command execution`);
  log(`  ${col('cyan', 'alias')}          ${col('dim', '[list|add|rm]')}     Save command shortcuts`);
  log(`  ${col('cyan', 'snippets')}       ${col('dim', '[list|add|show|rm]')} Save code blocks`);
  log(`  ${col('cyan', 'macros')}         ${col('dim', '[list|record|play|rm]')} Record command sequences`);
  log(`  ${col('cyan', 'history')}        ${col('dim', '[query]')}  Search command history`);
  log(`  ${col('cyan', 'recent')}         ${col('dim', '[n]')}    Show last N commands (default 10)`);
  log(`  ${col('cyan', 'context')}              Show workspace state`);
  log('');
  log(`  ${col('bold', 'Appearance')}`);
  log(`  ${col('cyan', 'theme')}        ${col('dim', '<dark|hacker|ocean|minimal>')} Switch color theme`);
  log(`  ${col('cyan', 'live-logs')}    ${col('dim', '[on|off|toggle|status]')}     Stream backend/frontend logs`);
  log('');
  log(`  ${col('bold', 'Setup & Maintenance')}`);
  log(`  ${col('cyan', 'install')}            Install deps, set up .env, check llama.cpp`);
  log(`  ${col('cyan', 'doctor')}             Full system health check`);
  log(`  ${col('cyan', 'update')}             Pull latest changes + reinstall`);
  log(`  ${col('cyan', 'uninstall')}          Remove asyncat from your system`);
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
  log(`  ${col('dim', 'Tip: press / to browse all commands interactively')}`);
  log('');
}

// ── Dispatch ───────────────────────────────────────────────────────────────────
async function dispatch(tokens) {
  const [cmd, ...args] = tokens;
  if (!cmd) return;

  // Handle macro playback
  if (cmd === 'macros' && (args[0] === 'play' || args[0] === 'run')) {
    const result = cmds.macros().run(args);
    if (result && result._macro) {
      info(`Playing macro with ${result.commands.length} commands...`);
      for (const macroCmd of result.commands) {
        const macroTokens = macroCmd.split(/\s+/);
        log(`  ${col('cyan', '▶')} ${macroCmd}`);
        await dispatch(macroTokens);
      }
      ok('Macro execution complete!');
      return;
    }
  }

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
    case 'chat':     await cmds.chat().run(args);         break;
    case 'run':      await cmds.run().run(args);          break;
    case 'provider': await cmds.provider().run(args);     break;
    case 'sessions': await cmds.sessions().run(args);     break;
    case 'watch':    cmds.watch().run(args);              break;
    case 'alias':    cmds.alias().run(args);              break;
    case 'recent':   cmds.recent().run(args);             break;
    case 'bench':    cmds.bench().run(args);              break;
    case 'context':  cmds.context().run();                break;
    case 'snippets': cmds.snippets().run(args);           break;
    case 'macros':   cmds.macros().run(args);             break;
    case 'history':  cmds.history().run(args);            break;
    case 'uninstall': cmds.uninstall().run();             break;
    case 'theme':    handleTheme(args);                   break;
    case 'stash':    handleStash(args);                   break;
    case 'live-logs': handleLiveLogs(args);               break;
    case 's':        cmds.start().run(args);              break;
    case 'c':        await cmds.chat().run(args);         break;
    case 'clear':
      console.clear();
      banner();
      break;
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
      warn(`Unknown command: ${col('white', cmd)}  (type ${col('cyan', 'help')} or ${col('cyan', '/')} to browse)`);
  }
}

// ── REPL ───────────────────────────────────────────────────────────────────────
const PROMPT_LEN = 'asyncat ▸ '.length;
const makePrompt = () => `${c.bold}${getTheme().accent}asyncat${c.reset}${c.dim} ▸ ${c.reset}`;

async function startREPL() {
  banner();
  cmds.status().run();

  const ll = new LiveLine(makePrompt(), PROMPT_LEN);
  setRl(ll);
  setLl(ll);

  ll.on('line', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) { ll.prompt(); return; }

    // Strip leading / (slash-command mode) — same command names underneath
    const tokens = (trimmed.startsWith('/') ? trimmed.slice(1) : trimmed).split(/\s+/);
    await dispatch(tokens);

    const cmd = tokens[0].toLowerCase();
    if (cmd !== 'exit' && cmd !== 'quit' && cmd !== 'q') {
      ll.restoreMainPrompt(makePrompt(), PROMPT_LEN);
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

// ── Entry point ────────────────────────────────────────────────────────────────
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
