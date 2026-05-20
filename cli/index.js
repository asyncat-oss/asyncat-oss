// Asyncat CLI entry point.

import { banner } from './lib/colors.js';

const COMMANDS = {
  agent:     './commands/agent.js',
  chat:      './commands/chat.js',
  config:    './commands/config.js',
  doctor:    './commands/doctor.js',
  install:   './commands/install.js',
  logs:      './commands/logs.js',
  mcp:       './commands/mcp.js',
  models:    './commands/models.js',
  open:      './commands/open.js',
  provider:  './commands/provider.js',
  run:       './commands/run.js',
  start:     './commands/start.js',
  status:    './commands/status.js',
  stop:      './commands/stop.js',
  uninstall: './commands/uninstall.js',
  update:    './commands/update.js',
  version:   './commands/version.js',
};

const ALIASES = {
  ui: 'start',
};

const HELP_LINES = [
  'Usage: asyncat [command] [args]',
  '',
  'Run without arguments to start and open the Web UI.',
  '',
  'Commands:',
  '  start [--no-open]     Start backend and frontend',
  '  stop                  Stop Asyncat services',
  '  status                Show service status',
  '  restart [args]        Stop, then start services',
  '  open                  Open the Web UI',
  '  logs [scope]          Show logs',
  '  doctor                Run health checks',
  '  install               Install local dependencies',
  '  update                Pull the latest repo changes',
  '  config                Read or write config',
  '  models                Manage local models',
  '  provider              Configure the AI provider',
  '  chat                  Terminal chat (requires backend)',
  '  run                   Terminal chat with local model',
  '  agent <goal>          Run the AI agent',
  '  mcp                   Manage MCP servers',
  '  version               Show version info',
  '',
  'Use asyncat <command> --help for command-specific help where available.',
];

async function loadCommand(name) {
  const modulePath = COMMANDS[name];
  if (!modulePath) return null;
  return import(modulePath);
}

function normalizeCommand(value) {
  const raw = String(value || '').replace(/^\//, '');
  return ALIASES[raw] || raw;
}

function printHelp() {
  banner();
  for (const line of HELP_LINES) console.log(`  ${line}`);
}

async function runCommand(command, args = []) {
  if (command === 'restart') {
    const stop = await loadCommand('stop');
    const start = await loadCommand('start');
    stop.run();
    await start.run(args);
    return;
  }

  if (command === 'help') {
    printHelp();
    return;
  }

  const mod = await loadCommand(command);
  if (!mod?.run) {
    console.log(`  Unknown command: ${command}`);
    console.log('  Use asyncat help for available commands.');
    return;
  }

  await mod.run(args);
}

const argv = process.argv.slice(2);
const [first, ...rest] = argv;

if (!first) {
  await runCommand('start', []);
} else if (first === '--version' || first === '-v') {
  await runCommand('version', []);
} else if (first === '--help' || first === '-h') {
  printHelp();
} else {
  await runCommand(normalizeCommand(first), rest);
}
