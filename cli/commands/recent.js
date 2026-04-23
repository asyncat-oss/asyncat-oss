import fs from 'fs';
import path from 'path';
import os from 'os';
import { log, info, col } from '../lib/colors.js';

const HISTORY_FILE = path.join(os.homedir(), '.asyncat_history');

export function run(args) {
  const count = parseInt(args[0]) || 10;

  try {
    const history = fs.readFileSync(HISTORY_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(0, count);

    if (history.length === 0) { info('No recent commands'); return; }

    log('');
    log(`${col('bold', `Recent Commands (last ${count})`)}:`);
    log(col('dim', '─'.repeat(60)));
    log('');

    history.forEach((cmd, i) => {
      const cmds = cmd.split(/\s+/);
      const mainCmd = cmds[0].replace(/^\//, '');
      log(`  ${col('cyan', mainCmd.padEnd(12))} ${col('dim', cmd)}`);
    });

    log('');
  } catch (e) {
    info('No history file yet');
  }
}
