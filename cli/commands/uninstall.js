import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { info, ok, warn, col, log } from '../lib/colors.js';
import { ROOT } from '../lib/env.js';
import { stopAll } from '../lib/procs.js';

export function run() {
  info('Stopping services...');
  stopAll();

  const BIN_DIR = path.join(os.homedir(), '.local/bin');
  const INSTALL_DIR = process.env.ASYNCAT_INSTALL_DIR || path.join(os.homedir(), '.asyncat');

  log('');
  info('Uninstalling asyncat...');

  // Stop services
  try {
    execSync('pkill -f "asyncat start" 2>/dev/null || true', { stdio: 'ignore' });
  } catch (_) {}

  // Remove CLI command
  try {
    const asyncatCmd = path.join(BIN_DIR, 'asyncat');
    if (fs.existsSync(asyncatCmd)) {
      fs.unlinkSync(asyncatCmd);
      ok('Removed asyncat command');
    }
  } catch (_) {}

  // Remove launcher
  try {
    const launcher = path.join(BIN_DIR, 'asyncat-ui');
    if (fs.existsSync(launcher)) {
      fs.unlinkSync(launcher);
      ok('Removed app launcher');
    }
  } catch (_) {}

  // macOS: Remove .app bundle
  if (os.platform() === 'darwin') {
    try {
      const appDir = path.join(os.homedir(), 'Applications/Asyncat.app');
      if (fs.existsSync(appDir)) {
        execSync(`rm -rf "${appDir}"`, { stdio: 'ignore' });
        ok('Removed ~/Applications/Asyncat.app');
      }
    } catch (_) {}
  }

  // Linux: Remove .desktop file and icons
  if (os.platform() === 'linux') {
    try {
      const desktopFile = path.join(os.homedir(), '.local/share/applications/asyncat.desktop');
      if (fs.existsSync(desktopFile)) {
        fs.unlinkSync(desktopFile);
        ok('Removed desktop entry');
      }
      execSync('update-desktop-database ~/.local/share/applications 2>/dev/null || true', { stdio: 'ignore' });
    } catch (_) {}

    try {
      const iconDir = path.join(os.homedir(), '.local/share/icons/hicolor/192x192/apps');
      const iconFile = path.join(iconDir, 'asyncat.png');
      if (fs.existsSync(iconFile)) {
        fs.unlinkSync(iconFile);
        ok('Removed icon');
      }
    } catch (_) {}
  }

  // Windows: Remove shortcuts (they're just .lnk files, manual cleanup needed)
  if (os.platform() === 'win32') {
    warn('Windows shortcuts on Desktop and Start Menu should be removed manually');
    warn('Or use the uninstall.ps1 script for automatic cleanup');
  }

  // Optional: Offer to remove installation directory
  log('');
  log(`  Installation directory: ${col('cyan', INSTALL_DIR)}`);
  log(`  To completely remove it, run:`);
  log(`    ${col('cyan', `rm -rf "${INSTALL_DIR}"`)}`);

  log('');
  log(col('cyan', '    /\\_____/\\'));
  log(col('cyan', '   /  o   o  \\'));
  log(col('cyan', '  ( ==  ^  == )'));
  log(col('cyan', '   )  bye!  ('));
  log(col('cyan', '  (           )'));
  log(col('cyan', ' ( (  )   (  ) )'));
  log(col('cyan', '(__(__)___(__)__)'));
  log('');
  log('  asyncat has left the building. 🎬');
  log('  run the rm command above if you want to clean up the installation dir.');
  log('');

  process.exit(0);
}
