import fs from 'fs';
import path from 'path';
import os from 'os';
import { log, info, col, ok } from '../lib/colors.js';

const HISTORY_FILE = path.join(os.homedir(), '.asyncat_history');

export function run(args) {
  const query = args.join(' ');

  try {
    const history = fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean);

    if (history.length === 0) { info('No history'); return; }

    let results;
    if (!query) {
      results = history.slice(0, 20);
    } else {
      const regex = new RegExp(query, 'i');
      results = history.filter(cmd => regex.test(cmd));
    }

    if (results.length === 0) {
      info(`No matches for "${col('cyan', query)}"`);
      return;
    }

    log('');
    if (query) {
      log(`${col('bold', `Search results for: ${col('cyan', query)}`)} (${results.length} matches)`);
    } else {
      log(`${col('bold', 'Command history (last 20)')}`);
    }
    log(col('dim', '─'.repeat(70)));
    log('');

    results.forEach((cmd, i) => {
      const num = (i + 1).toString().padStart(3);
      const cmds = cmd.split(/\s+/);
      const mainCmd = cmds[0].replace(/^\//, '');
      log(`  ${col('dim', num + '.')} ${col('cyan', mainCmd.padEnd(12))} ${col('dim', cmd)}`);
    });

    log('');
  } catch (e) {
    info('No history file yet');
  }
}
