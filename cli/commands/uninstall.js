import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { info, ok, warn, col, log } from '../lib/colors.js';
import { ROOT } from '../lib/env.js';
import { stopAll } from '../lib/procs.js';

export function run(args = []) {
  const purge = args.includes('--purge') || args.includes('--all');
  info('Stopping services...');
  stopAll();

  const BIN_DIR = path.join(os.homedir(), '.local/bin');
  const INSTALL_DIR = process.env.ASYNCAT_INSTALL_DIR || path.join(os.homedir(), '.asyncat');

  log('');
  info('Uninstalling asyncat...');

  // Stop the installed app services without matching unrelated asyncat commands.
  try {
    if (os.platform() === 'win32') {
      execSync('for /f "tokens=5" %a in (\'netstat -ano ^| findstr ":8716 :8717 :8765 :8766"\') do taskkill /F /PID %a', { stdio: 'ignore', shell: true });
    } else {
      execSync('for p in 8716 8717 8765 8766; do lsof -ti :$p 2>/dev/null | xargs kill 2>/dev/null || true; done', { stdio: 'ignore', shell: '/bin/bash' });
    }
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
        fs.rmSync(appDir, { recursive: true, force: true });
        ok('Removed ~/Applications/Asyncat.app');
      }
    } catch (_) {}
    try {
      const iconCache = path.join(os.homedir(), 'Library/Caches/asyncat-icons');
      if (fs.existsSync(iconCache)) {
        fs.rmSync(iconCache, { recursive: true, force: true });
        ok('Removed icon cache');
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
      const hicolorBase = path.join(os.homedir(), '.local/share/icons/hicolor');
      for (const size of ['72x72', '96x96', '128x128', '144x144', '152x152', '192x192', '384x384', '512x512']) {
        const iconFile = path.join(hicolorBase, size, 'apps/asyncat.png');
        if (fs.existsSync(iconFile)) fs.unlinkSync(iconFile);
      }
      for (const iconFile of [
        path.join(os.homedir(), '.local/share/icons/asyncat.png'),
        path.join(os.homedir(), '.local/share/icons/asyncat.svg'),
      ]) {
        if (fs.existsSync(iconFile)) fs.unlinkSync(iconFile);
      }
      ok('Removed icons');
      execSync('gtk-update-icon-cache ~/.local/share/icons/hicolor 2>/dev/null || true', { stdio: 'ignore' });
    } catch (_) {}
  }

  try {
    execSync('npm uninstall -g @asyncat/asyncat', { stdio: 'ignore' });
  } catch (_) {}

  // Windows: Remove shortcuts (they're just .lnk files, manual cleanup needed)
  if (os.platform() === 'win32') {
    warn('Windows shortcuts on Desktop and Start Menu should be removed manually');
    warn('Or use the uninstall.ps1 script for automatic cleanup');
  }

  if (purge) {
    try {
      if (fs.existsSync(INSTALL_DIR)) {
        fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
        ok(`Removed installation/data directory: ${INSTALL_DIR}`);
      }
    } catch (e) {
      warn(`Could not remove ${INSTALL_DIR}: ${e.message}`);
    }
  }

  log('');
  if (!purge) {
    log(`  Local data kept: ${col('cyan', INSTALL_DIR)}`);
    log(`  To remove data, database, models, and the managed engine too, run:`);
    log(`    ${col('cyan', 'asyncat uninstall --purge')}`);
  }

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
  if (!purge) log('  your data is still there in case you come back.');
  log('');

  process.exit(0);
}
