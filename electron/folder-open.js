// electron/folder-open.js — What the page's "shell:open" may open: a folder,
// shown in the file manager. Never a file, since opening one with its default
// app can run it (a script, a program, a .desktop file); files are only shown
// with "Show in folder". On macOS an app or installer is a folder too, and
// opening it runs it, so those are refused as well.
//
// No Electron imports, so it can be unit-tested with plain node.

import fs from 'node:fs';
import path from 'node:path';

// Folders macOS runs or installs when opened.
const MAC_PACKAGES = /\.(app|pkg|mpkg|prefpane|saver|workflow|action|appex|xpc|qlgenerator|mdimporter)$/i;

/**
 * Opens `target` when it is an existing folder, through `openPath` (Electron's
 * shell.openPath). Resolves to '' when it opened, else to why it didn't, like
 * shell.openPath does.
 */
export async function openFolderOnly(target, { openPath, platform = process.platform, fsApi = fs } = {}) {
  if (typeof target !== 'string' || target.includes('\0') || !path.isAbsolute(target)) {
    return 'Only folders can be opened.';
  }
  const folder = path.resolve(target);
  let real;
  try {
    // Where links lead, so a link named like a folder can't open an app.
    real = fsApi.realpathSync(folder);
    if (!fsApi.statSync(real).isDirectory()) return 'Only folders can be opened.';
  } catch {
    return 'That folder was not found.';
  }
  if (platform === 'darwin' && MAC_PACKAGES.test(real)) return 'Only folders can be opened.';
  return openPath(real);
}
