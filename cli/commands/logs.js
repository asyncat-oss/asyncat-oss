import fs from 'fs';
import path from 'path';
import { ROOT } from '../lib/env.js';
import { log, info, warn, col } from '../lib/colors.js';
import { procs } from '../lib/procs.js';
import { readRecentLogs } from '../lib/logger.js';

const LOGS_DIR = path.join(ROOT, 'logs');
const CLI_LOG_TYPES = ['ui', 'commands', 'agent', 'error', 'startup'];
const BACKEND_LOG_TYPES = ['app', 'http', 'error', 'process'];

function tailFile(file, label, color, options = {}) {
  if (!fs.existsSync(file)) {
    if (options.optional) {
      log('');
      log(`  ${col(color, col('bold', label + ' log'))} ${col('dim', '(no logs yet)')}`);
      return;
    }
    warn(`Log file not found: ${path.relative(ROOT, file)}`);
    return;
  }
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const recent = lines.slice(-50);
  log('');
  log(`  ${col(color, col('bold', label + ' log'))} ${col('dim', '(last ' + recent.length + ' lines)')}`);
  log(col('dim', '  ' + '─'.repeat(60)));
  for (const l of recent) log(`  ${col('dim', l)}`);
  log(col('dim', '  ' + '─'.repeat(60)));
  log('');
}

function tailCliLog(category, label) {
  const lines = readRecentLogs(category, 50);
  log('');
  log(`  ${col('green', col('bold', label + ' log'))} ${col('dim', '(last ' + lines.length + ' lines)')}`);
  log(col('dim', '  ' + '─'.repeat(60)));
  if (lines.length === 0) {
    log(`  ${col('dim', '(no logs yet)')}`);
  } else {
    for (const l of lines) log(`  ${col('dim', l)}`);
  }
  log(col('dim', '  ' + '─'.repeat(60)));
  log('');
}

function tailBackendLogs() {
  log('');
  log(`  ${col('cyan', col('bold', 'Backend logs'))} ${col('dim', '(logs/backend/)')}`);

  for (const type of BACKEND_LOG_TYPES) {
    const file = path.join(LOGS_DIR, 'backend', type, `${type}-${getDateStamp()}.log`);
    tailFile(file, `backend/${type}`, 'cyan', { optional: true });
  }
}

export function run(args) {
  const sub = (args && args[0]) || 'all';

  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

  if (sub === 'cli' || sub === 'all') {
    log('');
    log(`  ${col('magenta', col('bold', '─ CLI Logs ─'))}`);
  }

  const showBackend  = sub === 'backend'  || sub === 'all';
  const showFrontend = sub === 'frontend' || sub === 'all';
  const showCli      = sub === 'cli'     || sub === 'all';

  if (showCli) {
    log('');
    log(`  ${col('cyan', col('bold', 'CLI logs'))} ${col('dim', '(logs/cli/)')}`);
    log(col('dim', '  ' + '─'.repeat(60)));
    for (const cat of CLI_LOG_TYPES) {
      const label = cat.padEnd(10);
      const filePath = path.join(LOGS_DIR, 'cli', `${cat}-${getDateStamp()}.log`);
      const exists = fs.existsSync(filePath);
      const lines = exists ? fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).slice(-10) : [];
      const status = exists ? col('green', '✓') : col('dim', '○');
      log(`  ${status}  ${col('white', label)} ${col('dim', lines.length + ' recent lines')}`);
    }
    log('');
  }

  if (sub === 'cli-view') {
    const viewArg = args[1] || 'ui';
    if (!CLI_LOG_TYPES.includes(viewArg)) {
      warn(`Unknown CLI log type: ${col('white', viewArg)}`);
      log(`  Usage: ${col('cyan', 'logs cli-view')} ${col('dim', '[ui|commands|agent|error|startup]')}`);
      return;
    }
    tailCliLog(viewArg, viewArg);
    return;
  }

  if (sub !== 'backend' && sub !== 'frontend' && sub !== 'all' && sub !== 'cli') {
    warn(`Unknown logs subcommand: ${col('white', sub)}`);
    log(`  Usage: ${col('cyan', 'logs')} ${col('dim', '[backend|frontend|cli|cli-view|all]')}`);
    log(`  ${col('dim', 'cli-view options:')} ${col('white', CLI_LOG_TYPES.join(' | '))}`);
    return;
  }

  if (showBackend  && procs.backend)  info('Backend is running — output is streaming live in this terminal.');
  if (showFrontend && procs.frontend) info('Frontend is running — output is streaming live in this terminal.');

  if (showBackend)  tailBackendLogs();
  if (showFrontend) tailFile(path.join(LOGS_DIR, 'frontend.log'), 'frontend', 'magenta');

  if (sub === 'all') {
    log('');
    log(`  ${col('magenta', col('bold', '─ CLI Logs ─'))}`);
    for (const cat of CLI_LOG_TYPES) {
      tailCliLog(cat, cat);
    }
  }
}

function getDateStamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
