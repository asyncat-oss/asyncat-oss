import express from 'express';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { auth } from '../users/middleware/auth.js';

const router = express.Router();
router.use(auth);

// den/src/update/updateRouter.js → root is 3 levels up
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function getLocalInfo() {
  const currentHash = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT }).toString().trim();
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return { currentHash, branch, version: pkg.version };
}

// GET /api/update/status — fast local git info, no network
router.get('/status', (req, res) => {
  try {
    res.json({ success: true, ...getLocalInfo() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/update/check — git fetch + count commits behind upstream
router.post('/check', async (req, res) => {
  try {
    execSync('git fetch --quiet origin', { cwd: ROOT, timeout: 15000 });
    // Use FETCH_HEAD to compare against whatever the default branch is
    const behind = parseInt(
      execSync('git rev-list HEAD..FETCH_HEAD --count', { cwd: ROOT }).toString().trim()
    ) || 0;
    const latestHash = execSync('git rev-parse --short FETCH_HEAD', { cwd: ROOT }).toString().trim();
    res.json({ success: true, behind, latestHash });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/update/apply — SSE stream of the full update process
router.post('/apply', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, text) => res.write(`data: ${JSON.stringify({ type, text })}\n\n`);

  const runStep = (cmd, args, cwd = ROOT) => new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: 'pipe' });
    let out = '';
    proc.stdout.on('data', d => { out += d; send('log', d.toString()); });
    proc.stderr.on('data', d => { out += d; send('log', d.toString()); });
    proc.on('close', code => code === 0 ? resolve(out) : reject(new Error(`"${cmd} ${args.join(' ')}" exited with code ${code}`)));
    proc.on('error', reject);
  });

  let hasStash = false;

  (async () => {
    try {
      const status = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
      if (status) {
        send('log', 'Stashing local changes...\n');
        await runStep('git', ['stash']);
        hasStash = true;
      }

      send('log', 'Pulling latest changes from remote...\n');
      const pullOut = await runStep('git', ['pull']);

      if (pullOut.includes('Already up to date') || pullOut.includes('Already up-to-date')) {
        if (hasStash) {
          try { await runStep('git', ['stash', 'pop']); } catch (_) {}
        }
        send('done', 'Already up to date.');
        res.end();
        return;
      }

      send('log', '\nInstalling root dependencies...\n');
      await runStep('npm', ['install'], ROOT);

      send('log', '\nInstalling backend dependencies...\n');
      await runStep('npm', ['install'], join(ROOT, 'den'));

      send('log', '\nInstalling frontend dependencies...\n');
      await runStep('npm', ['install'], join(ROOT, 'neko'));

      if (hasStash) {
        send('log', '\nRestoring local changes...\n');
        try { await runStep('git', ['stash', 'pop']); } catch (_) {}
      }

      send('done', 'Update complete! Restart Asyncat to apply changes.');
    } catch (e) {
      if (hasStash) {
        try { execSync('git stash pop', { cwd: ROOT }); } catch (_) {}
      }
      send('error', e.message);
    }
    res.end();
  })();
});

export default router;
