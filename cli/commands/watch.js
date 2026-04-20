import { execSync } from 'child_process';
import { info, ok, warn, log, col } from '../lib/colors.js';

const watchers = new Map();

export function run(args) {
  const sub = args[0];

  if (!sub || sub === 'list') {
    if (watchers.size === 0) { info('No active watchers'); return; }
    log('');
    for (const [id, w] of watchers) {
      log(`  ${col('cyan', id)}  every ${w.interval}s  "${col('dim', w.cmd)}"`);
    }
    log('');
    return;
  }

  if (sub === 'stop') {
    const id = args[1];
    const watcher = watchers.get(id);
    if (!watcher) { warn(`No watcher with ID ${col('white', id)}`); return; }
    clearInterval(watcher.interval);
    watchers.delete(id);
    ok(`Stopped watcher ${col('cyan', id)}`);
    return;
  }

  const interval = parseInt(sub) || 2;
  if (interval < 1) { warn('Interval must be >= 1 second'); return; }

  const cmd = args.slice(1).join(' ');
  if (!cmd) { warn('Usage: watch <interval> <command>'); return; }

  const id = Math.random().toString(36).slice(2, 8);
  ok(`Watching "${col('cyan', cmd)}" every ${interval}s (ID: ${col('cyan', id)})`);
  info(`(use /watch stop ${id} to stop)`);

  let count = 0;
  const interval_id = setInterval(() => {
    count++;
    try {
      execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
      warn(`Command failed (run #${count}): ${e.message}`);
    }
  }, interval * 1000);

  watchers.set(id, { interval: interval_id, cmd, count: 0 });
}
