#!/usr/bin/env node

import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASYNCAT_HOME = process.env.ASYNCAT_HOME || path.join(os.homedir(), '.asyncat');
const REPO_URL = 'https://github.com/asyncat-oss/asyncat-oss.git';

const repoRoot = path.resolve(__dirname, '..', '..');
const isInsideRepo =
  fs.existsSync(path.join(repoRoot, 'cat')) &&
  fs.existsSync(path.join(repoRoot, 'den')) &&
  fs.existsSync(path.join(repoRoot, 'neko'));

if (isInsideRepo) {
  await import(pathToFileURL(path.join(repoRoot, 'cli', 'index.js')).href);
} else {
  if (!fs.existsSync(path.join(ASYNCAT_HOME, 'cat'))) {
    // ── First run: clone ────────────────────────────────────────────────
    console.log('\n[asyncat] First run — installing asyncat to ' + ASYNCAT_HOME + '...\n');

    if (!gitInstalled()) {
      console.error('[asyncat] git is required. Install it from https://git-scm.com');
      process.exit(1);
    }

    try {
      execSync(`git clone --depth=1 "${REPO_URL}" "${ASYNCAT_HOME}"`, { stdio: 'inherit' });
      execSync('npm install --silent', { cwd: ASYNCAT_HOME, stdio: 'inherit' });
      console.log('\n[asyncat] Installed! Run  asyncat install  to finish setup.\n');
    } catch (e) {
      console.error('\n[asyncat] Installation failed:', e.message);
      process.exit(1);
    }
  } else if (gitInstalled()) {
    // ── Subsequent runs: pull updates silently in background ────────────
    try {
      const before = execSync('git -C "' + ASYNCAT_HOME + '" rev-parse HEAD', { stdio: 'pipe' }).toString().trim();
      execSync('git -C "' + ASYNCAT_HOME + '" pull --ff-only --quiet', { stdio: 'ignore', timeout: 8000 });
      const after = execSync('git -C "' + ASYNCAT_HOME + '" rev-parse HEAD', { stdio: 'pipe' }).toString().trim();
      if (before !== after) {
        execSync('npm install --silent', { cwd: ASYNCAT_HOME, stdio: 'ignore' });
        console.log('[asyncat] ✓ Updated to latest version');
      }
    } catch {
      // Network unavailable or not ff-only — silently continue with current version
    }
  }

  try {
    execFileSync(process.execPath, [path.join(ASYNCAT_HOME, 'cat'), ...process.argv.slice(2)], {
      stdio: 'inherit',
    });
  } catch (e) {
    process.exit(e.status || 1);
  }
}

function gitInstalled() {
  try { execSync('git --version', { stdio: 'ignore' }); return true; } catch { return false; }
}
