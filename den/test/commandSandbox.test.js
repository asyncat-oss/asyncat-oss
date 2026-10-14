import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  allowedReads, bwrapArgs, bwrapFailureReason, hiddenFolders, sandboxAvailable, sandboxedCommand, seatbeltProfile, writableRoots,
} from '../src/agent/commandSandbox.js';
import { runCommandTool } from '../src/agent/tools/shellTools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const noBwrap = (process.platform !== 'linux' || !sandboxAvailable()) && 'bwrap can\'t run on this computer';

// A fake file system for argument tests: these exist, as folders or files.
function fakeInspect(dirs = [], files = []) {
  return (target) => ({ kind: dirs.includes(target) ? 'dir' : files.includes(target) ? 'file' : null, real: target });
}

test('the sandbox only lets commands write in the project, temp and caches', () => {
  const roots = writableRoots({ workspaceRoot: '/work/project', home: '/home/me', tmp: '/tmp' });
  assert.ok(roots.includes('/work/project'));
  assert.ok(roots.includes('/home/me/.npm'));
  assert.ok(!roots.includes('/home/me'));

  const linux = sandboxedCommand({ file: '/bin/sh', args: ['-c', 'ls'], workspaceRoot: '/work/project', platform: 'linux', home: '/home/me', force: true, hidden: [] });
  assert.equal(linux.file, 'bwrap');
  assert.equal(linux.args[0], '--die-with-parent');
  assert.deepEqual(linux.args.slice(-4), ['--', '/bin/sh', '-c', 'ls']);

  const mac = sandboxedCommand({ file: '/bin/sh', args: ['-c', 'ls'], workspaceRoot: '/Users/me/p"x', platform: 'darwin', home: '/Users/me', force: true, hidden: [] });
  assert.equal(mac.file, '/usr/bin/sandbox-exec');
  assert.match(mac.args[1], /\(deny file-write\*\)/);
  assert.match(mac.args[1], /\(subpath "\/Users\/me\/p\\"x"\)/);

  assert.equal(sandboxedCommand({ file: 'cmd.exe', args: [], workspaceRoot: 'C:\\p', platform: 'win32', force: false }).sandboxed, false);
});

test('folders of programs on your PATH are not writable', () => {
  const roots = writableRoots({ workspaceRoot: '/work/project', home: '/home/me', tmp: '/tmp' });
  const writable = (target) => roots.some((root) => target === root || target.startsWith(`${root}/`));
  for (const cache of ['.cargo/registry', '.cargo/git', '.rustup/downloads', '.gradle/caches', '.m2/repository', '.nuget/packages', 'go/pkg/mod']) {
    assert.ok(writable(`/home/me/${cache}`), cache);
  }
  for (const program of [
    '.cargo/bin', // on PATH
    '.rustup/toolchains/stable/bin/rustc', // what ~/.cargo/bin's proxies start
    '.rustup/settings.toml',
    '.dotnet/dotnet', '.dotnet/tools',
    '.gradle/wrapper/dists', '.gradle/init.d', // Gradle's own downloads, scripts every build runs
    '.yarn/bin', '.local/share/pnpm', '.deno', '.pyenv/shims', 'go/bin',
    '.m2/settings.xml',
  ]) {
    assert.ok(!writable(`/home/me/${program}`), program);
  }
});

test('secret folders are hidden unless they are the project or allowed back', () => {
  const env = { XDG_RUNTIME_DIR: '/run/user/1000' };
  const all = hiddenFolders({ platform: 'linux', home: '/home/me', env, dataRoot: '/opt/asyncat/data', allowRead: [] });
  const paths = all.map((item) => item.path);
  for (const expected of ['/home/me/.ssh', '/home/me/.gnupg', '/home/me/.aws', '/home/me/.config/gcloud', '/home/me/.kube',
    '/home/me/.docker', '/home/me/.mozilla', '/home/me/.config/google-chrome', '/home/me/.config/BraveSoftware',
    '/home/me/.claude', '/home/me/.codex', '/opt/asyncat/data', '/home/me/.config/Asyncat', '/run/user/1000']) {
    assert.ok(paths.includes(expected), expected);
  }
  assert.ok(all.every((item) => item.label), 'every hidden folder has a name to show');

  for (const file of ['.npmrc', '.pypirc', '.yarnrc.yml', '.cargo/credentials.toml', '.gem/credentials', '.config/hub']) {
    assert.ok(paths.includes(`/home/me/${file}`), `${file} holds a registry token`);
  }
  assert.ok(paths.includes('/var/run/docker.sock') && paths.includes('/run/podman/podman.sock'));

  const allowed = hiddenFolders({ platform: 'linux', home: '/home/me', env, dataRoot: '/opt/asyncat/data', allowRead: ['/home/me/.ssh'] });
  assert.ok(!allowed.some((item) => item.path === '/home/me/.ssh'));

  // The SSH agent goes with ~/.ssh.
  const agentEnv = { ...env, SSH_AUTH_SOCK: '/tmp/ssh-abc/agent.42' };
  const agent = hiddenFolders({ platform: 'linux', home: '/home/me', env: agentEnv, dataRoot: '/d', allowRead: [] });
  assert.ok(agent.some((item) => item.path === '/tmp/ssh-abc/agent.42' && item.socket));
  const sshAllowed = hiddenFolders({ platform: 'linux', home: '/home/me', env: agentEnv, dataRoot: '/d', allowRead: ['/home/me/.ssh'] });
  assert.ok(!sshAllowed.some((item) => item.id === 'ssh-agent'));

  // Working on ~/.claude itself, or a project that holds Asyncat's data.
  const own = hiddenFolders({ platform: 'linux', home: '/home/me', env, dataRoot: '/work/asyncat/den/data', workspaceRoot: '/home/me/.claude', allowRead: [] });
  assert.ok(!own.some((item) => item.path === '/home/me/.claude'));
  const repo = hiddenFolders({ platform: 'linux', home: '/home/me', env, dataRoot: '/work/asyncat/den/data', workspaceRoot: '/work/asyncat', allowRead: [] });
  assert.ok(!repo.some((item) => item.path === '/work/asyncat/den/data'));

  const mac = hiddenFolders({ platform: 'darwin', home: '/Users/me', env: {}, dataRoot: '/d', allowRead: [] }).map((item) => item.path);
  assert.ok(mac.includes('/Users/me/Library/Application Support/Google/Chrome'));
  assert.ok(mac.includes('/Users/me/Library/Application Support/Asyncat'));
  assert.ok(mac.includes('/Users/me/.ssh'));
});

test('allowed folders are read from a JSON list of absolute paths', () => {
  assert.deepEqual(allowedReads('["/home/me/.ssh", "relative", "/home/me/.ssh/"]'), ['/home/me/.ssh']);
  assert.deepEqual(allowedReads(''), []);
  assert.deepEqual(allowedReads('not json\n/home/me/.aws'), ['/home/me/.aws']);
});

test('bwrap covers secret folders after the writable ones, and uncovers a project inside one', () => {
  const hidden = [
    { path: '/home/me/.ssh' }, { path: '/home/me/.netrc' }, { path: '/home/me/.claude' }, { path: '/home/me/.missing' },
    { path: '/tmp/asyncat/data' },
  ];
  const args = bwrapArgs({
    file: '/bin/sh', args: ['-c', 'ls'], workspaceRoot: '/home/me/.claude/plugin',
    roots: ['/home/me/.claude/plugin', '/tmp'], hidden,
    inspect: fakeInspect(['/home/me/.ssh', '/home/me/.claude', '/tmp/asyncat/data'], ['/home/me/.netrc']),
  });
  const text = args.join(' ');
  for (const flag of ['--die-with-parent', '--new-session', '--unshare-pid', '--unshare-ipc', '--unshare-uts']) assert.ok(args.includes(flag), flag);
  assert.match(text, /--tmpfs \/home\/me\/\.ssh/);
  assert.match(text, /--ro-bind \/dev\/null \/home\/me\/\.netrc/);
  assert.doesNotMatch(text, /\.missing/);
  // /tmp is writable, but the data folder inside it stays covered.
  assert.ok(text.indexOf('--bind-try /tmp /tmp') < text.indexOf('--tmpfs /tmp/asyncat/data'));
  // The project in ~/.claude is bound again after ~/.claude is covered.
  const cover = text.indexOf('--tmpfs /home/me/.claude');
  assert.ok(cover > 0);
  assert.ok(text.lastIndexOf('--bind-try /home/me/.claude/plugin /home/me/.claude/plugin') > cover);
  // The covers turn read-only last, so writes there fail instead of vanishing.
  assert.ok(text.indexOf('--remount-ro /home/me/.ssh') > text.lastIndexOf('--bind-try /home/me/.claude/plugin'));
  assert.match(text, /--remount-ro \/home\/me\/\.claude/);
});

test('a socket is covered once, even when two of its paths lead to it', () => {
  const args = bwrapArgs({
    file: 'true', args: [], workspaceRoot: '/work/p', roots: ['/work/p'],
    hidden: [{ path: '/var/run/docker.sock', socket: true }, { path: '/run/docker.sock', socket: true }],
    inspect: (target) => (target.endsWith('docker.sock') ? { kind: 'file', real: '/run/docker.sock' } : { kind: null, real: target }),
  });
  assert.equal(args.join(' ').split('--ro-bind /dev/null /run/docker.sock').length - 1, 1);
});

test('the macOS profile denies reading secret folders', () => {
  const profile = seatbeltProfile({
    roots: ['/Users/me/.claude/plugin', '/Users/me/.npm'],
    hidden: [{ path: '/Users/me/.ssh' }, { path: '/Users/me/Library/Application Support/Google/Chrome' }, { path: '/Users/me/.claude' }],
  });
  assert.match(profile, /\(deny file-read\* \(subpath "\/Users\/me\/\.ssh"\) \(subpath "\/Users\/me\/Library\/Application Support\/Google\/Chrome"\) \(subpath "\/Users\/me\/\.claude"\)\)/);
  assert.match(profile, /\(allow file-read\* \(subpath "\/Users\/me\/\.claude\/plugin"\)\)/);
  assert.doesNotMatch(profile, /\(allow file-read\* \(subpath "\/Users\/me\/\.npm"\)\)/);
  // The deny comes after (allow default), so it wins.
  assert.ok(profile.indexOf('(allow default)') < profile.indexOf('(deny file-read*'));

  const more = seatbeltProfile({
    roots: ['/Users/me/.cache'], readOnly: ['/Users/me/.cache/node/corepack'],
    hidden: [{ path: '/private/var/run/docker.sock', socket: true }],
  });
  assert.match(more, /\(deny file-write\* \(subpath "\/Users\/me\/\.cache\/node\/corepack"\)\)/);
  assert.ok(more.indexOf('(deny file-write* (subpath "/Users/me/.cache/node') > more.indexOf('(allow file-write* (subpath "/Users/me/.cache")'));
  assert.match(more, /\(deny network-outbound \(literal "\/private\/var\/run\/docker\.sock"\)\)/);
});

test("the reason bwrap can't start is said plainly", () => {
  const blocked = { ok: false, stderr: 'bwrap: setting up uid map: Permission denied' };
  assert.match(bwrapFailureReason(blocked, { readFile: (file) => (file.endsWith('apparmor_restrict_unprivileged_userns') ? '1' : null) }), /AppArmor/);
  assert.match(bwrapFailureReason({ ok: false, error: 'spawnSync bwrap ENOENT' }, { readFile: () => null }), /isn't installed/);
  assert.match(bwrapFailureReason(blocked, { readFile: () => null }), /setting up uid map/);
});

test('a sandboxed run_command cannot write outside the project', { skip: !sandboxAvailable() && 'no sandbox tool on this computer' }, async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-sandbox-'));
  const outside = path.join(here, `.sandbox-escape-${randomUUID()}`);
  try {
    const inside = await runCommandTool.execute({ command: 'echo ok > made-here.txt && cat /etc/hostname > /dev/null' }, { workingDir: project });
    assert.equal(inside.success, true, inside.stderr);
    assert.equal(inside.sandboxed, true);
    assert.ok(fs.existsSync(path.join(project, 'made-here.txt')));

    const escape = await runCommandTool.execute({ command: `touch '${outside}'` }, { workingDir: project });
    assert.equal(escape.success, false);
    assert.equal(fs.existsSync(outside), false, 'the command must not have written outside the project');
    assert.match(escape.note || '', /sandbox/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });
  }
});

// A real run with bwrap, in a made-up home folder: nothing of yours is read.
test('in the sandbox a command finds secret folders empty and PATH folders read-only', { skip: noBwrap }, async () => {
  // The made-up home is outside /tmp (which commands may write to), like a real one.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-home-'));
  const home = path.join(here, `.sandbox-home-${randomUUID()}`);
  const project = path.join(scratch, 'project');
  const data = process.env.ASYNCAT_DATA_PATH;
  // A stand-in SSH agent (a socket path must be short, so not in the home).
  const agentSocket = path.join(scratch, 'agent.sock');
  const agent = net.createServer((socket) => socket.end('SIGNED')).listen(agentSocket);
  const savedAgent = process.env.SSH_AUTH_SOCK;
  try {
    fs.mkdirSync(path.join(home, '.ssh'), { recursive: true });
    fs.writeFileSync(path.join(home, '.ssh', 'id_test'), 'PRIVATE-KEY-DEMO');
    fs.writeFileSync(path.join(home, '.netrc'), 'machine example.test password demo');
    fs.writeFileSync(path.join(home, '.npmrc'), '//registry.npmjs.org/:_authToken=npm_DEMO');
    for (const dir of ['.cargo/bin', '.cargo/registry', '.rustup/toolchains/stable/bin', '.dotnet', '.gradle/wrapper/dists', '.cache/node/corepack']) {
      fs.mkdirSync(path.join(home, dir), { recursive: true });
    }
    fs.mkdirSync(project, { recursive: true });
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'secret.key'), 'DATA-KEY-DEMO');
    await new Promise((resolve) => agent.once('listening', resolve));
    process.env.SSH_AUTH_SOCK = agentSocket;

    const script = [
      `cat '${home}/.ssh/id_test' 2>/dev/null; echo "ssh:$?"`,
      `cat '${home}/.netrc' | wc -c | tr -d ' '`,
      `cat '${home}/.npmrc'; echo "npmrc:done"`,
      `cat '${data}/secret.key' 2>/dev/null; echo "data:$?"`,
      `touch '${home}/.cargo/bin/evil' 2>/dev/null; echo "bin:$?"`,
      `touch '${home}/.cargo/registry/ok' && echo registry:ok`,
      // Programs that run outside the sandbox later.
      `touch '${home}/.rustup/toolchains/stable/bin/rustc' 2>/dev/null; echo "rustc:$?"`,
      `touch '${home}/.dotnet/dotnet' 2>/dev/null; echo "dotnet:$?"`,
      `touch '${home}/.gradle/wrapper/dists/gradle' 2>/dev/null; echo "gradle:$?"`,
      `touch '${home}/.cache/node/corepack/pnpm' 2>/dev/null; echo "corepack:$?"`,
      // A write into a hidden folder fails, rather than vanishing afterwards.
      `echo new > '${home}/.ssh/known_hosts'`,
      `[ -S '${agentSocket}' ]; echo "agent:$?"`,
      `cat /proc/${process.pid}/environ >/dev/null 2>&1; echo "den:$?"`,
      // D-Bus and systemd would let a command start programs outside.
      `[ -e '${process.env.XDG_RUNTIME_DIR || '/nonexistent'}/bus' ]; echo "bus:$?"`,
    ].join('; ');
    const plan = sandboxedCommand({ file: '/bin/sh', args: ['-c', script], workspaceRoot: project, home, platform: 'linux' });
    assert.equal(plan.sandboxed, true);
    const result = spawnSync(plan.file, plan.args, { cwd: project, encoding: 'utf8' });
    const out = result.stdout;
    assert.doesNotMatch(out, /PRIVATE-KEY-DEMO|DATA-KEY-DEMO|npm_DEMO/);
    assert.match(out, /ssh:1/);
    assert.match(out, /^0$/m, '.netrc reads as empty');
    assert.match(out, /^npmrc:done$/m, '.npmrc reads as empty');
    assert.match(out, /data:1/);
    assert.match(out, /bin:1/, '~/.cargo/bin must not be writable');
    assert.match(out, /registry:ok/);
    for (const program of ['rustc', 'dotnet', 'gradle', 'corepack']) assert.match(out, new RegExp(`${program}:1`), program);
    assert.match(result.stderr, /Read-only file system/, 'writing into ~/.ssh fails');
    assert.match(out, /agent:1/, 'the SSH agent goes with ~/.ssh');
    assert.match(out, /den:1/, "den's own process (and its environment) must not be visible");
    assert.match(out, /bus:1/, 'the session bus must not be reachable');
    assert.equal(fs.existsSync(path.join(home, '.cargo', 'bin', 'evil')), false);
    assert.equal(fs.existsSync(path.join(home, '.rustup', 'toolchains', 'stable', 'bin', 'rustc')), false);
    assert.equal(fs.readFileSync(path.join(home, '.ssh', 'id_test'), 'utf8'), 'PRIVATE-KEY-DEMO', 'the real folder is untouched');
  } finally {
    if (savedAgent === undefined) delete process.env.SSH_AUTH_SOCK; else process.env.SSH_AUTH_SOCK = savedAgent;
    agent.close();
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(path.join(data, 'secret.key'), { force: true });
  }
});
