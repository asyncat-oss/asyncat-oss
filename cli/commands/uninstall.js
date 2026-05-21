import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ROOT } from '../lib/env.js';
import { err, info, warn } from '../lib/colors.js';

export function run(args = []) {
  const purge = args.includes('--purge') || args.includes('--all');
  const isWin = process.platform === 'win32';
  const script = path.join(ROOT, isWin ? 'uninstall.ps1' : 'uninstall.sh');

  if (!fs.existsSync(script)) {
    err(`${path.basename(script)} not found in this installation.`);
    return;
  }

  info(`Running ${path.basename(script)}...`);
  const command = isWin ? 'powershell.exe' : 'sh';
  const scriptArgs = isWin
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...(purge ? ['-Purge'] : [])]
    : [script, ...(purge ? ['--purge'] : [])];

  const result = spawnSync(command, scriptArgs, {
    cwd: os.homedir(),
    stdio: 'inherit',
    windowsHide: false,
    env: {
      ...process.env,
      ASYNCAT_INSTALL_DIR: process.env.ASYNCAT_INSTALL_DIR || ROOT,
    },
  });

  if (result.error) {
    warn(result.error.message);
    process.exitCode = 1;
    return;
  }

  process.exitCode = result.status || 0;
}
