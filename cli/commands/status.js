'use strict';

const { execSync } = require('child_process');
const { procs } = require('../lib/procs');
const { log, ok, col } = require('../lib/colors');

function portRunning(port) {
  try {
    const out = execSync(`lsof -ti :${port} 2>/dev/null`).toString().trim();
    return out.length > 0;
  } catch (_) {
    return false;
  }
}

function run() {
  log('');
  const checks = [
    { name: 'Backend  (den)', port: 3000, key: 'backend' },
    { name: 'Frontend (neko)', port: 5173, key: 'frontend' },
    { name: 'llama-server    ', port: 8765, key: null },
  ];

  for (const s of checks) {
    const running = (s.key && procs[s.key] !== null) || portRunning(s.port);
    if (running) {
      ok(`${s.name}  ${col('dim', ':' + s.port)}  ${col('green', 'running')}`);
    } else {
      log(`  ${col('dim', '○')}  ${s.name}  ${col('dim', ':' + s.port + '  stopped')}`);
    }
  }
  log('');
}

module.exports = { run };
