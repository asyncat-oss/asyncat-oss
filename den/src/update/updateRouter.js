import express from 'express';
import { execFileSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { auth } from '../users/middleware/auth.js';

const router = express.Router();
router.use(auth);

// den/src/update/updateRouter.js → root is 3 levels up
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const UNINSTALL_SCRIPT = join(ROOT, 'uninstall.sh');

function getLocalInfo() {
  const currentHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT }).toString().trim();
  const upstream = (() => {
    try {
      return execFileSync('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd: ROOT }).toString().trim();
    } catch {
      return null;
    }
  })();
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim().length > 0;
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return {
    currentHash,
    branch,
    upstream,
    dirty,
    version: pkg.version,
    installDir: ROOT,
    canUninstall: existsSync(UNINSTALL_SCRIPT),
  };
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
    const upstream = execFileSync('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd: ROOT }).toString().trim();
    const remote = upstream.split('/')[0];
    execFileSync('git', ['fetch', '--quiet', remote], { cwd: ROOT, timeout: 30000 });
    const behind = parseInt(
      execFileSync('git', ['rev-list', `HEAD..${upstream}`, '--count'], { cwd: ROOT }).toString().trim()
    ) || 0;
    const latestHash = execFileSync('git', ['rev-parse', '--short', upstream], { cwd: ROOT }).toString().trim();
    res.json({ success: true, behind, latestHash, upstream });
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

  const runStep = (cmd, args, cwd = ROOT, options = {}) => new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: 'pipe' });
    let out = '';
    proc.stdout.on('data', d => { out += d; send('log', d.toString()); });
    proc.stderr.on('data', d => { out += d; send('log', d.toString()); });
    proc.on('close', code => {
      if (code === 0 || options.allowCodes?.includes(code)) return resolve(out);
      reject(new Error(`"${cmd} ${args.join(' ')}" exited with code ${code}`));
    });
    proc.on('error', reject);
  });

  let hasStash = false;

  (async () => {
    try {
      const status = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim();
      if (status) {
        send('log', 'Stashing local changes...\n');
        await runStep('git', ['stash', 'push', '-u', '-m', 'asyncat-ui-update']);
        hasStash = true;
      }

      send('log', 'Pulling latest changes from remote...\n');
      const pullOut = await runStep('git', ['pull', '--ff-only']);

      if (pullOut.includes('Already up to date') || pullOut.includes('Already up-to-date')) {
        if (hasStash) {
          send('log', 'Restoring local changes...\n');
          await runStep('git', ['stash', 'pop']);
        }
        send('done', 'Already up to date.');
        res.end();
        return;
      }

      send('log', '\nInstalling workspace dependencies...\n');
      await runStep('npm', ['install'], ROOT);

      send('log', '\nRebuilding Web UI...\n');
      await runStep('npm', ['run', 'build', '-w', 'neko'], ROOT);

      if (hasStash) {
        send('log', '\nRestoring local changes...\n');
        await runStep('git', ['stash', 'pop']);
      }

      send('done', 'Update complete. Restart Asyncat to load the new backend code.');
    } catch (e) {
      if (hasStash) {
        try { execFileSync('git', ['stash', 'pop'], { cwd: ROOT, stdio: 'ignore' }); }
        catch (_) { send('log', '\nLocal changes are still stashed. Run git stash pop from the install directory to restore them.\n'); }
      }
      send('error', e.message);
    }
    res.end();
  })();
});

// POST /api/update/restart — graceful self-restart.
// Touches den/.restart so nodemon (dev mode) detects a file change and restarts.
// Also sends SIGTERM directly as a fallback for pm2/launchd/asyncat-CLI deployments.
// The frontend polls /health to detect when the server is back up.
const RESTART_SENTINEL = join(ROOT, 'den', '.restart');
router.post('/restart', (req, res) => {
  res.json({ success: true, message: 'Server is restarting...' });
  setTimeout(() => {
    // Touch the sentinel file so nodemon sees a watched-file change and restarts.
    try { writeFileSync(RESTART_SENTINEL, Date.now().toString()); } catch { /* ignore */ }
    // Send SIGTERM directly as well — handles pm2/launchd/CLI deployments that don't use nodemon.
    process.kill(process.pid, 'SIGTERM');
  }, 150);
});

// POST /api/update/uninstall — schedule local uninstall after responding.
router.post('/uninstall', (req, res) => {
  const purge = Boolean(req.body?.purge);
  const confirm = String(req.body?.confirm || '').trim().toLowerCase();
  const required = purge ? 'delete all asyncat data' : 'uninstall asyncat';

  if (confirm !== required) {
    return res.status(400).json({
      success: false,
      error: `Type "${required}" to confirm.`,
    });
  }

  if (!existsSync(UNINSTALL_SCRIPT)) {
    return res.status(404).json({ success: false, error: 'uninstall.sh not found in this installation.' });
  }

  const args = [UNINSTALL_SCRIPT, ...(purge ? ['--purge'] : [])];
  try {
    const child = spawn('sh', args, {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ASYNCAT_INSTALL_DIR: ROOT },
    });
    child.unref();
    res.json({
      success: true,
      message: purge
        ? 'Full uninstall started. Asyncat will shut down and remove local data.'
        : 'Uninstall started. Asyncat will shut down and keep local data.',
      installDir: ROOT,
      purge,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
