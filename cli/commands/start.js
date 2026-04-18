import fs from 'fs';
import path from 'path';
import { ROOT } from '../lib/env.js';
import { err, info, col } from '../lib/colors.js';
import { startProc } from '../lib/procs.js';

export function run(args = []) {
  if (!fs.existsSync(path.join(ROOT, 'den/.env'))) {
    err(`den/.env not found — run ${col('cyan', 'install')} first.`); return;
  }
  if (!fs.existsSync(path.join(ROOT, 'den/node_modules'))) {
    err(`Dependencies missing — run ${col('cyan', 'install')} first.`); return;
  }

  const backendOnly  = args.includes('--backend-only')  || args.includes('-b');
  const frontendOnly = args.includes('--frontend-only') || args.includes('-f');

  if (backendOnly && frontendOnly) {
    err('Cannot use --backend-only and --frontend-only together.'); return;
  }

  if (!frontendOnly) {
    info('Starting backend  → ' + col('white', 'http://localhost:8716'));
    info('Backend auto-restart watches den/src, den/.env, and den/package.json');
    startProc('backend', 'den', 'npm', ['start'], 'cyan', {
      watchPaths: ['src', '.env', 'package.json'],
      watchLabel: 'backend changes',
      intervalMs: 1000,
    });
  }

  if (!backendOnly) {
    info('Starting frontend → ' + col('white', 'http://localhost:8717'));
    startProc('frontend', 'neko', 'npm', ['run', 'dev'], 'magenta');
  }
}
