import fs from 'fs';
import path from 'path';
import { ROOT } from '../lib/env.js';
import { err, info, col } from '../lib/colors.js';
import { startProc } from '../lib/procs.js';
import { getFrontendUrl, openFrontend } from './open.js';

function depsInstalled() {
  return fs.existsSync(path.join(ROOT, 'node_modules')) ||
    fs.existsSync(path.join(ROOT, 'den/node_modules'));
}

export async function run(args = []) {
  if (!fs.existsSync(path.join(ROOT, 'den/.env'))) {
    err(`den/.env not found — run ${col('cyan', 'install')} first.`); return;
  }
  if (!depsInstalled()) {
    err(`Dependencies missing — run ${col('cyan', 'install')} first.`); return;
  }

  const backendOnly  = args.includes('--backend-only')  || args.includes('-b');
  const frontendOnly = args.includes('--frontend-only') || args.includes('-f');
  const shouldOpen = !backendOnly && !args.includes('--no-open');

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
    const hasFrontendBuild = fs.existsSync(path.join(ROOT, 'neko/dist'));
    const frontendArgs = hasFrontendBuild && !args.includes('--dev')
      ? ['run', 'preview', '--', '--host', '127.0.0.1']
      : ['run', 'dev', '--', '--host', '127.0.0.1'];
    info('Starting frontend → ' + col('white', getFrontendUrl()));
    startProc('frontend', 'neko', 'npm', frontendArgs, 'magenta');
  }

  if (shouldOpen) {
    info('Opening Web UI → ' + col('white', getFrontendUrl()));
    setTimeout(() => openFrontend(), 1800).unref?.();
  }
}
