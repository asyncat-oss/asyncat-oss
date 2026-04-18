import { execSync } from 'child_process';
import os from 'os';
import { readEnv } from '../lib/env.js';
import { ok, warn, col } from '../lib/colors.js';

export function run() {
  const env  = readEnv('den/.env');
  const port = env.PORT || '8716';
  const url  = `http://localhost:${port}`;

  const platform = os.platform();
  try {
    if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else if (platform === 'win32') {
      execSync(`start "" "${url}"`, { shell: true, stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
    ok(`Opened ${col('white', url)} in your browser`);
  } catch (_) {
    warn(`Could not open browser automatically — visit ${col('cyan', url)} manually`);
  }
}
