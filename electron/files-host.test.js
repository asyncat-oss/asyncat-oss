import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { looksRunnable, openFile, openTarget, revealFile, trashFile, trashTarget } from './files-host.js';

const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-files-host-')));
const home = path.join(scratch, 'home');
const data = path.join(home, '.config', 'Asyncat');
const artifacts = path.join(home, 'Balcony garden', '.asyncat', 'artifacts');
fs.mkdirSync(data, { recursive: true });
fs.mkdirSync(artifacts, { recursive: true });

const at = (name) => path.join(artifacts, name);
fs.writeFileSync(at('plan.md'), '# Balcony garden\n\nBasil by the window.\n');
fs.writeFileSync(at('report.pdf'), '%PDF-1.7\n%fake\n');
fs.writeFileSync(at('prices.csv'), 'plant,price\nbasil,3\n');
fs.writeFileSync(at('page.html'), '<!doctype html><p>hi</p>');
fs.writeFileSync(at('drawing.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
fs.writeFileSync(at('run.sh'), '#!/bin/sh\necho hi\n', { mode: 0o755 });
fs.writeFileSync(at('script.txt'), '#!/bin/sh\necho hi\n');
fs.writeFileSync(at('program.pdf'), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]));
fs.writeFileSync(at('setup.pdf'), Buffer.from('MZ\x90\x00', 'latin1'));
fs.writeFileSync(at('launcher.txt'), '[Desktop Entry]\nExec=sh -c "echo hi"\n');
fs.writeFileSync(at('page.md'), '﻿  <!DOCTYPE html>\n<html><script>alert(1)</script></html>');
fs.writeFileSync(at('drawing.json'), '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>');
fs.writeFileSync(at('note.md'), '<!-- a comment -->\nJust words.\n');
fs.symlinkSync(at('report.pdf'), at('linked.pdf'));
fs.symlinkSync('/etc/hosts', at('hosts.txt'));
fs.mkdirSync(at('Results'));
fs.mkdirSync(at('Tool.app'));

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

function shell() {
  const calls = [];
  return {
    calls,
    showItemInFolder: (file) => calls.push(['reveal', file]),
    openPath: async (file) => { calls.push(['open', file]); return ''; },
    trashItem: async (file) => { calls.push(['trash', file]); },
  };
}

test('what a file starts with: programs, scripts, launchers, pages and drawings run', () => {
  assert.equal(looksRunnable(Buffer.from('#!/usr/bin/env node\n')), true);
  assert.equal(looksRunnable(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), true);
  assert.equal(looksRunnable(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])), true);
  assert.equal(looksRunnable(Buffer.from('MZ')), true);
  assert.equal(looksRunnable(Buffer.from('[Desktop Entry]\n')), true);
  assert.equal(looksRunnable(Buffer.from('  <HTML><body>')), true);
  assert.equal(looksRunnable(Buffer.from('<svg/>')), true);
  assert.equal(looksRunnable(Buffer.from('%PDF-1.7')), false);
  assert.equal(looksRunnable(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false);
  assert.equal(looksRunnable(Buffer.from('PK\x03\x04', 'latin1')), false);
  assert.equal(looksRunnable(Buffer.from('<- a note about html and svg')), false);
  assert.equal(looksRunnable(Buffer.from('')), false);
});

test('Open takes documents, pictures and folders, by their real path', async () => {
  const fake = shell();
  for (const name of ['plan.md', 'report.pdf', 'prices.csv', 'note.md', 'Results']) {
    assert.deepEqual(await openFile(at(name), fake), { opened: true }, name);
  }
  assert.deepEqual(fake.calls.map(([, file]) => path.basename(file)), ['plan.md', 'report.pdf', 'prices.csv', 'note.md', 'Results']);
  assert.equal(openTarget(at('Tool.app'), { platform: 'linux' }), at('Tool.app'), 'elsewhere an .app is just a folder');
});

test('Open refuses pages, drawings, scripts, programs, links and what is not there', async () => {
  const fake = shell();
  const names = [
    'page.html', 'drawing.svg', 'run.sh', 'script.txt', 'program.pdf', 'setup.pdf', 'launcher.txt',
    'page.md', 'drawing.json', 'linked.pdf', 'hosts.txt',
  ];
  for (const name of names) {
    await assert.rejects(openFile(at(name), fake), /can't be opened in another app/, name);
  }
  await assert.rejects(openFile(at('missing.pdf'), fake), /not found/);
  await assert.rejects(openFile('plan.md', fake), /not a file Asyncat keeps/);
  await assert.rejects(openFile(`${at('plan.md')}\0`, fake), /not a file Asyncat keeps/);
  await assert.rejects(openFile(undefined, fake), /not a file Asyncat keeps/);
  assert.throws(() => openTarget(at('Tool.app'), { platform: 'darwin' }), /can't be opened/, 'a macOS app runs when opened');
  assert.deepEqual(fake.calls, []);
});

test('Open passes on what the system said when it could not open it', async () => {
  await assert.rejects(openFile(at('report.pdf'), { openPath: async () => 'No application is set up for PDF files.' }), /No application/);
});

test('Show in folder shows any file that is there, a link as itself', () => {
  const fake = shell();
  assert.deepEqual(revealFile(at('page.html'), fake), { shown: true });
  revealFile(at('hosts.txt'), fake);
  assert.deepEqual(fake.calls, [['reveal', at('page.html')], ['reveal', at('hosts.txt')]]);
  assert.throws(() => revealFile(at('missing.md'), fake), /not found/);
  assert.throws(() => revealFile('../plan.md', fake), /not a file Asyncat keeps/);
});

test('the Trash takes files, folders and links themselves', async () => {
  const fake = shell();
  for (const name of ['plan.md', 'Results', 'hosts.txt']) {
    assert.deepEqual(await trashFile(at(name), { ...fake, home, keep: [data] }), { trashed: true });
  }
  assert.deepEqual(fake.calls.map(([, file]) => file), [at('plan.md'), at('Results'), at('hosts.txt')]);
  assert.ok(fs.existsSync('/etc/hosts'));
});

test('the Trash never takes the home folder, the app data or a folder holding them', async () => {
  const fake = shell();
  for (const folder of [home, data, path.dirname(data), scratch, '/']) {
    await assert.rejects(trashFile(folder, { ...fake, home, keep: [data] }), /doesn't move that/, folder);
  }
  fs.symlinkSync(home, path.join(scratch, 'home-link'));
  assert.equal(trashTarget(path.join(scratch, 'home-link'), { home, keep: [data] }), path.join(scratch, 'home-link'), 'a link to it goes itself');
  await assert.rejects(trashFile(at('missing.md'), { ...fake, home }), /not found/);
  await assert.rejects(trashFile('relative/plan.md', { ...fake, home }), /not a file Asyncat keeps/);
  assert.deepEqual(fake.calls, []);
});

test('the Trash passes on its own failure', async () => {
  await assert.rejects(
    trashFile(at('prices.csv'), { home, trashItem: async () => { throw new Error('Trash is not available on this drive'); } }),
    /Trash is not available/,
  );
});
