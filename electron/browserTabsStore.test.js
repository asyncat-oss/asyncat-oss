import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  MAX_SAVED_TABS, parseSavedTabs, readSavedTabsFile, savableTabs, serializeTabs, writeSavedTabsFile,
} from './browserTabsStore.js';
import { isAllowedBrowserUrl } from './browserPolicy.js';

const tab = (id, url, extra = {}) => ({ id, url, title: `Title ${id}`, profile: 'standard', ...extra });
const ports = { frontendPort: 8717, backendPort: 8716 };
const allowed = (url) => isAllowedBrowserUrl(url, { ports, allowBlank: false });

test('only the user\'s own Standard tabs are saved', () => {
  const tabs = [
    tab('tab-1', 'https://example.com/a'),
    tab('tab-2', 'https://example.com/private', { profile: 'incognito' }),
    tab('tab-3', 'https://example.com/agent', { agent: true }),
    tab('tab-4', 'https://example.com/hidden', { hidden: true }),
    tab('tab-5', 'https://example.com/popup', { popup: {} }),
    tab('tab-6', 'data:text/html,<p>hi</p>'),
    tab('tab-7', ''),
    tab('tab-8', 'https://example.org/b'),
  ];
  assert.deepEqual(savableTabs(tabs).map((t) => t.id), ['tab-1', 'tab-8']);
  const data = serializeTabs(tabs, 'tab-1');
  assert.equal(data.version, 1);
  assert.equal(data.activeIndex, 0);
  assert.deepEqual(data.tabs, [
    { url: 'https://example.com/a', title: 'Title tab-1' },
    { url: 'https://example.org/b', title: 'Title tab-8' },
  ]);
});

test('an active tab that isn\'t saved falls back to the last one', () => {
  const data = serializeTabs([tab('a', 'https://a.example'), tab('b', 'https://b.example')], 'gone');
  assert.equal(data.activeIndex, 1);
  assert.equal(serializeTabs([], null).activeIndex, -1);
});

test('reopening skips addresses the browser policy refuses', () => {
  const data = {
    version: 1,
    activeIndex: 2,
    tabs: [
      { url: 'http://127.0.0.1:8716/api/settings', title: "Asyncat's own backend" },
      { url: 'https://news.example/today', title: 'News' },
      { url: 'https://docs.example/guide', title: 'Guide' },
      { url: 'file:///etc/passwd', title: 'File' },
      { url: 'javascript:alert(1)', title: 'Script' },
      { url: 42 },
    ],
  };
  const { tabs, activeIndex } = parseSavedTabs(data, allowed);
  assert.deepEqual(tabs.map((t) => t.url), ['https://news.example/today', 'https://docs.example/guide']);
  assert.equal(activeIndex, 1);
});

test('a damaged or foreign file reopens nothing', () => {
  assert.deepEqual(parseSavedTabs(null, allowed), { tabs: [], activeIndex: -1 });
  assert.deepEqual(parseSavedTabs({ version: 99, tabs: [{ url: 'https://a.example' }] }, allowed), { tabs: [], activeIndex: -1 });
  assert.deepEqual(parseSavedTabs({ version: 1, tabs: 'nope' }, allowed), { tabs: [], activeIndex: -1 });
});

test('at most a fixed number of tabs is kept', () => {
  const many = Array.from({ length: MAX_SAVED_TABS + 10 }, (_, i) => tab(`t${i}`, `https://site${i}.example/`));
  assert.equal(serializeTabs(many, 't0').tabs.length, MAX_SAVED_TABS);
});

test('the file is written whole and read back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-tabs-'));
  try {
    const file = path.join(dir, 'nested', 'browser-tabs.json');
    const data = serializeTabs([tab('a', 'https://a.example/')], 'a');
    writeSavedTabsFile(file, data);
    assert.deepEqual(readSavedTabsFile(file), data);
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['browser-tabs.json']);
    fs.writeFileSync(file, '{ broken');
    assert.equal(readSavedTabsFile(file), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
