'use strict';

const readline = require('readline');
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { ROOT } = require('../lib/env');
const { log, ok, err, warn, info, col } = require('../lib/colors');

const DB_PATH      = path.join(ROOT, 'data/asyncat.db');
const BACKUPS_DIR  = path.join(ROOT, 'data/backups');

function prompt(question) {
  return new Promise(resolve => {
    const tmp = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(question);
    tmp.once('line', ans => { tmp.close(); resolve(ans.trim()); });
  });
}

function padZ(n) { return String(n).padStart(2, '0'); }

function timestampedName() {
  const d = new Date();
  const ts = [
    d.getFullYear(),
    padZ(d.getMonth() + 1),
    padZ(d.getDate()),
    padZ(d.getHours()),
    padZ(d.getMinutes()),
  ].join('-');
  return `asyncat-${ts}.db`;
}

function backup() {
  if (!fs.existsSync(DB_PATH)) {
    err(`Database not found at ${col('dim', 'data/asyncat.db')}`);
    return;
  }
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const dest = path.join(BACKUPS_DIR, timestampedName());
  try {
    fs.copyFileSync(DB_PATH, dest);
    ok(`Backed up to ${col('dim', path.relative(ROOT, dest))}`);
  } catch (e) {
    err(`Backup failed: ${e.message}`);
  }
}

async function reset() {
  log('');
  warn(col('bold', 'WARNING: This will permanently delete the database!'));
  warn(`File: ${col('white', 'data/asyncat.db')}`);
  log('');
  const ans = await prompt(`  ${col('red', 'Type "yes" to confirm reset')}: `);
  if (ans !== 'yes') { info('Reset cancelled.'); return; }

  try {
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
      // also remove wal/shm files
      for (const ext of ['-shm', '-wal']) {
        const f = DB_PATH + ext;
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    }
    ok('Database deleted.');
    info('It will be recreated automatically on next start.');
  } catch (e) {
    err(`Reset failed: ${e.message}`);
  }
}

function seed() {
  const seedScript = path.join(ROOT, 'den/src/db/seed.js');
  if (!fs.existsSync(seedScript)) {
    err(`Seed script not found: ${col('dim', 'den/src/db/seed.js')}`);
    return;
  }
  info('Running seed script...');
  try {
    execSync(`node "${seedScript}"`, { cwd: ROOT, stdio: 'inherit' });
    ok('Database seeded.');
  } catch (_) {
    err('Seed script failed — check output above.');
  }
}

async function run(args) {
  const sub = (args && args[0]) || '';

  if (sub === 'backup') {
    backup();
  } else if (sub === 'reset') {
    await reset();
  } else if (sub === 'seed') {
    seed();
  } else {
    if (sub) warn(`Unknown db subcommand: ${col('white', sub)}`);
    log(`  Usage: ${col('cyan', 'db')} ${col('dim', '<backup|reset|seed>')}`);
  }
}

module.exports = { run };
