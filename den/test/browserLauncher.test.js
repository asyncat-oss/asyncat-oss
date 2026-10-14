import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { chooseBrowser, findSystemBrowser, launchBrowser } from '../src/lib/browserLauncher.js';
import { sandboxCanChange } from '../src/agent/sandboxFolders.js';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-browser-launcher-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function fakeExecutable(...parts) {
  const file = path.join(scratch, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  fs.chmodSync(file, 0o755);
  return file;
}

test('finds a Chromium-family browser on PATH on Linux', () => {
  const bin = path.join(scratch, 'linux-bin');
  const chromium = fakeExecutable('linux-bin', 'chromium');
  assert.equal(findSystemBrowser({ platform: 'linux', env: { PATH: bin } }), chromium);
  assert.equal(findSystemBrowser({ platform: 'linux', env: { PATH: path.join(scratch, 'empty') } }), null);
});

test('finds Brave when it is the only Chromium-family browser', () => {
  const bin = path.join(scratch, 'brave-bin');
  const brave = fakeExecutable('brave-bin', 'brave');
  assert.equal(findSystemBrowser({ platform: 'linux', env: { PATH: bin } }), brave);
});

test('finds Chrome in the user Applications folder on macOS', () => {
  const home = path.join(scratch, 'mac-home');
  const chrome = fakeExecutable('mac-home', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');
  assert.equal(findSystemBrowser({ platform: 'darwin', env: {}, home }), chrome);
});

test('finds Edge under Program Files on Windows', { skip: process.platform === 'win32' ? false : 'path.win32 joins only' }, () => {
  const programFiles = path.join(scratch, 'pf');
  fakeExecutable('pf', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  const found = findSystemBrowser({ platform: 'win32', env: { 'PROGRAMFILES(X86)': programFiles } });
  assert.match(found, /msedge\.exe$/);
});

// The browser runs outside the command sandbox, so a sandboxed command must
// not be able to choose it: ~/.cache (where puppeteer keeps its own) and the
// temporary folders are writable in the sandbox.
test('a program in a folder sandboxed commands can write to is one they could have put there', () => {
  const home = path.join(scratch, 'home');
  const own = fakeExecutable('home', '.cache', 'puppeteer', 'chrome', 'linux-1', 'chrome-linux64', 'chrome');
  assert.equal(sandboxCanChange(own, { home }), true, "puppeteer's own browser in ~/.cache");
  assert.equal(sandboxCanChange(path.join(scratch, 'anything'), { home }), true, 'a temporary folder');
  assert.equal(sandboxCanChange('/usr/bin/env', { home }), false);

  // Folders kept read-only inside ~/.cache, unless a link leads there.
  const corepack = fakeExecutable('home', '.cache', 'node', 'corepack', 'pnpm', 'pnpm.js');
  assert.equal(sandboxCanChange(corepack, { home }), false, "corepack's folder is read-only");
  const linkedHome = path.join(scratch, 'linked-home');
  fs.mkdirSync(path.join(linkedHome, '.cache'), { recursive: true });
  fs.symlinkSync(path.join(home, '.cache', 'node'), path.join(linkedHome, '.cache', 'node'));
  assert.equal(sandboxCanChange(path.join(linkedHome, '.cache', 'node', 'corepack', 'pnpm', 'pnpm.js'), { home: linkedHome }), true, 'a command could replace the link');
});

test("puppeteer's own browser is passed over where a sandboxed command could have put it", () => {
  const own = fakeExecutable('choose', 'own-chrome');
  const system = fakeExecutable('choose', 'system-chrome');
  const findSystem = ({ usable }) => [system].find(usable) || null;
  assert.equal(chooseBrowser({ own, canChange: () => false, findSystem }), own, 'its own, where commands can\'t write');
  assert.equal(chooseBrowser({ own, canChange: (file) => file === own, findSystem }), system, 'an installed browser instead');
  assert.equal(chooseBrowser({ own: null, canChange: () => false, findSystem }), system, 'none of its own');
  assert.throws(() => chooseBrowser({ own, canChange: () => true, findSystem }), /can change, so it isn't started/);
  assert.throws(() => chooseBrowser({ own: null, canChange: () => false, findSystem: () => null }), /No Chromium-based browser found/);
});

test('the browser gets no saved keys, unless the caller gives its environment', async () => {
  const launched = [];
  const puppeteer = { launch: async (options) => { launched.push(options); return {}; }, executablePath: async () => null };
  const saved = process.env.ASYNCAT_TEST_API_KEY;
  process.env.ASYNCAT_TEST_API_KEY = 'sk-demo';
  try {
    await launchBrowser({ headless: true, executablePath: '/opt/chrome' }, { puppeteer });
    assert.equal(launched[0].env.ASYNCAT_TEST_API_KEY, undefined);
    assert.equal(launched[0].env.PATH, process.env.PATH);
    await launchBrowser({ headless: true, executablePath: '/opt/chrome', env: { ONLY: '1' } }, { puppeteer });
    assert.deepEqual(launched[1].env, { ONLY: '1' });
  } finally {
    if (saved === undefined) delete process.env.ASYNCAT_TEST_API_KEY; else process.env.ASYNCAT_TEST_API_KEY = saved;
  }
});

const canLaunch = Boolean(findSystemBrowser()) || Boolean(process.env.PUPPETEER_EXECUTABLE_PATH);

test('launches a browser and renders a page', { skip: canLaunch ? false : 'no local Chromium-based browser' }, async () => {
  const browser = await launchBrowser({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<h1 id="t">asyncat</h1>');
    assert.equal(await page.$eval('#t', (el) => el.textContent), 'asyncat');
    const pdf = await page.pdf({ format: 'A4' });
    assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), '%PDF');
  } finally {
    await browser.close();
  }
});
