import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ROOT, readEnv } from '../lib/env.js';
import { log, ok, err, warn, col } from '../lib/colors.js';
import { procs } from '../lib/procs.js';
import {
  detectGpu,
  findExistingLlamaServer,
  gpuAdvice,
  managedEngineDir,
  managedLlamaBinaryPath,
} from '../lib/localEngine.js';

function checkCmd(cmd) {
  try {
    execSync(`${process.platform === 'win32' ? 'where' : 'command -v'} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function portRunning(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync('netstat -ano -p TCP', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return out.split(/\r?\n/).some(line => line.includes(`:${port} `) && /LISTENING/i.test(line));
    } catch (_) { return false; }
  }

  try {
    const out = execSync(`lsof -ti :${port} 2>/dev/null`).toString().trim();
    return out.length > 0;
  } catch (_) {
    try {
      const out = execSync(`ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null`, { encoding: 'utf8' });
      return out.split(/\r?\n/).some(line => line.includes(`:${port} `));
    } catch {
      return false;
    }
  }
}

function diskFreeGB(dir) {
  if (process.platform === 'win32') return Infinity;
  try {
    const out = execSync(`df -k "${dir}" 2>/dev/null`).toString().split('\n')[1];
    if (!out) return Infinity;
    const avail = parseInt(out.trim().split(/\s+/)[3], 10);
    return avail / (1024 * 1024);
  } catch (_) { return Infinity; }
}

export function run() {
  log('');
  log(col('bold', '  asyncat doctor'));
  log('');

  let passed = 0, warnings = 0, failures = 0;

  const pass   = (msg) => { ok(msg);   passed++;   };
  const fail   = (msg) => { err(msg);  failures++; };
  const warnIt = (msg) => { warn(msg); warnings++; };

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

  // 3. git
  try {
    const gitVer = execSync('git --version').toString().trim().replace(/^git version /, '');
    pass(`git ${gitVer}`);
  } catch (_) { fail('git not found'); }

  // 4. Python (optional fallback only)
  const python = (process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python']).find(checkCmd);
  if (python) {
    try {
      const ver = execSync(`${python} --version`).toString().trim();
      pass(`${ver} available (optional fallback only)`);
    } catch (_) { warnIt('Python found but version check failed'); }
  } else {
    warnIt('Python not found (optional — managed llama.cpp binary is preferred)');
  }

  // 5. den/.env exists
  const denEnvPath = path.join(ROOT, 'den/.env');
  if (fs.existsSync(denEnvPath)) pass('den/.env exists');
  else fail(`den/.env missing — run ${col('cyan', 'install')}`);

  // 6. neko/.env exists
  if (fs.existsSync(path.join(ROOT, 'neko/.env'))) pass('neko/.env exists');
  else fail(`neko/.env missing — run ${col('cyan', 'install')}`);

  // 7. JWT_SECRET set and not default
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

  // 8. workspace dependencies
  if (fs.existsSync(path.join(ROOT, 'node_modules'))) pass('workspace node_modules exists');
  else fail(`node_modules missing — run ${col('cyan', 'install')}`);

  if (fs.existsSync(path.join(ROOT, 'den/node_modules'))) pass('den/node_modules exists');
  else warnIt('den/node_modules not present (ok for npm workspaces if root node_modules exists)');

  if (fs.existsSync(path.join(ROOT, 'neko/node_modules'))) pass('neko/node_modules exists');
  else warnIt('neko/node_modules not present (ok for npm workspaces if root node_modules exists)');

  // 9. Ports
  const backendRunning = (procs.backend !== null) || portRunning(8716);
  if (backendRunning) pass('Port 8716 in use (backend running)');
  else pass('Port 8716 free');

  const frontendRunning = (procs.frontend !== null) || portRunning(8717);
  if (frontendRunning) pass('Port 8717 in use (frontend running)');
  else pass('Port 8717 free');

  const llamaRunning = portRunning(8765);
  if (llamaRunning) pass('Port 8765 in use (llama-server running)');
  else pass('Port 8765 free');

  // 10. data/asyncat.db
  if (fs.existsSync(path.join(ROOT, 'den/data/asyncat.db'))) pass('den/data/asyncat.db exists');
  else warnIt('data/asyncat.db not found — will be created on first run');

  // 11. Local engine
  const env = readEnv('den/.env');
  const managedPath = managedLlamaBinaryPath();
  if (fs.existsSync(managedPath)) pass(`Managed llama.cpp binary exists: ${managedPath}`);
  else warnIt(`Managed llama.cpp binary not found at ${managedPath}`);

  const configuredPath = env.LLAMA_BINARY_PATH || '';
  if (configuredPath) {
    if (fs.existsSync(configuredPath)) pass(`LLAMA_BINARY_PATH exists: ${configuredPath}`);
    else fail(`LLAMA_BINARY_PATH points to a missing file: ${configuredPath}`);
  }

  const localEngine = findExistingLlamaServer();
  if (localEngine.found) {
    pass(`llama-server detected (${localEngine.source})`);
  } else {
    warnIt(`llama-server not found — run ${col('cyan', 'asyncat install --local-engine')} or configure Ollama/LM Studio/cloud`);
  }

  if (fs.existsSync(managedEngineDir())) pass(`Managed engine dir exists: ${managedEngineDir()}`);
  else warnIt(`Managed engine dir not found: ${managedEngineDir()}`);

  // 12. Models dir
  const modelsDir = env.MODELS_PATH ? path.resolve(path.dirname(denEnvPath), env.MODELS_PATH) : path.join(ROOT, 'den/data/models');
  if (fs.existsSync(modelsDir)) pass(`Local models dir exists: ${modelsDir}`);
  else warnIt(`Local models dir not found yet: ${modelsDir}`);

  // 13. GPU advisory
  const gpu = detectGpu();
  const advice = gpuAdvice(gpu);
  if (gpu) warnIt(advice);
  else pass('No GPU acceleration detected; CPU-safe defaults are active');

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
