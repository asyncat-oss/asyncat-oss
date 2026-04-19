import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ROOT } from '../lib/env.js';
import { log, ok, err, warn, info, col } from '../lib/colors.js';

function checkCmd(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function detectPackageManager(cwd = ROOT) {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function runInstall(cwd, label) {
  const pm = detectPackageManager(cwd);
  const cmd = `${pm} install`;
  info(`Reinstalling ${label} packages with ${col('cyan', pm)}...`);
  try {
    execSync(cmd, { cwd, stdio: 'ignore' });
    ok(`${label} packages updated (${pm})`);
  } catch (_) {
    warn(`Failed to reinstall ${label} packages — try manually with: ${cmd}`);
  }
}

export function run() {
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

  const pm = detectPackageManager();
  log(col('bold', `  Reinstalling dependencies (detected: ${col('cyan', pm)})...`));
  log('');

  runInstall(ROOT,                    'root');
  runInstall(path.join(ROOT, 'den'),  'backend');
  runInstall(path.join(ROOT, 'neko'), 'frontend');

  log('');
  ok('Update complete!');
  log('');
}
