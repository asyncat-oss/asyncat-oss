import { execSync } from 'child_process';
import { ok, err, warn, info, col } from '../lib/colors.js';

export function run(args) {
  const count = parseInt(args[0]) || 1;
  const cmd = args.slice(Math.max(0, args[0] === count.toString() ? 1 : 0)).join(' ');

  if (!cmd) { warn('Usage: bench [count] <command>'); return; }
  if (count < 1) { warn('Count must be >= 1'); return; }

  const times = [];
  info(`Running "${col('cyan', cmd)}" ${count} time${count > 1 ? 's' : ''}...`);

  for (let i = 0; i < count; i++) {
    try {
      const start = Date.now();
      execSync(cmd, { stdio: 'ignore' });
      const elapsed = Date.now() - start;
      times.push(elapsed);
      if (count > 1) info(`  Run ${i + 1}/${count}: ${col('green', elapsed + 'ms')}`);
    } catch (e) {
      err(`Run ${i + 1} failed: ${e.message}`);
      return;
    }
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  if (count === 1) {
    ok(`Completed in ${col('green', times[0] + 'ms')}`);
  } else {
    info(`Average: ${col('cyan', avg.toFixed(1) + 'ms')} | Min: ${col('green', min + 'ms')} | Max: ${col('yellow', max + 'ms')}`);
  }
}
