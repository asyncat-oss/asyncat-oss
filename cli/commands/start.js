import fs from 'fs';
import path from 'path';
import { ROOT } from '../lib/env.js';
import { err, info, warn, col } from '../lib/colors.js';
import { startProc } from '../lib/procs.js';
import { run as runOnboard } from './onboard.js';

function isFirstRun() {
  const home = process.env.ASYNCAT_HOME || path.join(process.env.HOME || process.env.USERPROFILE, '.asyncat');
  return !fs.existsSync(path.join(home, '.first-run'));
}

function depsInstalled() {
  return fs.existsSync(path.join(ROOT, 'node_modules')) ||
    fs.existsSync(path.join(ROOT, 'den/node_modules'));
}

export async function run(args = []) {
  // Auto-trigger onboard on first run
  if (isFirstRun()) {
    warn('First run detected. Running onboard wizard...');
    await runOnboard();
  }

  if (!fs.existsSync(path.join(ROOT, 'den/.env'))) {
    err(`den/.env not found — run ${col('cyan', 'install')} first.`); return;
  }
  if (!depsInstalled()) {
    err(`Dependencies missing — run ${col('cyan', 'install')} first.`); return;
  }

  const backendOnly  = args.includes('--backend-only')  || args.includes('-b');
  const frontendOnly = args.includes('--frontend-only') || args.includes('-f');

  if (backendOnly && frontendOnly) {
    err('Cannot use --backend-only and --frontend-only together.'); return;
  }

  if (!frontendOnly) {
    info('Starting backend  → ' + col('white', 'http://localhost:7716'));
    info('Backend auto-restart watches den/src, den/.env, and den/package.json');
    startProc('backend', 'den', 'npm', ['start'], 'cyan', {
      watchPaths: ['src', '.env', 'package.json'],
      watchLabel: 'backend changes',
      intervalMs: 1000,
    });
  }

  if (!backendOnly) {
    info('Starting frontend → ' + col('white', 'http://localhost:7717'));
    startProc('frontend', 'neko', 'npm', ['run', 'dev'], 'magenta');
  }
}
