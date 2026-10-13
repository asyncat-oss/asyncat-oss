// den/src/connectors/launchers.js
// Some connectors start with a command that downloads them first: npx, uvx,
// docker and the like. Those need the user's OK, with the size, before the
// first start. This finds the package such a command fetches, whether it is
// already on this computer, and how big the download is.

import fs from 'fs';
import os from 'os';
import path from 'path';

const NPM_REGISTRY = 'https://registry.npmjs.org';
const PYPI = 'https://pypi.org/pypi';

const NPX_FLAGS_WITH_VALUE = new Set(['-p', '--package', '-c', '--call', '--cache', '--registry', '-w', '--workspace']);
const UVX_FLAGS_WITH_VALUE = new Set(['--from', '--with', '-w', '--python', '-p', '--index', '--index-url', '--extra-index-url', '--default-index', '--cache-dir']);

function commandBase(command) {
  return path.basename(String(command || '')).toLowerCase().replace(/\.(cmd|exe|bat|ps1)$/, '');
}

/** "@scope/name@1.2.3" → { name: "@scope/name", version: "1.2.3" }. */
export function parseNpmSpec(spec) {
  const text = String(spec || '').trim();
  if (!text) return null;
  const at = text.lastIndexOf('@');
  if (at > 0) return { name: text.slice(0, at), version: text.slice(at + 1) || null };
  return { name: text, version: null };
}

function exactVersion(version) {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(version || ''));
}

function firstPositional(args, flagsWithValue) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i]);
    if (arg === '--') return args[i + 1] ?? null;
    if (arg.startsWith('-')) {
      if (!arg.includes('=') && flagsWithValue.has(arg)) i += 1;
      continue;
    }
    return arg;
  }
  return null;
}

function npxPackage(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i]);
    if (arg === '-p' || arg === '--package') return args[i + 1] ?? null;
    if (arg.startsWith('--package=')) return arg.slice('--package='.length);
  }
  return firstPositional(args, NPX_FLAGS_WITH_VALUE);
}

/**
 * What a command downloads before it runs, or null when it runs something
 * already installed. { kind: 'npm' | 'pypi' | 'image', launcher, spec, name,
 * version, argIndex } — argIndex is where the spec sits in args (for pinning).
 */
export function detectLauncher(command, args = []) {
  const base = commandBase(command);
  const list = Array.isArray(args) ? args.map(String) : [];
  let spec = null;
  let kind = null;
  if (base === 'npx' || base === 'bunx') {
    kind = 'npm';
    spec = npxPackage(list);
  } else if ((base === 'pnpm' || base === 'yarn') && list[0] === 'dlx') {
    kind = 'npm';
    spec = firstPositional(list.slice(1), NPX_FLAGS_WITH_VALUE);
  } else if (base === 'npm' && (list[0] === 'exec' || list[0] === 'x')) {
    kind = 'npm';
    spec = npxPackage(list.slice(1));
  } else if (base === 'uvx' || (base === 'uv' && list[0] === 'tool' && list[1] === 'run') || (base === 'pipx' && list[0] === 'run')) {
    kind = 'pypi';
    const rest = base === 'uvx' ? list : list.slice(base === 'uv' ? 2 : 1);
    const from = rest.findIndex((arg) => arg === '--from' || arg === '--spec');
    spec = from >= 0 ? rest[from + 1] : firstPositional(rest, UVX_FLAGS_WITH_VALUE);
  } else if ((base === 'docker' || base === 'podman') && list.includes('run')) {
    kind = 'image';
    const runAt = list.indexOf('run');
    const flagsWithValue = new Set(['-e', '--env', '-v', '--volume', '--name', '-p', '--publish', '--network', '--env-file', '-w', '--workdir', '-u', '--user', '--entrypoint', '--mount', '--platform']);
    spec = firstPositional(list.slice(runAt + 1), flagsWithValue);
  }
  if (!kind || !spec) return null;
  const argIndex = list.lastIndexOf(spec);
  if (kind === 'npm') {
    const parsed = parseNpmSpec(spec);
    return { kind, launcher: base, spec, name: parsed.name, version: parsed.version, argIndex };
  }
  if (kind === 'pypi') {
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?(?:==([^,;\s]+))?/.exec(spec);
    return { kind, launcher: base, spec, name: match?.[1] || spec, version: match?.[2] || null, argIndex };
  }
  return { kind, launcher: base, spec, name: spec, version: null, argIndex };
}

/** The same args with the package pinned to `version` (npm and PyPI). */
export function pinLauncherVersion(command, args, version) {
  const found = detectLauncher(command, args);
  if (!found || !version || found.argIndex < 0) return args;
  const next = [...args];
  if (found.kind === 'npm') next[found.argIndex] = `${found.name}@${version}`;
  else if (found.kind === 'pypi' && found.launcher !== 'pipx') next[found.argIndex] = `${found.name}==${version}`;
  return next;
}

export function npmCacheDir(env = process.env) {
  if (env.npm_config_cache) return env.npm_config_cache;
  if (process.platform === 'win32') {
    return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'npm-cache');
  }
  return path.join(os.homedir(), '.npm');
}

/**
 * The installed copy npx would run, if one is in npx's cache: { version }.
 * With a pinned version only that version counts.
 */
export function findNpxInstall(name, version = null, { cacheDir = npmCacheDir() } = {}) {
  const root = path.join(cacheDir, '_npx');
  let dirs = [];
  try {
    dirs = fs.readdirSync(root);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const file = path.join(root, dir, 'node_modules', ...String(name).split('/'), 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!version || !exactVersion(version) || pkg.version === version) return { version: pkg.version };
    } catch {
      // not in this one
    }
  }
  return null;
}

/**
 * Whether starting this command would download something now.
 * { needed, launcher info, installed } — `needed` is false for commands that
 * download nothing, and for npx packages already in npx's cache.
 */
export function downloadCheck(command, args, { cacheDir } = {}) {
  const found = detectLauncher(command, args);
  if (!found) return { needed: false, launcher: null };
  if (found.kind === 'npm' && found.launcher === 'npx') {
    const installed = findNpxInstall(found.name, found.version, cacheDir ? { cacheDir } : undefined);
    if (installed) return { needed: false, launcher: found, installed };
  }
  return { needed: true, launcher: found, installed: null };
}

/** Environment that keeps an npx start from going online. */
export function offlineEnv(launcher) {
  if (launcher?.kind === 'npm') return { npm_config_offline: 'true', npm_config_update_notifier: 'false' };
  return {};
}

/** Environment for the first, approved start: use the cache where it can. */
export function onlineEnv(launcher) {
  if (launcher?.kind === 'npm') return { npm_config_prefer_offline: 'true', npm_config_update_notifier: 'false', npm_config_yes: 'true' };
  return {};
}

function encodeNpmName(name) {
  return String(name).startsWith('@') ? `@${encodeURIComponent(String(name).slice(1))}` : encodeURIComponent(name);
}

async function fetchJson(fetchImpl, url, signal) {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal });
  if (!res.ok) {
    const error = new Error(res.status === 404 ? 'not found' : `HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/**
 * About how much an npm package and the packages it needs download, from
 * the npm registry. Dependencies are counted at their latest version, once
 * each, so this is an estimate. Sizes are unpacked sizes: the download
 * itself is compressed and smaller.
 */
export async function estimateNpmDownload(name, version = null, {
  fetchImpl = globalThis.fetch,
  maxPackages = 300,
  concurrency = 8,
  timeoutMs = 25_000,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const root = await fetchJson(fetchImpl, `${NPM_REGISTRY}/${encodeNpmName(name)}/${encodeURIComponent(version || 'latest')}`, controller.signal);
    const seen = new Set([name]);
    let bytes = Number(root?.dist?.unpackedSize) || 0;
    let unknown = root?.dist?.unpackedSize ? 0 : 1;
    let truncated = false;
    const queue = Object.keys(root?.dependencies || {}).filter((dep) => !seen.has(dep));
    queue.forEach((dep) => seen.add(dep));

    const worker = async () => {
      while (queue.length && !controller.signal.aborted) {
        if (seen.size > maxPackages) {
          truncated = true;
          queue.length = 0;
          return;
        }
        const dep = queue.shift();
        try {
          const manifest = await fetchJson(fetchImpl, `${NPM_REGISTRY}/${encodeNpmName(dep)}/latest`, controller.signal);
          const size = Number(manifest?.dist?.unpackedSize) || 0;
          if (size) bytes += size;
          else unknown += 1;
          for (const next of Object.keys(manifest?.dependencies || {})) {
            if (!seen.has(next)) {
              seen.add(next);
              queue.push(next);
            }
          }
        } catch (err) {
          if (controller.signal.aborted) throw err;
          unknown += 1;
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (controller.signal.aborted) truncated = true;
    return {
      name,
      version: root.version || version || null,
      bytes,
      packages: Math.min(seen.size, maxPackages),
      unknownSizes: unknown,
      approximate: true,
      truncated,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The size of a PyPI package's own files (not what it needs). */
export async function estimatePypiDownload(name, version = null, { fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const url = version ? `${PYPI}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json` : `${PYPI}/${encodeURIComponent(name)}/json`;
    const data = await fetchJson(fetchImpl, url, controller.signal);
    const files = Array.isArray(data?.urls) ? data.urls : [];
    const wheel = files.find((file) => file.packagetype === 'bdist_wheel') || files[0];
    return {
      name,
      version: data?.info?.version || version || null,
      bytes: Number(wheel?.size) || 0,
      packages: 1,
      approximate: true,
      ownFilesOnly: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Size of what this command would download, for the "OK to download?"
 * question. { needed, kind, name, version, bytes, packages, approximate,
 * note } — `bytes` is null when it can't be known in advance.
 */
export async function downloadSize(command, args, options = {}) {
  const check = downloadCheck(command, args, options);
  if (!check.needed) {
    return { needed: false, kind: check.launcher?.kind || null, name: check.launcher?.name || null, version: check.installed?.version || null };
  }
  const { launcher } = check;
  const base = { needed: true, kind: launcher.kind, launcher: launcher.launcher, name: launcher.name, spec: launcher.spec };
  try {
    if (launcher.kind === 'npm') {
      const size = await estimateNpmDownload(launcher.name, launcher.version, options);
      return { ...base, ...size, note: 'Estimated from the npm registry; the download is compressed, so usually smaller.' };
    }
    if (launcher.kind === 'pypi') {
      const size = await estimatePypiDownload(launcher.name, launcher.version, options);
      return { ...base, ...size, note: 'The package itself; the packages it needs come on top.' };
    }
  } catch (err) {
    return { ...base, bytes: null, version: launcher.version, error: err.message === 'not found' ? `${launcher.name} isn't in the ${launcher.kind === 'npm' ? 'npm registry' : 'Python package index'}.` : `Couldn't check the size: ${err.message}` };
  }
  return { ...base, bytes: null, version: null, note: 'The size depends on the image; it is shown only once it downloads.' };
}
