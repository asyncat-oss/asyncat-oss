// den/src/agent/sandboxFolders.js
// Where the command sandbox (commandSandbox.js) lets commands write, kept
// apart so that code starting programs outside the sandbox (a browser, an
// app) can check them without loading the sandbox itself, and the settings
// database with it.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { isPathInside, realPathOf } from './tools/shared.js';

// Folders under the home folder that build tools download to. Folders of
// programs (~/.cargo/bin, Rust toolchains, the .NET SDK, Gradle's own
// downloads, pnpm's and Deno's commands) and of settings that run code
// (~/.gradle/init.d) are left out: a command could leave a program there that
// later runs outside the sandbox.
const HOME_CACHE_DIRS = [
  '.cache', '.npm', '.yarn/berry', '.pnpm-store', '.local/share/pnpm/store', '.bun/install/cache',
  '.cargo/registry', '.cargo/git', '.rustup/downloads', '.rustup/tmp',
  '.gradle/caches', '.gradle/daemon', '.gradle/native', '.gradle/.tmp',
  '.m2/repository', '.nuget/packages', '.local/share/NuGet', '.local/state',
  'go/pkg/mod', 'go/pkg/sumdb', '.config/configstore', 'Library/Caches',
];
// Inside those, still read-only: the pnpm and Yarn that corepack starts, and
// the environments pre-commit runs from git hooks. Each is made before a
// command starts, so a command can't make it either (commandSandbox.js).
const HOME_READ_ONLY = ['.cache/node/corepack', '.cache/pre-commit'];

/** Folders a sandboxed command may write to. */
export function writableRoots({ workspaceRoot, home = os.homedir(), tmp = os.tmpdir() }) {
  const roots = new Set([workspaceRoot, '/tmp', '/var/tmp', tmp].filter(Boolean).map((p) => path.resolve(p)));
  for (const dir of HOME_CACHE_DIRS) roots.add(path.join(home, dir));
  return [...roots];
}

/** The folders inside those that stay read-only. */
export function homeReadOnly(home = os.homedir()) {
  return HOME_READ_ONLY.map((rel) => path.join(home, rel));
}

function isRealDir(target) {
  try { return fs.lstatSync(target).isDirectory(); } catch { return false; }
}

/**
 * True when a sandboxed command could have put `file` where it is, or
 * changed it: it is in a folder commands may write to (temporary folders and
 * caches; projects aside) and not in one kept read-only. For programs den
 * starts on its own, outside the sandbox, such as puppeteer's browser in
 * ~/.cache/puppeteer.
 */
export function sandboxCanChange(file, { home = os.homedir(), tmp = os.tmpdir() } = {}) {
  let real;
  try { real = realPathOf(file); } catch { return true; }
  const roots = writableRoots({ workspaceRoot: null, home, tmp });
  const rootOf = (target) => roots.find((root) => isPathInside(target, root) || isPathInside(target, realPathOf(root)));
  if (!rootOf(real)) return false;
  return !homeReadOnly(home).some((cover) => {
    const root = rootOf(cover);
    if (!root || !isRealDir(cover)) return false;
    // Read-only only when no link below the writable folder leads there: a
    // command could replace the link.
    const realCover = realPathOf(cover);
    return realCover === path.join(realPathOf(root), path.relative(root, cover)) && isPathInside(real, realCover);
  });
}
