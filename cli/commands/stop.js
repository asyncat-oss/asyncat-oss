import { stopAll } from '../lib/procs.js';
import { info } from '../lib/colors.js';

export function run() {
  const stopped = stopAll();
  if (!stopped) info('Nothing running.');
}
