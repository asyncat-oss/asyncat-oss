'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { ROOT } = require('../lib/env');
const { log, col } = require('../lib/colors');

function tryExec(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch (_) { return null; }
}

function checkCmd(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function run() {
  log('');

  // asyncat version from package.json
  let asyncatVer = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    asyncatVer = pkg.version || 'unknown';
  } catch (_) {}
  log(`  ${col('magenta', col('bold', 'asyncat'))}         ${col('white', 'v' + asyncatVer)}`);

  // Node.js
  const nodeVer = tryExec('node --version');
  log(`  ${col('cyan',  'node           ')} ${nodeVer ? col('white', nodeVer) : col('dim', 'not found')}`);

  // npm
  const npmVer = tryExec('npm --version');
  log(`  ${col('cyan',  'npm            ')} ${npmVer ? col('white', 'v' + npmVer) : col('dim', 'not found')}`);

  // Python
  const python = ['python3', 'python'].find(c => checkCmd(c));
  if (python) {
    const pyVer = tryExec(`${python} --version`);
    log(`  ${col('cyan',  'python         ')} ${pyVer ? col('white', pyVer.replace('Python ', 'v')) : col('dim', 'not found')}`);
  } else {
    log(`  ${col('dim',   'python           not found')}`);
  }

  // llama-server
  const llamaVer = tryExec('llama-server --version');
  if (llamaVer) {
    log(`  ${col('cyan',  'llama-server   ')} ${col('white', llamaVer.split('\n')[0])}`);
  } else {
    log(`  ${col('dim',   'llama-server     not found')}`);
  }

  // git commit hash
  const gitHash = tryExec('git rev-parse --short HEAD');
  if (gitHash) {
    log(`  ${col('cyan',  'git commit     ')} ${col('dim', gitHash)}`);
  } else {
    log(`  ${col('dim',   'git commit       unknown')}`);
  }

  log('');
}

module.exports = { run };
