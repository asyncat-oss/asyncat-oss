import readline from 'readline';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ROOT } from '../lib/env.js';
import { log, ok, err, warn, info, col, banner, spinner } from '../lib/colors.js';

const ASYNCAT_HOME = process.env.ASYNCAT_HOME || path.join(process.env.HOME || process.env.USERPROFILE, '.asyncat');

function prompt(question) {
  return new Promise(resolve => {
    const tmp = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(question);
    tmp.once('line', ans => { tmp.close(); resolve(ans.trim()); });
  });
}

function asyncatHome() {
  const home = path.join(process.env.HOME || process.env.USERPROFILE, '.asyncat');
  if (!fs.existsSync(home)) {
    fs.mkdirSync(home, { recursive: true });
  }
  return home;
}

function isFirstRun() {
  const home = asyncatHome();
  return !fs.existsSync(path.join(home, '.first-run'));
}

function markFirstRunComplete() {
  const home = asyncatHome();
  fs.writeFileSync(path.join(home, '.first-run'), new Date().toISOString());
}

export function generateJWT() {
  return crypto.randomBytes(32).toString('hex');
}

function generatePassword() {
  return crypto.randomBytes(2).toString('hex') + '-' + crypto.randomBytes(2).toString('hex') + '-' + crypto.randomBytes(2).toString('hex');
}

async function setupEnvFiles() {
  const envs = [
    { source: 'den/.env.example', target: 'den/.env' },
    { source: 'neko/.env.example', target: 'neko/.env' },
  ];

  for (const { source, target } of envs) {
    const sourcePath = path.join(ROOT, source);
    const targetPath = path.join(ROOT, target);

    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
      ok(`Created ${target}`);
    }
  }
}

export async function run() {
  const isFirst = isFirstRun();

  if (!isFirst) {
    log('');
    log(col('cyan', 'Asyncat already configured!'));
    log('');
    log('  ' + col('gray', 'To reset and run onboard again, delete ~/.asyncat/.first-run'));
    log('');
    return;
  }

  banner();
  log('');
  log(col('bold', '  Welcome to Asyncat — the neural-inspired AI Agent OS'));
  log('');
  log('  You are the conductor. The cat watches it all burn.');
  log('');

  // Step 1: Check Node.js
  log(col('bold', 'Step 1: Checking requirements...'));
  try {
    const nodeVer = execSync('node --version', { stdio: 'pipe' }).toString().trim();
    ok(`Node.js ${nodeVer}`);
  } catch {
    err('Node.js not found. Install from https://nodejs.org');
    return;
  }

  // Step 2: Setup environment files
  log('');
  log(col('bold', 'Step 2: Setting up environment...'));
  await setupEnvFiles();

  // Step 3: Generate secrets
  log('');
  log(col('bold', 'Step 3: Generating secrets...'));

  const envPath = path.join(ROOT, 'den/.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Generate JWT_SECRET if not set or is default
    if (!envContent.includes('JWT_SECRET=') || envContent.includes('JWT_SECRET=change-this')) {
      const jwtSecret = generateJWT();
      if (envContent.includes('JWT_SECRET=')) {
        envContent = envContent.replace(/JWT_SECRET=.*/m, `JWT_SECRET=${jwtSecret}`);
      } else {
        envContent += `\nJWT_SECRET=${jwtSecret}`;
      }
      ok('Generated JWT_SECRET');
    }

    // Generate local account seed password if default
    if (envContent.includes('LOCAL_PASSWORD=changeme')) {
      const localPass = generatePassword();
      envContent = envContent.replace(/LOCAL_PASSWORD=changeme/, `LOCAL_PASSWORD=${localPass}`);
      ok('Generated LOCAL_PASSWORD');
    }

    fs.writeFileSync(envPath, envContent);
  }

  // Step 4: Check/create data directories
  log('');
  log(col('bold', 'Step 4: Setting up directories...'));
  
  const dataDir = path.join(ROOT, 'den/data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    ok('Created data directory');
  }

  const modelsDir = path.join(dataDir, 'models');
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
    ok('Created models directory');
  }

  const uploadsDir = path.join(dataDir, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    ok('Created uploads directory');
  }

  // Step 5: Mark complete
  markFirstRunComplete();

  // Step 6: Print credentials
  log('');
  log(col('bold', col('green', '  ✓  Setup complete!')));
  log('');
  log('  Default credentials:');
  log('    ' + col('cyan', 'Email:    admin@local'));
  log('    ' + col('cyan', 'Password: changeme'));
  log('');
  warn('Change your password in Settings → Security after logging in!');
  log('');
  log('  Next steps:');
  log('    ' + col('cyan', 'asyncat start') + '  — launch the agent');
  log('    ' + col('cyan', 'asyncat doctor') + ' — check system health');
  log('');

  log(col('dim', '  Run with --force to re-run onboard wizard'));
}

export async function runForce() {
  const home = asyncatHome();
  if (fs.existsSync(path.join(home, '.first-run'))) {
    fs.unlinkSync(path.join(home, '.first-run'));
    log(col('yellow', 'Reset first-run flag. Re-running onboard...'));
  }
  await run();
}
