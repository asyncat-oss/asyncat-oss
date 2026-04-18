#!/usr/bin/env node
'use strict';

const os   = require('os');
const path = require('path');
const fs   = require('fs');
const { execSync, execFileSync } = require('child_process');

const ASYNCAT_HOME = process.env.ASYNCAT_HOME || path.join(os.homedir(), '.asyncat');
const REPO_URL = 'https://github.com/asyncat-oss/asyncat-oss.git';

// ── Detect if we're running from inside the full cloned repo ─────────────────
// cli/bin/asyncat.js is three levels deep from the repo root
const repoRoot = path.resolve(__dirname, '..', '..');
const isInsideRepo =
  fs.existsSync(path.join(repoRoot, 'cat')) &&
  fs.existsSync(path.join(repoRoot, 'den')) &&
  fs.existsSync(path.join(repoRoot, 'neko'));

if (isInsideRepo) {
  // Running from the cloned repo (dev / git install) — delegate to local CLI
  require(path.join(repoRoot, 'cli', 'index.js'));
  return;
}

// ── Global npm install path — bootstrap then delegate to ~/.asyncat ───────────
if (!fs.existsSync(path.join(ASYNCAT_HOME, 'cat'))) {
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
}

// Delegate all args to the real CLI at ~/.asyncat
try {
  execFileSync(process.execPath, [path.join(ASYNCAT_HOME, 'cat'), ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
} catch (e) {
  process.exit(e.status || 1);
}

function gitInstalled() {
  try { execSync('git --version', { stdio: 'ignore' }); return true; } catch { return false; }
}
