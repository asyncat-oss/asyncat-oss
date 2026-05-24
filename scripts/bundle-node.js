#!/usr/bin/env node
// scripts/bundle-node.js
// Prepares a self-contained Node.js binary for the Electron packaged build.
//
// Strategy:
//  1. If the system node binary is already standalone (official installer, nvm, fnm, volta)
//     → copy it directly. Fast, always ABI-correct.
//  2. If the system node is dynamically linked (Homebrew on macOS links to
//     @rpath/libnode.X.dylib and many /opt/homebrew/ dylibs that won't exist
//     on end-user machines) → download the matching official standalone binary
//     from nodejs.org. Cached in .node-bundle-cache/ to avoid repeat downloads.
//
// The bundled binary is always the same Node.js major version that compiled
// better-sqlite3 during npm install, so the ABI (NODE_MODULE_VERSION) is
// guaranteed to match at runtime.

import { copyFileSync, mkdirSync, chmodSync, existsSync, rmSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const destDir = join(ROOT, 'resources', 'node-bin');
const cacheDir = join(ROOT, '.node-bundle-cache');

const platform = process.platform;
const arch = process.arch;
const version = process.version; // e.g. 'v26.0.0'
const exeName = platform === 'win32' ? 'node.exe' : 'node';
const dest = join(destDir, exeName);

mkdirSync(destDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

// ─── Check if the system node binary is self-contained ───────────────────────

function isStandalone(nodePath) {
  if (platform === 'linux') return true; // Linux builds are typically static/standalone
  if (platform === 'win32') return true; // Windows builds are standalone

  // macOS: check for @rpath/libnode links (Homebrew pattern) or /opt/homebrew deps
  try {
    const out = execSync(`otool -L "${nodePath}" 2>/dev/null`, { encoding: 'utf8' });
    const lines = out.split('\n').slice(1).map(l => l.trim()).filter(Boolean);
    const hasRpathLibnode = lines.some(l => l.startsWith('@rpath/libnode'));
    const hasHomebrew    = lines.some(l => l.includes('/opt/homebrew/'));
    return !hasRpathLibnode && !hasHomebrew;
  } catch {
    return false;
  }
}

// ─── Download official Node.js binary ────────────────────────────────────────

function downloadOfficial() {
  const platMap = { darwin: 'darwin', linux: 'linux', win32: 'win' };
  const plat = platMap[platform] ?? platform;
  const ver  = version.replace(/^v/, '');
  const name = platform === 'win32'
    ? `node-${version}-${plat}-${arch}.zip`
    : `node-${version}-${plat}-${arch}.tar.gz`;
  const url  = `https://nodejs.org/dist/${version}/${name}`;

  const cachedBin = join(cacheDir, `${version}-${plat}-${arch}${platform === 'win32' ? '.exe' : ''}`);
  if (existsSync(cachedBin)) {
    console.log(`[bundle-node] Using cached binary: ${cachedBin}`);
    copyFileSync(cachedBin, dest);
    if (platform !== 'win32') chmodSync(dest, 0o755);
    return;
  }

  const archive = join(cacheDir, name);
  console.log(`[bundle-node] Downloading: ${url}`);

  if (platform === 'win32') {
    execSync(
      `powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile '${archive}'"`,
      { stdio: 'inherit' },
    );
    const extractDir = join(cacheDir, `node-extract-${ver}`);
    mkdirSync(extractDir, { recursive: true });
    execSync(
      `powershell -Command "Expand-Archive -Path '${archive}' -DestinationPath '${extractDir}' -Force"`,
      { stdio: 'inherit' },
    );
    const src = join(extractDir, `node-${version}-win-${arch}`, 'node.exe');
    copyFileSync(src, cachedBin);
    copyFileSync(cachedBin, dest);
    rmSync(extractDir, { recursive: true, force: true });
    rmSync(archive, { force: true });
  } else {
    // macOS / Linux: use curl + tar
    execSync(`curl -fsSL "${url}" -o "${archive}"`, { stdio: 'inherit' });
    // Extract just the node binary: strip the top-level dir and bin/ dir
    execSync(
      `tar -xzf "${archive}" -C "${cacheDir}" --strip-components=2 "node-${version}-${plat}-${arch}/bin/node"`,
      { stdio: 'inherit' },
    );
    // tar --strip-components=2 puts it in cacheDir/node
    const extracted = join(cacheDir, 'node');
    renameSync(extracted, cachedBin);
    chmodSync(cachedBin, 0o755);
    copyFileSync(cachedBin, dest);
    chmodSync(dest, 0o755);
    rmSync(archive, { force: true });
  }

  console.log(`[bundle-node] Downloaded and cached: ${cachedBin}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (isStandalone(process.execPath)) {
  console.log(`[bundle-node] System Node ${version} (${platform}/${arch}) is standalone — copying directly`);
  copyFileSync(process.execPath, dest);
  if (platform !== 'win32') chmodSync(dest, 0o755);
} else {
  console.log(`[bundle-node] System Node ${version} (${platform}/${arch}) is dynamically linked — downloading official binary`);
  downloadOfficial();
}

// Quick sanity check
try {
  const ver = execSync(`"${dest}" --version`, { encoding: 'utf8', timeout: 5000 }).trim();
  console.log(`[bundle-node] ✓ ${dest} → ${ver}`);
} catch (e) {
  console.error(`[bundle-node] ✗ bundled binary failed to run: ${e.message}`);
  process.exit(1);
}
