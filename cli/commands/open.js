import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { ok, warn, col } from '../lib/colors.js';
import { ROOT } from '../lib/env.js';

export function getFrontendPort() {
  if (process.env.ASYNCAT_FRONTEND_PORT) return String(process.env.ASYNCAT_FRONTEND_PORT);

  try {
    const config = fs.readFileSync(path.join(ROOT, 'neko/vite.config.js'), 'utf8');
    const match = config.match(/server\s*:\s*{[\s\S]*?port\s*:\s*(\d+)/m)
      || config.match(/preview\s*:\s*{[\s\S]*?port\s*:\s*(\d+)/m);
    if (match) return match[1];
  } catch {}

  return '8717';
}

export function getFrontendUrl() {
  return `http://localhost:${getFrontendPort()}`;
}

export function openFrontend({ quiet = false } = {}) {
  const frontendUrl = getFrontendUrl();
  const platform = os.platform();
  try {
    if (platform === 'darwin') {
      execSync(`open "${frontendUrl}"`, { stdio: 'ignore' });
    } else if (platform === 'win32') {
      execSync(`start "" "${frontendUrl}"`, { shell: true, stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${frontendUrl}"`, { stdio: 'ignore' });
    }
    if (!quiet) ok(`Opened ${col('white', frontendUrl)} in your browser`);
    return true;
  } catch (_) {
    if (!quiet) warn(`Could not open browser automatically — visit ${col('cyan', frontendUrl)} manually`);
    return false;
  }
}

export function run() {
  openFrontend();
}
