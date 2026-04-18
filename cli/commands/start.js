'use strict';

const fs   = require('fs');
const path = require('path');
const { ROOT } = require('../lib/env');
const { err, info, col } = require('../lib/colors');
const { startProc } = require('../lib/procs');

function run(args = []) {
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
    startProc('backend',  'den',  'npm', ['run', 'dev'], 'cyan');
  }
  if (!backendOnly) {
    info('Starting frontend → ' + col('white', 'http://localhost:8717'));
    startProc('frontend', 'neko', 'npm', ['run', 'dev'], 'magenta');
  }
}

module.exports = { run };
