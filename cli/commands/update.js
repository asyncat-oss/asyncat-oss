'use strict';

const { execSync } = require('child_process');
const path = require('path');
const { ROOT } = require('../lib/env');
const { log, ok, err, warn, info, col } = require('../lib/colors');

function checkCmd(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function runInstall(cwd, label) {
  info(`Reinstalling ${label} packages...`);
  try {
    execSync('npm install', { cwd, stdio: 'ignore' });
    ok(`${label} packages updated`);
  } catch (_) {
    warn(`Failed to reinstall ${label} packages — try manually`);
  }
}

function run() {
  if (!checkCmd('git')) {
    err('git not found — cannot update.');
    return;
  }

  log('');
  info('Checking for updates...');

  let output;
  try {
    output = execSync('git pull', { cwd: ROOT }).toString().trim();
  } catch (e) {
    err(`git pull failed: ${e.message}`);
    return;
  }

  log(`  ${col('dim', output)}`);

  if (output.includes('Already up to date') || output.includes('Already up-to-date')) {
    ok('Already up to date.');
    log('');
    return;
  }

  ok('Changes pulled.');
  log('');
  log(col('bold', '  Reinstalling dependencies...'));
  log('');

  runInstall(ROOT,                    'root');
  runInstall(path.join(ROOT, 'den'),  'backend');
  runInstall(path.join(ROOT, 'neko'), 'frontend');

  log('');
  ok('Update complete!');
  log('');
}

module.exports = { run };
