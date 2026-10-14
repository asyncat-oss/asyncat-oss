// app_open runs nothing in the command sandbox, so it must not become a way
// to run the project's code outside it: no shells, interpreters or
// terminals as the app, on Linux only installed desktop apps, and no file
// that runs when opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { appOpenRefusal, appOpenTool, desktopAppIndex, parseDesktopEntry } from '../src/agent/tools/desktopTools.js';

// An installed desktop app for every name, so only the other checks decide.
const anyApp = { onPath: () => true, findDesktopApp: () => ({ id: 'app', terminal: false }), realProgram: () => null };

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-app-open-'));
  fs.writeFileSync(path.join(dir, 'steal.sh'), '#!/bin/sh\ncat ~/.ssh/id_ed25519\n');
  fs.writeFileSync(path.join(dir, 'tool'), '#!/bin/sh\necho hi\n', { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'Launch.desktop'), '[Desktop Entry]\nExec=sh steal.sh\n');
  fs.mkdirSync(path.join(dir, 'Evil.app'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>hi</h1>');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'notes');
  return dir;
}

test('shells, interpreters and terminals are not apps app_open starts', () => {
  for (const app of ['sh', 'bash', 'zsh', 'python3', 'python3.12', '/usr/bin/python3', 'node', 'perl', 'env', 'kitty', 'Terminal',
    'Terminal.app', 'gnome-terminal', 'xdg-open', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'cmd.exe', 'wscript',
    'm4', 'guile', 'guile3.0', 'uvx', 'gnuplot', 'dc', 'escript', 'racket', 'octave', 'lua5.4', 'tclsh8.6']) {
    for (const platform of ['linux', 'darwin', 'win32']) {
      assert.match(appOpenRefusal({ app, file: 'notes.txt', workingDir: '/nowhere', platform, ...anyApp }) || '', /doesn't start/, `${app} on ${platform}`);
    }
  }
  assert.match(appOpenRefusal({ app: 'm4', workingDir: '/nowhere', platform: 'linux', ...anyApp }), /doesn't start m4,/, 'named as given');
  // By the program that really starts, too: "js" may be a link to node.
  assert.match(appOpenRefusal({ app: 'js', workingDir: '/nowhere', platform: 'linux', ...anyApp, realProgram: () => '/usr/bin/node' }) || '', /doesn't start node/);
});

test('on Linux, a program started by name must be an installed desktop app', () => {
  const linux = (app, findDesktopApp, onPath = () => true) => appOpenRefusal({ app, file: 'notes.txt', workingDir: '/nowhere', platform: 'linux', onPath, findDesktopApp, realProgram: () => null });
  assert.match(linux('frobnicate', () => null) || '', /isn't one \(it has no \.desktop entry\)/, 'a command-line program');
  assert.match(linux('htop', () => ({ id: 'htop', terminal: true })) || '', /terminal program/);
  assert.equal(linux('gedit', (name) => (name === 'gedit' ? { id: 'org.gnome.gedit', terminal: false } : null)), null);
  assert.equal(linux('Figma', () => null, () => false), null, 'not on PATH: xdg-open opens the file with its default app');
  // Found by the program a link on PATH leads to (code → code-oss).
  const viaLink = appOpenRefusal({
    app: 'code', workingDir: '/nowhere', platform: 'linux', onPath: () => true, realProgram: () => '/usr/bin/code-oss',
    findDesktopApp: (name) => (name === 'code-oss' ? { id: 'code-oss', terminal: false } : null),
  });
  assert.equal(viaLink, null);
  assert.equal(appOpenRefusal({ app: 'frobnicate', workingDir: '/nowhere', platform: 'darwin', ...anyApp, findDesktopApp: () => null }), null, 'macOS opens only app bundles');
});

test('desktop entries: an app by its entry, its program and its name, never an interpreter it starts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-desktop-entries-'));
  const entry = (name, lines) => fs.writeFileSync(path.join(dir, name), ['[Desktop Entry]', 'Type=Application', ...lines, ''].join('\n'));
  try {
    entry('org.gnome.gedit.desktop', ['Name=Text Editor', 'Exec=gedit %U']);
    entry('code-oss.desktop', ['Name=Code - OSS', 'Exec=/usr/bin/code-oss --new-window %F']);
    entry('myapp.desktop', ['Name=My App', 'Exec=env GDK_BACKEND=x11 /opt/myapp/bin/myapp --flag %u']);
    entry('tool.desktop', ['Name=Tool', 'Exec=python3 /opt/tool/main.py %F']);
    entry('top.desktop', ['Name=Top', 'Exec=kitty -e htop']);
    entry('vim.desktop', ['Name=Vim', 'Exec=vim %F', 'Terminal=true']);
    entry('gone.desktop', ['Name=Gone', 'Exec=gone', 'Hidden=true']);
    fs.writeFileSync(path.join(dir, 'actions.desktop'), '[Desktop Entry]\nType=Application\nName=Viewer\nExec=viewer %f\n[Desktop Action shell]\nExec=sh -c x\n');
    const index = desktopAppIndex([dir]);
    for (const name of ['gedit', 'org.gnome.gedit', 'text editor', 'code-oss', 'myapp', 'my app', 'tool', 'top', 'viewer']) assert.ok(index.get(name), name);
    for (const name of ['python3', 'kitty', 'sh', 'gone', 'env']) assert.equal(index.get(name), undefined, name);
    assert.equal(index.get('vim').terminal, true);
    assert.deepEqual(parseDesktopEntry('[Desktop Action x]\nExec=a\n[Desktop Entry]\nExec=b\nExec=c\n'), { Exec: 'b' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("files that run when opened aren't opened", () => {
  const dir = project();
  try {
    const refused = (args) => appOpenRefusal({ workingDir: dir, platform: 'linux', ...anyApp, ...args });
    assert.match(refused({ app: 'gedit', file: 'steal.sh' }) || '', /would run it/);
    assert.match(refused({ app: 'firefox', file: path.join(dir, 'Launch.desktop') }) || '', /would run it/);
    assert.match(refused({ app: 'firefox', file: pathToFileURL(path.join(dir, 'steal.sh')).href }) || '', /would run it/, 'a file: URL');
    assert.match(refused({ app: path.join(dir, 'tool') }) || '', /would run it/, 'a program file as the app');
    assert.match(refused({ app: path.join(dir, 'Evil.app') }) || '', /would run it/, 'an app bundle in the project');
    assert.match(refused({ app: 'code', file: 'tool' }) || '', /would run it/, 'a file a program could be started from');

    assert.equal(refused({ app: 'firefox', file: 'index.html' }), null);
    assert.equal(refused({ app: 'code', file: dir }), null, 'a folder');
    assert.equal(refused({ app: 'gedit', file: 'notes.txt' }), null);
    assert.equal(refused({ app: 'https://example.com/page' }), null, 'a web address');
    assert.equal(refused({ app: 'firefox', file: 'missing.html' }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('app_open refuses before starting anything', async () => {
  const dir = project();
  try {
    const res = await appOpenTool.execute({ app: 'sh', file: 'steal.sh' }, { workingDir: dir });
    assert.equal(res.success, false);
    assert.match(res.error, /run_command/);
    const script = await appOpenTool.execute({ app: path.join(dir, 'steal.sh') }, { workingDir: dir });
    assert.equal(script.success, false);
    // m4 runs the shell commands in a plain text file (syscmd).
    const m4 = await appOpenTool.execute({ app: 'm4', file: 'notes.txt' }, { workingDir: dir });
    assert.equal(m4.success, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
