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
import { DEFAULT_REGISTRIES, extraRegistries, networkMode, networkPlan, networkSummary } from './sandboxNetwork.js';
import { gitDirsOf, homeReadOnly, writableRoots } from './sandboxFolders.js';

export { gitDirsOf, sandboxCanChange, writableRoots } from './sandboxFolders.js';

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
let bwrapFound;

/**
 * bwrap's full path, found on den's own PATH. The sandbox is always started
 * by this path, never by name: a command's environment can carry a PATH of
 * its own (process_spawn's env_vars), and a "bwrap" found through that could
 * be any program, run outside the sandbox. Not found, it is a path that
 * doesn't exist, so starting it fails instead of searching anywhere.
 */
export function bwrapPath({ searchPath = process.env.PATH, recheck = false } = {}) {
  if (bwrapFound === undefined || recheck) {
    bwrapFound = null;
    for (const dir of String(searchPath || '').split(path.delimiter)) {
      if (!dir || !path.isAbsolute(dir)) continue;
      const candidate = path.join(dir, 'bwrap');
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (fs.statSync(candidate).isFile()) {
          bwrapFound = candidate;
          break;
        }
      } catch { /* not here */ }
    }
  }
  return bwrapFound || '/usr/bin/bwrap';
}

function bwrapRuns(flags) {
  return runFile(bwrapPath(), ['--die-with-parent', ...flags, ...PROBE_MOUNTS, '--', 'true'], { timeout: 5000 });
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
  return line ? `bwrap failed with "${line.replace(/^bwrap:\s*/, '')}".` : "bwrap failed to start.";
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
  bwrapFound = undefined;
}

/** Pretend the probe found `probe` ({ ok, flags, net, reason }); for tests. */
export function setSandboxProbe(probe) {
  linuxProbe = { flags: [], net: true, reason: null, ...probe, at: Date.now() };
}

/** True when a sandbox can be used here. */
export function sandboxAvailable(platform = process.platform) {
  if (platform === 'linux') return probeLinuxSandbox().ok;
  if (platform === 'darwin') return fs.existsSync('/usr/bin/sandbox-exec');
  return false;
}

// Tools that run commands in the sandbox. While the sandbox is on but can't
// start, each of these asks first, every time (AgentRuntime). linter_run
// also fixes (code_fix was its old name).
export const SANDBOXED_TOOLS = new Set([
  'run_command', 'run_python', 'run_node', 'shell_session_start', 'shell_session_run', 'process_spawn',
  'run_tests', 'package_manager', 'build_runner', 'linter_run', 'dependency_audit',
  'copy_run_command', 'sandbox_run_command',
]);

/**
 * on           commands run in the sandbox
 * unavailable  the sandbox is on but can't start here (`reason` says why)
 * off          the user turned it off
 * unsupported  no sandbox on this system (Windows)
 */
function sandboxState({ platform = process.platform, recheck = false } = {}) {
  if (platform !== 'linux' && platform !== 'darwin') return { state: 'unsupported', reason: "Windows doesn't have a sandbox for commands yet." };
  if (setting() === 'off') return { state: 'off', reason: null };
  if (platform === 'darwin') {
    return fs.existsSync('/usr/bin/sandbox-exec') ? { state: 'on', reason: null } : { state: 'unavailable', reason: 'sandbox-exec is missing from this Mac.' };
  }
  const probe = probeLinuxSandbox({ recheck });
  if (!probe.ok) return { state: 'unavailable', reason: probe.reason };
  if (networkMode() !== 'open' && !probe.net) {
    return { state: 'unavailable', reason: "bwrap can't give commands a network of their own here, so Network can't be limited." };
  }
  return { state: 'on', reason: null };
}

/** Why the sandbox is on but can't start, or null. Cheap: the probe is cached. */
export function sandboxCantStart(platform = process.platform) {
  const { state, reason } = sandboxState({ platform });
  return state === 'unavailable' ? reason : null;
}

/** Everything Settings → Privacy & safety shows about the sandbox. */
export function sandboxStatus({ platform = process.platform, recheck = false, home = os.homedir() } = {}) {
  const { state, reason } = sandboxState({ platform, recheck });
  const allowRead = allowedReads();
  const folders = hiddenFolders({ platform, home, allowRead: [] })
    .filter((item) => !item.follows)
    .map((item) => ({ id: item.id, path: item.path, label: item.label, allowed: allowRead.includes(item.path), exists: inspectPath(item.path).kind !== null }))
    .filter((item) => item.exists || item.allowed);
  return {
    platform,
    home,
    enabled: setting() !== 'off',
    state,
    reason,
    network: networkSummary({ platform, socat: platform === 'linux' && hasBin('socat') }),
    registries: { builtIn: DEFAULT_REGISTRIES, added: extraRegistries() },
    hiddenFolders: folders,
  };
}

// ── git's own settings and hooks ─────────────────────────────────────────────

/**
 * Make the folders that are to be read-only in the sandbox, where missing.
 * A folder that doesn't exist can't be mounted read-only, and a command
 * could then make it, with programs in it, inside a folder it may write to.
 */
export function prepareReadOnly(folders) {
  for (const folder of folders) {
    try { fs.mkdirSync(folder, { recursive: true }); } catch { /* can't be made here, nor by a command */ }
  }
}

/**
 * What keeps git's settings and hooks in the project read-only, for git
 * folders a command could otherwise change: { gitDirs, readOnly }. den runs
 * git there later, outside the sandbox (the Code panel, checkpoints, copies),
 * and a command that set core.fsmonitor or added a hook would get a program
 * of its own run there. Each git folder is also bound onto itself, so it can't
 * be renamed and replaced by one with other settings. A missing hooks folder
 * is made first, so a command can't add one.
 */
export function gitGuards({ workspaceRoot, roots, gitDirs = gitDirsOf, prepare = prepareReadOnly }) {
  const writable = (target) => roots.some((root) => isPathInside(target, root));
  const dirs = workspaceRoot ? gitDirs(workspaceRoot).filter(writable) : [];
  prepare(dirs.map((dir) => path.join(dir, 'hooks')));
  const readOnly = dirs
    .flatMap((dir) => ['config', 'config.worktree', 'hooks'].map((name) => path.join(dir, name)))
    .filter((target) => fs.existsSync(target));
  return { gitDirs: dirs, readOnly };
}

function appleString(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Environment variables for the program inside the sandbox only, as
 * [name, value] pairs (value null: removed). Names that aren't plain
 * variable names are dropped.
 */
function innerEnvEntries(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return [];
  return Object.entries(env)
    .filter(([name]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    .map(([name, value]) => [name, value === undefined || value === null ? null : String(value)]);
}

/**
 * bwrap arguments for a command that may write to `roots` and not read
 * `hidden`, started in `cwd` (the project when not given). `git` is from
 * gitGuards(); `network` is a sandboxNetwork.js plan (its flags and mounts).
 * `env` is set for the command inside, never for bwrap itself.
 */
export function bwrapArgs({ file, args, workspaceRoot, cwd = workspaceRoot, roots, hidden, readOnly = [], git = null, flags = OPTIONAL_FLAGS, network = null, env = null, inspect = inspectPath }) {
  const mounts = [];
  // Writable folders first, then empty folders over the secret ones (some sit
  // inside a writable folder, like Asyncat's data in a project or /tmp), then
  // any writable folder that a secret one covered (a project in ~/.claude).
  for (const root of roots) mounts.push('--bind-try', root, root);
  // Made beforehand (prepareReadOnly); one that still doesn't exist couldn't
  // be made, so a command can't make it either.
  for (const target of readOnly) {
    if (inspect(target).kind) mounts.push('--ro-bind', target, target);
  }
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
  for (const dir of git?.gitDirs || []) mounts.push('--bind', dir, dir);
  for (const target of git?.readOnly || []) mounts.push('--ro-bind', target, target);
  mounts.push(...(network?.mounts || []));
  // Last, once nothing more is mounted inside them: the empty folders turn
  // read-only, so a write there fails (and the hint says why) instead of
  // seeming to work and then vanishing.
  for (const cover of covers) mounts.push('--remount-ro', cover);
  const setenv = innerEnvEntries(env).flatMap(([name, value]) => (value === null ? ['--unsetenv', name] : ['--setenv', name, value]));
  return [
    '--die-with-parent', ...flags, ...(network?.bwrap || []),
    '--ro-bind', '/', '/',
    '--dev', '/dev',
    '--proc', '/proc',
    ...mounts,
    ...setenv,
    '--chdir', cwd,
    '--', file, ...args,
  ];
}

/**
 * The sandbox-exec profile: write only to `roots` (but not `readOnly` inside
 * them, nor the settings and hooks of `gitDirs`), read anything but `hidden`,
 * connect to none of the hidden sockets, and `network` rules from a
 * sandboxNetwork.js plan.
 */
export function seatbeltProfile({ roots, hidden, readOnly = [], gitDirs = [], network = [] }) {
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
    // Even where they don't exist yet, and the git folder itself (renaming it).
    ...gitDirs.map((dir) => `(deny file-write* (literal ${appleString(dir)}) ${['config', 'config.worktree', 'commondir'].map((name) => `(literal ${appleString(path.join(dir, name))})`).join(' ')} (subpath ${appleString(path.join(dir, 'hooks'))}))`),
    ...(hidden.length ? [`(deny file-read* ${hidden.map((item) => `(subpath ${appleString(item.path)})`).join(' ')})`] : []),
    ...macRoots.filter(covered).map((root) => `(allow file-read* (subpath ${appleString(root)}))`),
    ...network,
    ...(sockets.length ? [`(deny network-outbound ${sockets.map((item) => `(literal ${appleString(item.path)})`).join(' ')})`] : []),
  ].join('\n');
}

/**
 * How to start `file args` sandboxed, in `cwd` (the project when not given).
 * Returns { file, args, sandboxed, env, network } — unchanged when sandboxing
 * is off or unavailable. The returned `env` is to be added to the
 * environment it is spawned with (the proxy, in "registries" mode). Spawn it
 * in `cwd` too: on macOS the program starts in the folder sandbox-exec was
 * started in.
 *
 * `env` (given) is for the program itself, such as process_spawn's
 * env_vars. In the sandbox it is set inside, so a PATH or LD_PRELOAD in it
 * can't change which sandbox program starts or what that loads; without the
 * sandbox it comes back in the returned `env`.
 */
export function sandboxedCommand({
  file, args = [], workspaceRoot, cwd = null, platform = process.platform, home = os.homedir(), tmp = os.tmpdir(), force = null,
  hidden = null, flags = null, inspect = inspectPath, network = null, gitDirs = null, env = null,
}) {
  const inner = innerEnvEntries(env);
  const unsandboxed = () => ({ file, args, sandboxed: false, ...(inner.length ? { env: Object.fromEntries(inner) } : {}) });
  const enabled = force ?? (sandboxState({ platform }).state === 'on');
  if (!enabled || !workspaceRoot) return unsandboxed();
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

  const readOnly = homeReadOnly(home);
  const git = gitGuards({ workspaceRoot, roots, ...(gitDirs ? { gitDirs } : {}) });

  if (platform === 'linux') {
    prepareReadOnly(readOnly);
    const probeFlags = flags ?? (force ? OPTIONAL_FLAGS : probeLinuxSandbox().flags);
    const [innerFile, innerArgs] = net.wrap ? net.wrap(file, args) : [file, args];
    const bwrap = bwrapArgs({ file: innerFile, args: innerArgs, workspaceRoot, cwd: start, roots, hidden: secret, readOnly, git, flags: probeFlags, network: net, env, inspect });
    return { file: bwrapPath(), args: bwrap, sandboxed: true, env: net.env, network: about };
  }

  if (platform === 'darwin') {
    // sandbox-exec matches real paths, so follow links (a data folder in /tmp
    // is really in /private/tmp).
    const real = secret.map((item) => ({ ...item, path: inspect(item.path).real }));
    const profile = seatbeltProfile({ roots, hidden: real, readOnly, gitDirs: git.gitDirs, network: net.seatbelt });
    // The program's own variables are set by env, inside the sandbox.
    const command = inner.length
      ? ['/usr/bin/env', ...inner.flatMap(([name, value]) => (value === null ? ['-u', name] : [])),
        ...inner.filter(([, value]) => value !== null).map(([name, value]) => `${name}=${value}`), file, ...args]
      : [file, ...args];
    return { file: '/usr/bin/sandbox-exec', args: ['-p', profile, ...command], sandboxed: true, env: net.env, network: about };
  }

  return unsandboxed();
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
