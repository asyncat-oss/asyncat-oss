import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ROOT } from '../lib/env.js';
import { log, col } from '../lib/colors.js';

function tryExec(cmd) {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch (_) { return null; }
}

function checkCmd(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

export function run() {
  log('');

  let asyncatVer = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    asyncatVer = pkg.version || 'unknown';
  } catch (_) {}
  log(`  ${col('magenta', col('bold', 'asyncat'))}         ${col('white', 'v' + asyncatVer)}`);

  const nodeVer = tryExec('node --version');
  log(`  ${col('cyan', 'node           ')} ${nodeVer ? col('white', nodeVer) : col('dim', 'not found')}`);

  const npmVer = tryExec('npm --version');
  log(`  ${col('cyan', 'npm            ')} ${npmVer ? col('white', 'v' + npmVer) : col('dim', 'not found')}`);

  const python = ['python3', 'python'].find(c => checkCmd(c));
  if (python) {
    const pyVer = tryExec(`${python} --version`);
    log(`  ${col('cyan', 'python         ')} ${pyVer ? col('white', pyVer.replace('Python ', 'v')) : col('dim', 'not found')}`);
  } else {
    log(`  ${col('dim', 'python           not found')}`);
  }

  const llamaVer = tryExec('llama-server --version');
  if (llamaVer) {
    log(`  ${col('cyan', 'llama-server   ')} ${col('white', llamaVer.split('\n')[0])}`);
  } else {
    log(`  ${col('dim', 'llama-server     not found')}`);
  }

  const gitHash = tryExec('git rev-parse --short HEAD');
  if (gitHash) {
    log(`  ${col('cyan', 'git commit     ')} ${col('dim', gitHash)}`);
  } else {
    log(`  ${col('dim', 'git commit       unknown')}`);
  }

  log('');
}
