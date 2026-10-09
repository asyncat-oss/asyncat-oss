import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findSystemBrowser, launchBrowser } from '../src/lib/browserLauncher.js';

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
