import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';

import { swapManagedDirectory } from '../src/lib/localEngine.js';
import {
  VENV_MARKER_FILE,
  buildManagedVenv,
  relocateVenv,
  rewriteLauncherShebang,
} from '../src/lib/pythonEnv.js';

function withHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-venv-'));
  const previous = process.env.ASYNCAT_HOME;
  process.env.ASYNCAT_HOME = home;
  return {
    home,
    cleanup() {
      if (previous === undefined) delete process.env.ASYNCAT_HOME;
      else process.env.ASYNCAT_HOME = previous;
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

const python3 = (() => {
  if (process.platform === 'win32') return null;
  try {
    execFileSync('python3', ['-c', 'import venv'], { stdio: 'ignore' });
    return 'python3';
  } catch {
    return null;
  }
})();

test('a Windows pip launcher gets its python path rewritten, its script intact', async () => {
  const zip = new JSZip();
  zip.file('__main__.py', 'import sys\nfrom piper.__main__ import main\nsys.exit(main())\n');
  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  const launcher = Buffer.concat([
    Buffer.from('MZ fake launcher program bytes \x00\x01\x02'),
    Buffer.from('#!"C:\\Users\\u\\AppData\\Local\\Asyncat\\piper\\python.install-1234abcd\\Scripts\\python.exe"\r\n'),
    archive,
  ]);
  const from = 'C:\\Users\\u\\AppData\\Local\\Asyncat\\piper\\python.install-1234abcd';
  const to = 'C:\\Users\\u\\AppData\\Local\\Asyncat\\piper\\python';
  const out = rewriteLauncherShebang(launcher, from, to);
  assert.ok(out.includes(Buffer.from('#!"C:\\Users\\u\\AppData\\Local\\Asyncat\\piper\\python\\Scripts\\python.exe"\r\n')));
  assert.ok(out.subarray(out.length - archive.length).equals(archive), 'the embedded script is unchanged');
  assert.equal(rewriteLauncherShebang(launcher, 'C:\\elsewhere', to), null);
  assert.equal(rewriteLauncherShebang(Buffer.from('not a launcher'), from, to), null);
});

test('a venv is relocated from its build folder to its final folder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-relocate-'));
  try {
    const staging = path.join(dir, 'python.install-1234abcd');
    const finalDir = path.join(dir, 'python');
    const bin = path.join(staging, process.platform === 'win32' ? 'Scripts' : 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(staging, 'pyvenv.cfg'), `home = /usr/bin\ncommand = /usr/bin/python3 -m venv ${staging}\n`);
    fs.writeFileSync(path.join(bin, 'piper'), `#!${staging}/bin/python\nimport sys\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'activate'), `VIRTUAL_ENV="${staging}"\nexport VIRTUAL_ENV\n`);
    fs.writeFileSync(path.join(bin, 'binary-tool'), Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(staging)]));
    if (process.platform !== 'win32') fs.symlinkSync('/usr/bin/python3', path.join(bin, 'python'));

    const changed = await relocateVenv(staging, staging, finalDir);
    assert.equal(changed.length, 3);
    assert.match(fs.readFileSync(path.join(bin, 'piper'), 'utf8'), new RegExp(`^#!${finalDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/bin/python`));
    assert.equal(fs.statSync(path.join(bin, 'piper')).mode & 0o111, process.platform === 'win32' ? fs.statSync(path.join(bin, 'piper')).mode & 0o111 : 0o111);
    assert.ok(fs.readFileSync(path.join(bin, 'activate'), 'utf8').includes(`VIRTUAL_ENV="${finalDir}"`));
    assert.ok(fs.readFileSync(path.join(staging, 'pyvenv.cfg'), 'utf8').includes(`-m venv ${finalDir}`));
    assert.ok(fs.readFileSync(path.join(bin, 'binary-tool')).includes(Buffer.from(staging)), 'binary files are left alone');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed or cancelled rebuild leaves the working environment as it was', async () => {
  const t = withHome();
  try {
    const finalDir = path.join(t.home, 'piper', 'python');
    fs.mkdirSync(finalDir, { recursive: true });
    fs.writeFileSync(path.join(finalDir, 'pyvenv.cfg'), 'working');

    await assert.rejects(buildManagedVenv({
      finalDir,
      swap: swapManagedDirectory,
      build: async (staging) => {
        fs.mkdirSync(staging, { recursive: true });
        fs.writeFileSync(path.join(staging, 'pyvenv.cfg'), 'half');
        throw new Error('pip exited with code 1');
      },
    }), /pip exited/);
    assert.equal(fs.readFileSync(path.join(finalDir, 'pyvenv.cfg'), 'utf8'), 'working');

    const controller = new AbortController();
    await assert.rejects(buildManagedVenv({
      finalDir,
      signal: controller.signal,
      swap: swapManagedDirectory,
      build: async (staging) => {
        fs.mkdirSync(staging, { recursive: true });
        controller.abort();
      },
    }), (error) => error.cancelled === true);
    assert.equal(fs.readFileSync(path.join(finalDir, 'pyvenv.cfg'), 'utf8'), 'working');
    assert.deepEqual(fs.readdirSync(path.dirname(finalDir)), ['python'], 'no build folder is left behind');
  } finally {
    t.cleanup();
  }
});

test('a real venv built aside works from its final folder, scripts included', { skip: !python3 && 'needs python3 with venv' }, async () => {
  const t = withHome();
  try {
    const finalDir = path.join(t.home, 'piper', 'python');
    fs.mkdirSync(finalDir, { recursive: true });
    fs.writeFileSync(path.join(finalDir, 'old'), 'the previous environment');
    let stopped = false;
    const result = await buildManagedVenv({
      finalDir,
      swap: swapManagedDirectory,
      beforeSwap: async () => { stopped = true; },
      build: async (staging) => {
        execFileSync(python3, ['-m', 'venv', '--without-pip', staging]);
        // A console script the way pip writes one.
        fs.writeFileSync(path.join(staging, 'bin', 'hello'), `#!${staging}/bin/python\nimport sys\nprint(sys.prefix)\n`, { mode: 0o755 });
        return 'built';
      },
    });
    assert.equal(result, 'built');
    assert.equal(stopped, true);
    assert.equal(fs.existsSync(path.join(finalDir, 'old')), false);
    assert.ok(fs.existsSync(path.join(finalDir, VENV_MARKER_FILE)));
    const prefix = execFileSync(path.join(finalDir, 'bin', 'hello'), { encoding: 'utf8' }).trim();
    assert.equal(fs.realpathSync(prefix), fs.realpathSync(finalDir));
    assert.deepEqual(fs.readdirSync(path.dirname(finalDir)), ['python']);
  } finally {
    t.cleanup();
  }
});
