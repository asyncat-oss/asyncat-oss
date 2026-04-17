'use strict';

const readline = require('readline');
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { ROOT } = require('../lib/env');
const { log, ok, err, warn, info, col } = require('../lib/colors');

function checkCmd(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function setupEnv(target, example) {
  const t = path.join(ROOT, target);
  const e = path.join(ROOT, example);
  if (!fs.existsSync(t)) {
    if (!fs.existsSync(e)) { warn(`Example file ${example} not found, skipping.`); return; }
    fs.copyFileSync(e, t);
    ok(`Created ${target}`);
    warn(`Edit ${col('white', target)} and set JWT_SECRET + AI credentials.`);
  } else {
    ok(`${target} exists`);
  }
}

function runSync(cmd, cwd, label) {
  info(`Installing ${label}...`);
  try {
    execSync(cmd, { cwd, stdio: 'ignore' });
    ok(`${label} packages installed`);
  } catch (_) {
    err(`Failed to install ${label} packages. Try manually: ${col('dim', 'cd ' + path.relative(ROOT, cwd) + ' && npm install')}`);
  }
}

function prompt(question) {
  return new Promise(resolve => {
    const tmp = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(question);
    tmp.once('line', ans => { tmp.close(); resolve(ans.trim()); });
  });
}

async function checkLlama(python) {
  const paths = [
    path.join(os.homedir(), '.unsloth/llama.cpp/build/bin/llama-server'),
    path.join(os.homedir(), '.unsloth/llama.cpp/llama-server'),
    path.join(os.homedir(), '.local/bin/llama-server'),
    path.join(os.homedir(), 'bin/llama-server'),
    '/usr/local/bin/llama-server',
    '/usr/bin/llama-server',
    '/opt/homebrew/bin/llama-server',
  ];

  const found = checkCmd('llama-server') ||
    paths.some(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
  const pythonLlama = python && (() => {
    try { execSync(`${python} -c "import llama_cpp"`, { stdio: 'ignore' }); return true; } catch { return false; }
  })();

  if (found)       { ok('llama-server found'); return; }
  if (pythonLlama) { ok('llama-cpp-python detected'); return; }

  warn('llama-server not found — local AI models will not work without it.');
  log('');
  log(`  ${col('bold', 'Install options:')}`);
  log(`  ${col('cyan', '[1]')} pip install llama-cpp-python[server]  ${col('dim', '(easiest)')}`);
  log(`  ${col('cyan', '[2]')} Download pre-built binary              ${col('dim', 'github.com/ggml-org/llama.cpp/releases')}`);
  log(`  ${col('cyan', '[3]')} Skip — cloud AI providers still work`);
  log('');

  const choice = await prompt('  Choose [1/2/3]: ');
  if (choice === '1') {
    if (!python) { err('Python not found. Install Python 3.10+ first.'); return; }
    info('Installing llama-cpp-python...');
    try {
      execSync(`${python} -m pip install "llama-cpp-python[server]"`, { stdio: 'inherit' });
      ok('llama-cpp-python installed');
    } catch (_) { err('Installation failed — check pip output above.'); }
  } else if (choice === '2') {
    info(`Download llama-server for ${os.platform()}-${os.arch()} from:`);
    info(col('cyan', 'https://github.com/ggml-org/llama.cpp/releases'));
    info(`Place it at ${col('white', '~/.local/bin/llama-server')} and run ${col('dim', 'chmod +x')} on it.`);
  } else {
    info('Skipped — cloud AI (OpenAI, Anthropic, etc.) will still work.');
  }
}

async function run() {
  log('');
  log(col('bold', '  Checking dependencies...'));
  log('');

  // Node.js
  if (!checkCmd('node')) { err('Node.js not found — install from https://nodejs.org'); return; }
  const nodeVer = execSync('node --version').toString().trim();
  const nodeMajor = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
  if (nodeMajor < 20) {
    err(`Node.js ${nodeVer} found — version 20+ required. Install from https://nodejs.org`);
    return;
  }
  ok(`Node.js ${nodeVer}`);

  // npm
  if (!checkCmd('npm')) { err('npm not found.'); return; }
  ok(`npm ${execSync('npm --version').toString().trim()}`);

  // Python (optional)
  const python = ['python3', 'python'].find(checkCmd);
  if (python) ok(`Python ${execSync(`${python} --version`).toString().trim().split(' ')[1]}`);
  else warn('Python not found — local AI models need a pre-built llama-server binary.');

  // .env files
  log('');
  log(col('bold', '  Environment files...'));
  log('');
  setupEnv('den/.env', 'den/.env.example');
  setupEnv('neko/.env', 'neko/.env.example');

  // npm install
  log('');
  log(col('bold', '  Installing packages...'));
  log('');
  runSync('npm install', ROOT,                     'root');
  runSync('npm install', path.join(ROOT, 'den'),   'backend');
  runSync('npm install', path.join(ROOT, 'neko'),  'frontend');

  // llama-server
  log('');
  log(col('bold', '  Checking llama.cpp (local AI)...'));
  log('');
  await checkLlama(python);

  log('');
  ok(col('bold', 'Setup complete!') + `  Type ${col('cyan', 'start')} to launch asyncat.`);
  log('');
}

module.exports = { run };
