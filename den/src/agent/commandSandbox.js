/**
 * Run the agent's commands in a sandbox where they can read most of the
 * computer but only write inside the project folder, temporary folders and
 * package caches, and can't read the folders that hold your sign-ins and keys
 * (~/.ssh, browser profiles, Asyncat's own data…). A mistaken or
 * prompt-injected command such as `rm -rf ~` then fails instead of deleting
 * your files, and `cat ~/.ssh/id_ed25519` finds nothing.
 *
 * Linux uses bubblewrap (bwrap), macOS uses the built-in sandbox-exec. On
 * Windows, or when the tool is missing, commands run as before. Settings:
 *   ASYNCAT_COMMAND_SANDBOX     "auto" (default: sandbox when possible) or "off"
 *   ASYNCAT_SANDBOX_ALLOW_READ  hidden folders you allowed back (a JSON list)
 *   ASYNCAT_SANDBOX_NETWORK     "open", "registries" or "off" (sandboxNetwork.js)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { IS_WIN, hasBin, isPathInside, runFile, runProcess } from './tools/shared.js';
import { getConfigValue } from '../config/appConfig.js';
import { runtimeDataRoot } from '../config/runtimeConfig.js';
import { networkMode, networkPlan } from './sandboxNetwork.js';

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
// the environments pre-commit runs from git hooks.
const HOME_READ_ONLY = ['.cache/node/corepack', '.cache/pre-commit'];

// Folders and files that hold sign-ins, keys and private data. The package
// registry files hold publish tokens, which "Package registries only" would
// let a command use.
const HOME_SECRETS = [
  ['.ssh', 'SSH keys'],
  ['.gnupg', 'GPG keys'],
  ['.aws', 'AWS'],
  ['.azure', 'Azure'],
  ['.config/gcloud', 'Google Cloud'],
  ['.kube', 'Kubernetes'],
  ['.docker', 'Docker'],
  ['.config/gh', 'GitHub CLI'],
  ['.config/hub', 'GitHub (hub)'],
  ['.password-store', 'Password store'],
  ['.local/share/keyrings', 'Keyrings'],
  ['.netrc', 'Saved logins (.netrc)'],
  ['.git-credentials', 'Saved Git logins'],
  ['.config/git/credentials', 'Saved Git logins'],
  ['.npmrc', 'npm sign-in (.npmrc)'],
  ['.yarnrc.yml', 'Yarn sign-in (.yarnrc.yml)'],
  ['.pypirc', 'PyPI sign-in (.pypirc)'],
  ['.cargo/credentials', 'crates.io sign-in'],
  ['.cargo/credentials.toml', 'crates.io sign-in'],
  ['.gem/credentials', 'RubyGems sign-in'],
  ['.m2/settings.xml', 'Maven settings'],
  ['.gradle/gradle.properties', 'Gradle settings'],
  ['.nuget/NuGet/NuGet.Config', 'NuGet settings'],
  ['.claude', 'Claude Code'],
  ['.codex', 'Codex'],
];
// Sockets of programs that run anything you ask: through Docker's, a command
// could start a container with your whole disk in it. A socket can be used
// through a read-only folder, so each is covered itself.
const HOST_SOCKETS = {
  linux: [['/var/run/docker.sock', 'Docker engine'], ['/run/docker.sock', 'Docker engine'], ['/run/podman/podman.sock', 'Podman']],
  darwin: [['/var/run/docker.sock', 'Docker engine']],
};
const BROWSER_PROFILES = {
  linux: [
    ['.mozilla', 'Firefox'], ['.librewolf', 'LibreWolf'], ['.zen', 'Zen'], ['.floorp', 'Floorp'],
    ['.config/google-chrome', 'Chrome'], ['.config/google-chrome-beta', 'Chrome Beta'], ['.config/chromium', 'Chromium'],
    ['.config/BraveSoftware', 'Brave'], ['.config/microsoft-edge', 'Edge'], ['.config/vivaldi', 'Vivaldi'], ['.config/opera', 'Opera'],
    ['snap/firefox', 'Firefox (Snap)'], ['snap/chromium', 'Chromium (Snap)'],
    ['.var/app/org.mozilla.firefox', 'Firefox (Flatpak)'], ['.var/app/com.google.Chrome', 'Chrome (Flatpak)'],
    ['.var/app/com.brave.Browser', 'Brave (Flatpak)'], ['.var/app/org.chromium.Chromium', 'Chromium (Flatpak)'],
  ],
  darwin: [
    ['Library/Application Support/Google/Chrome', 'Chrome'], ['Library/Application Support/Firefox', 'Firefox'],
    ['Library/Application Support/BraveSoftware', 'Brave'], ['Library/Application Support/Microsoft Edge', 'Edge'],
    ['Library/Application Support/Arc', 'Arc'], ['Library/Application Support/Chromium', 'Chromium'],
    ['Library/Safari', 'Safari'], ['Library/Cookies', 'Cookies'], ['Library/Keychains', 'Keychains'],
  ],
};

function configValue(key) {
  let value = process.env[key];
  if (value === undefined || value === '') {
    try { value = getConfigValue(key); } catch { /* config not ready */ }
  }
  return value ?? '';
}

function setting() {
  return String(configValue('ASYNCAT_COMMAND_SANDBOX') || 'auto').toLowerCase() === 'off' ? 'off' : 'auto';
}

/** Hidden folders the user allowed commands to read again. */
export function allowedReads(value = configValue('ASYNCAT_SANDBOX_ALLOW_READ')) {
  let list = [];
  try {
    const parsed = JSON.parse(String(value || '[]'));
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    list = String(value || '').split('\n');
  }
  return [...new Set(list.map((item) => String(item || '').trim()).filter((item) => path.isAbsolute(item)).map((item) => path.resolve(item)))];
}

/** The desktop app's own folder (with the key file that unlocks saved secrets). */
function userDataFolder({ platform, home, env }) {
  if (env.ASYNCAT_USER_DATA) return path.resolve(env.ASYNCAT_USER_DATA);
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Asyncat');
  if (platform === 'linux') return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Asyncat');
  return null;
}

/**
 * Everything commands may not read, before checking what exists: [{ id,
 * path, label }]. A folder that is the project, or inside it, stays readable,
 * as does one you allowed back.
 */
export function hiddenFolders({
  platform = process.platform, home = os.homedir(), env = process.env, dataRoot = runtimeDataRoot(),
  workspaceRoot = null, allowRead = allowedReads(),
} = {}) {
  const list = [
    ...HOME_SECRETS.map(([rel, label]) => ({ id: rel, path: path.join(home, rel), label })),
    ...(BROWSER_PROFILES[platform] || []).map(([rel, label]) => ({ id: rel, path: path.join(home, rel), label, browser: true })),
    { id: 'asyncat-data', path: path.resolve(dataRoot), label: "Asyncat's data" },
  ];
  const userData = userDataFolder({ platform, home, env });
  if (userData) list.push({ id: 'asyncat-app', path: userData, label: 'Asyncat app data' });
  if (platform === 'linux') {
    // D-Bus, the keyring, ssh-agent and systemd live here: through them a
    // command could start a program outside the sandbox.
    const runtimeDir = env.XDG_RUNTIME_DIR || (typeof process.getuid === 'function' ? `/run/user/${process.getuid()}` : null);
    if (runtimeDir) list.push({ id: 'session', path: path.resolve(runtimeDir), label: 'Session services (D-Bus, keyring, ssh-agent)' });
    list.push({ id: 'x11', path: '/tmp/.X11-unix', label: 'X11 display' });
  }
  for (const [socket, label] of HOST_SOCKETS[platform] || []) list.push({ id: socket, path: socket, label, socket: true });
  // The SSH agent signs with your keys, so it goes with ~/.ssh (and is not
  // listed on its own: its path changes every time you sign in).
  const sshDir = path.join(home, '.ssh');
  if (env.SSH_AUTH_SOCK && path.isAbsolute(env.SSH_AUTH_SOCK)) {
    list.push({ id: 'ssh-agent', path: path.resolve(env.SSH_AUTH_SOCK), label: 'SSH agent', socket: true, follows: sshDir });
  }
  const allowed = new Set(allowRead.map((item) => path.resolve(item)));
  const open = (target) => allowed.has(target) || Boolean(workspaceRoot && isPathInside(target, workspaceRoot));
  return list.filter((item) => !open(item.path) && !(item.follows && open(item.follows)));
}

/** 'dir', 'file' or null, and the real path (links followed). */
function inspectPath(target) {
  try {
    const real = fs.realpathSync(target);
    const stat = fs.statSync(real);
    return { kind: stat.isDirectory() ? 'dir' : 'file', real };
  } catch {
    return { kind: null, real: target };
  }
}

// ── Can the sandbox start here? ──────────────────────────────────────────────

const PROBE_TTL_MS = 5 * 60 * 1000;
const OPTIONAL_FLAGS = ['--new-session', '--unshare-pid', '--unshare-ipc', '--unshare-uts'];
const PROBE_MOUNTS = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc'];
let linuxProbe = null;

function bwrapRuns(flags) {
  return runFile('bwrap', ['--die-with-parent', ...flags, ...PROBE_MOUNTS, '--', 'true'], { timeout: 5000 });
}

function readSysctl(file) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return null; }
}

/** Why bwrap won't start, in a sentence. */
export function bwrapFailureReason(result, { readFile = readSysctl } = {}) {
  const text = `${result?.error || ''}\n${result?.stderr || ''}`;
  if (/ENOENT|not found/i.test(text) && !/bwrap:/.test(text)) return "bwrap isn't installed.";
  if (readFile('/proc/sys/kernel/apparmor_restrict_unprivileged_userns') === '1') {
    return 'AppArmor stops bwrap from running (Ubuntu 24.04 and later do this by default).';
  }
  if (readFile('/proc/sys/kernel/unprivileged_userns_clone') === '0' || readFile('/proc/sys/user/max_user_namespaces') === '0') {
    return 'This system turns off the user namespaces bwrap needs.';
  }
  const line = String(result?.stderr || result?.error || '').trim().split('\n')[0];
  return line ? `bwrap can't start here: ${line.replace(/^bwrap:\s*/, '')}` : "bwrap can't start here.";
}

/**
 * Try bwrap (cached for a few minutes): whether it runs, which of the extra
 * isolation flags work here, and if it can't run, why.
 */
export function probeLinuxSandbox({ recheck = false } = {}) {
  if (linuxProbe && !recheck && Date.now() - linuxProbe.at < PROBE_TTL_MS) return linuxProbe;
  let probe;
  if (bwrapRuns([...OPTIONAL_FLAGS, '--unshare-net']).ok) {
    probe = { ok: true, flags: [...OPTIONAL_FLAGS], net: true, reason: null };
  } else {
    const base = bwrapRuns([]);
    if (!base.ok) {
      probe = { ok: false, flags: [], net: false, reason: bwrapFailureReason(base) };
    } else {
      const flags = OPTIONAL_FLAGS.filter((flag) => bwrapRuns([flag]).ok);
      probe = { ok: true, flags, net: bwrapRuns([...flags, '--unshare-net']).ok, reason: null };
    }
  }
  linuxProbe = { ...probe, at: Date.now() };
  return linuxProbe;
}

/** Forget the cached probe (tests, or after installing bwrap). */
export function resetSandboxProbe() {
  linuxProbe = null;
}

/** True when a sandbox can be used here. */
export function sandboxAvailable(platform = process.platform) {
  if (platform === 'linux') return probeLinuxSandbox().ok;
  if (platform === 'darwin') return fs.existsSync('/usr/bin/sandbox-exec');
  return false;
}

/** Folders a sandboxed command may write to. */
export function writableRoots({ workspaceRoot, home = os.homedir(), tmp = os.tmpdir() }) {
  const roots = new Set([workspaceRoot, '/tmp', '/var/tmp', tmp].filter(Boolean).map((p) => path.resolve(p)));
  for (const dir of HOME_CACHE_DIRS) roots.add(path.join(home, dir));
  return [...roots];
}

function appleString(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * bwrap arguments for a command that may write to `roots` and not read
 * `hidden`, started in `cwd` (the project when not given). `network` is a
 * sandboxNetwork.js plan (its flags and mounts).
 */
export function bwrapArgs({ file, args, workspaceRoot, cwd = workspaceRoot, roots, hidden, readOnly = [], flags = OPTIONAL_FLAGS, network = null, inspect = inspectPath }) {
  const mounts = [];
  // Writable folders first, then empty folders over the secret ones (some sit
  // inside a writable folder, like Asyncat's data in a project or /tmp), then
  // any writable folder that a secret one covered (a project in ~/.claude).
  for (const root of roots) mounts.push('--bind-try', root, root);
  for (const target of readOnly) mounts.push('--ro-bind-try', target, target);
  const covers = [];
  const done = new Set();
  for (const item of hidden) {
    const { kind, real } = inspect(item.path);
    if (!kind || done.has(real)) continue;
    done.add(real);
    if (kind === 'dir') {
      mounts.push('--tmpfs', real);
      covers.push(real);
    } else {
      mounts.push('--ro-bind', '/dev/null', real);
    }
  }
  for (const root of roots) {
    if (covers.some((cover) => cover !== root && isPathInside(root, cover))) mounts.push('--bind-try', root, root);
  }
  mounts.push(...(network?.mounts || []));
  // Last, once nothing more is mounted inside them: the empty folders turn
  // read-only, so a write there fails (and the hint says why) instead of
  // seeming to work and then vanishing.
  for (const cover of covers) mounts.push('--remount-ro', cover);
  return [
    '--die-with-parent', ...flags, ...(network?.bwrap || []),
    '--ro-bind', '/', '/',
    '--dev', '/dev',
    '--proc', '/proc',
    ...mounts,
    '--chdir', cwd,
    '--', file, ...args,
  ];
}

/**
 * The sandbox-exec profile: write only to `roots` (but not `readOnly` inside
 * them), read anything but `hidden`, connect to none of the hidden sockets,
 * and `network` rules from a sandboxNetwork.js plan.
 */
export function seatbeltProfile({ roots, hidden, readOnly = [], network = [] }) {
  // /tmp and the per-user temp folder live under /private on macOS.
  const macRoots = [...roots, '/private/tmp', '/private/var/folders'];
  const covered = (root) => hidden.some((item) => isPathInside(root, item.path));
  const sockets = hidden.filter((item) => item.socket);
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    `(allow file-write* ${macRoots.map((root) => `(subpath ${appleString(root)})`).join(' ')})`,
    '(allow file-write* (literal "/dev/null") (literal "/dev/zero") (regex #"^/dev/tty") (regex #"^/dev/fd/"))',
    ...(readOnly.length ? [`(deny file-write* ${readOnly.map((target) => `(subpath ${appleString(target)})`).join(' ')})`] : []),
    ...(hidden.length ? [`(deny file-read* ${hidden.map((item) => `(subpath ${appleString(item.path)})`).join(' ')})`] : []),
    ...macRoots.filter(covered).map((root) => `(allow file-read* (subpath ${appleString(root)}))`),
    ...network,
    ...(sockets.length ? [`(deny network-outbound ${sockets.map((item) => `(literal ${appleString(item.path)})`).join(' ')})`] : []),
  ].join('\n');
}

/**
 * How to start `file args` sandboxed, in `cwd` (the project when not given).
 * Returns { file, args, sandboxed, env, network } — unchanged when sandboxing
 * is off or unavailable. `env` is to be added to the program's environment
 * (the proxy, in "registries" mode). Spawn it in `cwd` too: on macOS the
 * program starts in the folder sandbox-exec was started in.
 */
export function sandboxedCommand({
  file, args = [], workspaceRoot, cwd = null, platform = process.platform, home = os.homedir(), tmp = os.tmpdir(), force = null,
  hidden = null, flags = null, inspect = inspectPath, network = null,
}) {
  const enabled = force ?? (setting() !== 'off' && sandboxAvailable(platform));
  if (!enabled || !workspaceRoot) return { file, args, sandboxed: false };
  const roots = writableRoots({ workspaceRoot, home, tmp });
  // bwrap starts the command in the folder named here, not the one bwrap was
  // started in, so a tool's subfolder (one package of a monorepo, say) must
  // be passed on, or a build there builds the project root instead. Only a
  // folder the command may change: anything else is the caller's mistake.
  const start = path.resolve(cwd || workspaceRoot);
  if (!roots.some((root) => isPathInside(start, root))) {
    throw new Error(`A sandboxed command can only start in a folder it may change, and ${start} isn't one.`);
  }
  const secret = hidden ?? hiddenFolders({ platform, home, workspaceRoot });
  const net = network ?? networkPlan({ mode: networkMode(), platform, socat: platform === 'linux' && hasBin('socat') });
  const about = { mode: net.mode, effective: net.effective, ...(net.note ? { note: net.note } : {}) };

  const readOnly = HOME_READ_ONLY.map((rel) => path.join(home, rel));

  if (platform === 'linux') {
    const probeFlags = flags ?? (force ? OPTIONAL_FLAGS : probeLinuxSandbox().flags);
    const [inner, innerArgs] = net.wrap ? net.wrap(file, args) : [file, args];
    const bwrap = bwrapArgs({ file: inner, args: innerArgs, workspaceRoot, cwd: start, roots, hidden: secret, readOnly, flags: probeFlags, network: net, inspect });
    return { file: 'bwrap', args: bwrap, sandboxed: true, env: net.env, network: about };
  }

  if (platform === 'darwin') {
    // sandbox-exec matches real paths, so follow links (a data folder in /tmp
    // is really in /private/tmp).
    const real = secret.map((item) => ({ ...item, path: inspect(item.path).real }));
    const profile = seatbeltProfile({ roots, hidden: real, readOnly, network: net.seatbelt });
    return { file: '/usr/bin/sandbox-exec', args: ['-p', profile, file, ...args], sandboxed: true, env: net.env, network: about };
  }

  return { file, args, sandboxed: false };
}

const NETWORK_FAILURE = /ENOTFOUND|EAI_AGAIN|getaddrinfo|Could not resolve|name resolution|Network is unreachable|ENETUNREACH|ECONNREFUSED|403 Forbidden|only lets commands reach package registries/i;

/**
 * A note for the model when a sandboxed command failed to write somewhere,
 * or failed to reach the network while the sandbox keeps it off or limited.
 */
export function sandboxHint(result, network = null) {
  const text = `${result?.stderr || ''}\n${result?.stdout || ''}`;
  if (result?.success) return null;
  if (/Read-only file system|Operation not permitted|EROFS/i.test(text)) {
    return 'This command ran in Asyncat\'s sandbox, which only allows writing inside the project folder, temporary folders and package caches. If it really needs to write elsewhere, tell the user; they can turn the sandbox off in Settings → Privacy & safety or run the command themselves.';
  }
  if (network && network.effective !== 'open' && NETWORK_FAILURE.test(text)) {
    const how = network.effective === 'registries' ? 'can only reach package registries' : 'has no network';
    return `This command ran in Asyncat's sandbox, which ${how}${network.note ? ` (${network.note})` : ''}. If it really needs other sites, tell the user; they can change Network in Settings → Privacy & safety.`;
  }
  return null;
}

/**
 * Run a tool's program in the sandbox (when it is on), in `cwd` (the project
 * when not given), with `workspaceRoot` as the folder it may change. Without
 * args, cmd is a fixed shell command. Resolves like shared.js runProcess,
 * plus `sandboxed` and a `note` when the sandbox stopped a write.
 */
export async function runInSandbox(cmd, args = [], { workspaceRoot, ...options } = {}) {
  const [file, argv] = args.length > 0
    ? [cmd, args]
    : (IS_WIN ? ['cmd.exe', ['/c', cmd]] : ['/bin/sh', ['-c', cmd]]);
  const cwd = options.cwd || workspaceRoot;
  let plan;
  try {
    plan = sandboxedCommand({ file, args: argv, workspaceRoot, cwd });
  } catch (err) {
    return { success: false, exit_code: null, stdout: '', stderr: '', error: err.message };
  }
  const result = await runProcess(plan.file, plan.args, { ...options, cwd, env: { ...(plan.env || {}), ...(options.env || {}) } });
  const hint = plan.sandboxed ? sandboxHint(result, plan.network) : null;
  return { ...result, ...(plan.sandboxed ? { sandboxed: true } : {}), ...(hint ? { note: hint } : {}) };
}
