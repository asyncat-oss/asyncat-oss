import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ROOT } from '../lib/env.js';
import { log, ok, info, col } from '../lib/colors.js';

export function run() {
  log('');
  log(`${col('bold', 'Workspace Context')}`);
  log(col('dim', '─'.repeat(60)));
  log('');

  // Root directory
  log(`${col('cyan', 'Root')}     ${ROOT}`);

  // Git info
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim();
    const commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
    const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
    log(`${col('cyan', 'Branch')}   ${col('green', branch)}`);
    log(`${col('cyan', 'Commit')}   ${col('dim', commit)}`);
    log(`${col('cyan', 'Status')}   ${status ? col('yellow', 'dirty') : col('green', 'clean')}`);
  } catch {}

  // Subdirectories
  const dirs = {
    'Backend': path.join(ROOT, 'den'),
    'Frontend': path.join(ROOT, 'neko'),
    'CLI': path.join(ROOT, 'cli'),
  };

  log('');
  for (const [name, dir] of Object.entries(dirs)) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const nodeModules = fs.existsSync(path.join(dir, 'node_modules'));
      log(`${col('cyan', name.padEnd(10))} ${col('dim', 'v' + (pkg.version || 'unknown'))} ${nodeModules ? col('green', '✓') : col('yellow', '⚠')} deps`);
    }
  }

  // Environment
  log('');
  log(`${col('bold', 'Environment')}`);
  log(col('dim', '─'.repeat(60)));

  const envFile = path.join(ROOT, 'den/.env');
  if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, 'utf8');
    const envVars = envContent.split('\n').filter(l => l && !l.startsWith('#')).length;
    log(`${col('cyan', '.env vars')}  ${col('green', envVars)} configured`);
  }

  log('');
}
