/**
 * Run the agent's shell commands in a sandbox where they can read the whole
 * computer but only write inside the project folder, temporary folders and
 * package caches. A mistaken or prompt-injected command such as `rm -rf ~`
 * then fails instead of deleting your files.
 *
 * Linux uses bubblewrap (bwrap), macOS uses the built-in sandbox-exec. On
 * Windows, or when the tool is missing, commands run as before. The setting
 * ASYNCAT_COMMAND_SANDBOX is "auto" (default: sandbox when possible) or "off".
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { IS_WIN, hasBin, isPathInside, runFile, runProcess } from './tools/shared.js';
import { getConfigValue } from '../config/appConfig.js';

// Folders under the home folder that build tools write caches to.
const HOME_CACHE_DIRS = [
  '.cache', '.npm', '.yarn', '.pnpm-store', '.local/share/pnpm', '.bun/install/cache', '.cargo', '.rustup',
  '.gradle', '.m2', '.nuget', '.deno', '.pyenv/shims', '.local/state', '.dotnet', 'go/pkg', '.config/configstore',
];

function setting() {
  let value = process.env.ASYNCAT_COMMAND_SANDBOX;
  if (!value) {
    try { value = getConfigValue('ASYNCAT_COMMAND_SANDBOX'); } catch { /* config not ready */ }
  }
  return String(value || 'auto').toLowerCase() === 'off' ? 'off' : 'auto';
}

let linuxProbe = null;

/**
 * True when a sandbox can be used here. On Linux bwrap is also tried once:
 * some systems ship it without allowing it to run (no user namespaces), and
 * then every command would fail.
 */
export function sandboxAvailable(platform = process.platform) {
  if (platform === 'linux') {
    if (linuxProbe === null) {
      linuxProbe = hasBin('bwrap')
        && runFile('bwrap', ['--die-with-parent', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--', 'true'], { timeout: 5000 }).ok;
    }
    return linuxProbe;
  }
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
 * How to start `file args` sandboxed, in `cwd` (the project when not given).
 * Returns { file, args, sandboxed } — unchanged when sandboxing is off or
 * unavailable. Spawn it in `cwd` too: on macOS the program starts in the
 * folder sandbox-exec was started in.
 */
export function sandboxedCommand({ file, args = [], workspaceRoot, cwd = null, platform = process.platform, home = os.homedir(), tmp = os.tmpdir(), force = null }) {
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

  if (platform === 'linux') {
    const bwrapArgs = [
      '--die-with-parent',
      '--ro-bind', '/', '/',
      '--dev', '/dev',
      '--proc', '/proc',
      ...roots.flatMap((root) => ['--bind-try', root, root]),
      '--chdir', start,
      '--', file, ...args,
    ];
    return { file: 'bwrap', args: bwrapArgs, sandboxed: true };
  }

  if (platform === 'darwin') {
    // /tmp and the per-user temp folder live under /private on macOS.
    const macRoots = [...roots, '/private/tmp', '/private/var/folders'];
    const profile = [
      '(version 1)',
      '(allow default)',
      '(deny file-write*)',
      `(allow file-write* ${macRoots.map((root) => `(subpath ${appleString(root)})`).join(' ')})`,
      '(allow file-write* (literal "/dev/null") (literal "/dev/zero") (regex #"^/dev/tty") (regex #"^/dev/fd/"))',
    ].join('\n');
    return { file: '/usr/bin/sandbox-exec', args: ['-p', profile, file, ...args], sandboxed: true };
  }

  return { file, args, sandboxed: false };
}

/** A note for the model when a sandboxed command failed to write somewhere. */
export function sandboxHint(result) {
  const text = `${result?.stderr || ''}\n${result?.stdout || ''}`;
  if (result?.success || !/Read-only file system|Operation not permitted|EROFS/i.test(text)) return null;
  return 'This command ran in Asyncat\'s sandbox, which only allows writing inside the project folder, temporary folders and package caches. If it really needs to write elsewhere, tell the user; they can turn the sandbox off in Settings → Privacy & safety or run the command themselves.';
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
  const hint = plan.sandboxed ? sandboxHint(result) : null;
  return { ...result, ...(plan.sandboxed ? { sandboxed: true } : {}), ...(hint ? { note: hint } : {}) };
}
