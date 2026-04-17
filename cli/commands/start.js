'use strict';

const fs   = require('fs');
const path = require('path');
const { ROOT } = require('../lib/env');
const { err, info, col } = require('../lib/colors');
const { startProc } = require('../lib/procs');

function run() {
  if (!fs.existsSync(path.join(ROOT, 'den/.env'))) {
    err(`den/.env not found — run ${col('cyan', 'install')} first.`); return;
  }
  if (!fs.existsSync(path.join(ROOT, 'den/node_modules'))) {
    err(`Dependencies missing — run ${col('cyan', 'install')} first.`); return;
  }
  info('Starting backend  → ' + col('white', 'http://localhost:3000'));
  info('Starting frontend → ' + col('white', 'http://localhost:5173'));
  startProc('backend',  'den',  'npm', ['run', 'dev'], 'cyan');
  startProc('frontend', 'neko', 'npm', ['run', 'dev'], 'magenta');
}

module.exports = { run };
