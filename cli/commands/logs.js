import fs from 'fs';
import path from 'path';
import { ROOT } from '../lib/env.js';
import { log, info, warn, col } from '../lib/colors.js';
import { procs } from '../lib/procs.js';

const LOGS_DIR = path.join(ROOT, 'logs');

function tailFile(file, label, color) {
  if (!fs.existsSync(file)) {
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

export function run(args) {
  const sub = (args && args[0]) || 'all';
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

  const showBackend  = sub === 'backend'  || sub === 'all';
  const showFrontend = sub === 'frontend' || sub === 'all';

  if (sub !== 'backend' && sub !== 'frontend' && sub !== 'all') {
    warn(`Unknown logs subcommand: ${col('white', sub)}`);
    log(`  Usage: ${col('cyan', 'logs')} ${col('dim', '[backend|frontend|all]')}`);
    return;
  }

  if (showBackend  && procs.backend)  info('Backend is running — output is streaming live in this terminal.');
  if (showFrontend && procs.frontend) info('Frontend is running — output is streaming live in this terminal.');

  if (showBackend)  tailFile(path.join(LOGS_DIR, 'backend.log'),  'backend',  'cyan');
  if (showFrontend) tailFile(path.join(LOGS_DIR, 'frontend.log'), 'frontend', 'magenta');
}
