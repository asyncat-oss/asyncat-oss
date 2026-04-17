'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { ROOT, readEnv } = require('../lib/env');
const { log, ok, err, warn, col } = require('../lib/colors');
const { procs } = require('../lib/procs');

function checkCmd(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function portRunning(port) {
  try {
    const out = execSync(`lsof -ti :${port} 2>/dev/null`).toString().trim();
    return out.length > 0;
  } catch (_) { return false; }
}

function diskFreeGB(dir) {
  try {
    // df -k gives 1K blocks; column 4 is available
    const out = execSync(`df -k "${dir}" 2>/dev/null`).toString().split('\n')[1];
    if (!out) return Infinity;
    const avail = parseInt(out.trim().split(/\s+/)[3], 10);
    return avail / (1024 * 1024); // convert KB → GB
  } catch (_) { return Infinity; }
}

function run() {
  log('');
  log(col('bold', '  asyncat doctor'));
  log('');

  let passed = 0, warnings = 0, failures = 0;

  function pass(msg)    { ok(msg);   passed++;   }
  function fail(msg)    { err(msg);  failures++; }
  function warnIt(msg)  { warn(msg); warnings++; }

  // 1. Node.js >= 20
  try {
    const nodeVer = execSync('node --version').toString().trim();
    const major = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
    if (major >= 20) pass(`Node.js ${nodeVer} (>= 20 required)`);
    else fail(`Node.js ${nodeVer} — version 20+ required`);
  } catch (_) { fail('Node.js not found'); }

  // 2. npm >= 8
  try {
    const npmVer = execSync('npm --version').toString().trim();
    const major = parseInt(npmVer.split('.')[0], 10);
    if (major >= 8) pass(`npm ${npmVer} (>= 8 required)`);
    else warnIt(`npm ${npmVer} — version 8+ recommended`);
  } catch (_) { fail('npm not found'); }

  // 3. Python (optional)
  const python = ['python3', 'python'].find(c => {
    try { execSync(`command -v ${c}`, { stdio: 'ignore' }); return true; } catch { return false; }
  });
  if (python) {
    try {
      const ver = execSync(`${python} --version`).toString().trim();
      pass(`${ver} available`);
    } catch (_) { warnIt('Python found but version check failed'); }
  } else {
    warnIt('Python not found (optional — needed for llama-cpp-python)');
  }

  // 4. den/.env exists
  const denEnvPath = path.join(ROOT, 'den/.env');
  if (fs.existsSync(denEnvPath)) pass('den/.env exists');
  else fail(`den/.env missing — run ${col('cyan', 'install')}`);

  // 5. neko/.env exists
  if (fs.existsSync(path.join(ROOT, 'neko/.env'))) pass('neko/.env exists');
  else fail(`neko/.env missing — run ${col('cyan', 'install')}`);

  // 6. JWT_SECRET set and not default
  if (fs.existsSync(denEnvPath)) {
    const env = readEnv('den/.env');
    const jwt = env['JWT_SECRET'] || '';
    if (!jwt) fail('JWT_SECRET is not set in den/.env');
    else if (jwt === 'change_me_please' || jwt === 'your-secret-here' ||
             jwt === 'changeme' || jwt.toLowerCase().includes('example') ||
             jwt.toLowerCase().includes('secret') && jwt.length < 20) {
      warnIt('JWT_SECRET looks like a default value — change it before deploying');
    } else pass('JWT_SECRET is set');
  }

  // 7. den/node_modules
  if (fs.existsSync(path.join(ROOT, 'den/node_modules'))) pass('den/node_modules exists');
  else fail(`den/node_modules missing — run ${col('cyan', 'install')}`);

  // 8. neko/node_modules
  if (fs.existsSync(path.join(ROOT, 'neko/node_modules'))) pass('neko/node_modules exists');
  else fail(`neko/node_modules missing — run ${col('cyan', 'install')}`);

  // 9. Port 3000 free or backend running
  const backendRunning = (procs.backend !== null) || portRunning(3000);
  if (backendRunning) pass('Port 3000 in use (backend running)');
  else pass('Port 3000 free');

  // 10. Port 5173 free or frontend running
  const frontendRunning = (procs.frontend !== null) || portRunning(5173);
  if (frontendRunning) pass('Port 5173 in use (frontend running)');
  else pass('Port 5173 free');

  // 11. Port 8765 free or llama-server running
  const llamaRunning = portRunning(8765);
  if (llamaRunning) pass('Port 8765 in use (llama-server running)');
  else pass('Port 8765 free');

  // 12. data/asyncat.db
  if (fs.existsSync(path.join(ROOT, 'data/asyncat.db'))) pass('data/asyncat.db exists');
  else warnIt('data/asyncat.db not found — will be created on first run (SOLO_MODE)');

  // 13. llama-server detectable (optional)
  const llamaPaths = [
    path.join(os.homedir(), '.unsloth/llama.cpp/build/bin/llama-server'),
    path.join(os.homedir(), '.unsloth/llama.cpp/llama-server'),
    path.join(os.homedir(), '.local/bin/llama-server'),
    path.join(os.homedir(), 'bin/llama-server'),
    '/usr/local/bin/llama-server',
    '/usr/bin/llama-server',
    '/opt/homebrew/bin/llama-server',
  ];
  const llamaBin = checkCmd('llama-server') ||
    llamaPaths.some(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  const llamaPython = python && (() => {
    try { execSync(`${python} -c "import llama_cpp"`, { stdio: 'ignore' }); return true; } catch { return false; }
  })();
  if (llamaBin || llamaPython) pass('llama-server / llama-cpp-python detected');
  else warnIt('llama-server not found (optional — cloud AI still works)');

  // 14. Git repo clean
  if (checkCmd('git')) {
    try {
      const status = execSync('git status --porcelain 2>/dev/null', { cwd: ROOT }).toString().trim();
      if (status.length === 0) pass('Git working tree is clean');
      else warnIt(`Uncommitted git changes detected (${status.split('\n').length} file(s))`);
    } catch (_) { warnIt('Could not check git status'); }
  } else {
    warnIt('git not found — cannot check repo state');
  }

  // 15. Disk space
  const freeGB = diskFreeGB(ROOT);
  if (freeGB < 1) warnIt(`Low disk space: ${freeGB.toFixed(2)} GB free (< 1 GB)`);
  else pass(`Disk space: ${freeGB.toFixed(1)} GB free`);

  // Summary
  log('');
  const total = passed + warnings + failures;
  const summaryParts = [
    col('green',  `${passed} passed`),
    warnings > 0 ? col('yellow', `${warnings} warnings`) : col('dim', '0 warnings'),
    failures > 0 ? col('red',    `${failures} failures`) : col('dim', '0 failures'),
  ];
  log(`  ${summaryParts.join(col('dim', ' · '))}  ${col('dim', `(${total} checks)`)}`);
  log('');
}

module.exports = { run };
