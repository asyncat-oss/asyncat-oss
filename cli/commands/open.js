import { execSync } from 'child_process';
import os from 'os';
import { ok, warn, col } from '../lib/colors.js';

// Always open the frontend web UI (port 8717), not the backend API (8716)
const FRONTEND_URL = 'http://localhost:8717';

export function run() {
  const platform = os.platform();
  try {
    if (platform === 'darwin') {
      execSync(`open "${FRONTEND_URL}"`, { stdio: 'ignore' });
    } else if (platform === 'win32') {
      execSync(`start "" "${FRONTEND_URL}"`, { shell: true, stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${FRONTEND_URL}"`, { stdio: 'ignore' });
    }
    ok(`Opened ${col('white', FRONTEND_URL)} in your browser`);
  } catch (_) {
    warn(`Could not open browser automatically — visit ${col('cyan', FRONTEND_URL)} manually`);
  }
}
