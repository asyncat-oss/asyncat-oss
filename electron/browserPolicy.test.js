import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentRequestBlockReason, classifyHost, isAllowedBrowserPartition, isAllowedBrowserUrl,
  parseKeyCombo, viewBoundsFromRect, windowOpenDecision,
} from './browserPolicy.js';

const ports = { frontendPort: 8717, backendPort: 8716 };

test('tabs load http(s) pages but never Asyncat itself', () => {
  assert.equal(isAllowedBrowserUrl('https://example.com', { ports }), true);
  assert.equal(isAllowedBrowserUrl('http://localhost:5173/', { ports }), true);
  assert.equal(isAllowedBrowserUrl('http://localhost:8717/', { ports }), false);
  assert.equal(isAllowedBrowserUrl('http://127.0.0.1:8716/api/agent/run', { ports }), false);
  assert.equal(isAllowedBrowserUrl('http://127.0.0.1:8716/api/files/site/project%3Aa/index.html', { ports }), true);
  assert.equal(isAllowedBrowserUrl('file:///etc/passwd', { ports }), false);
  assert.equal(isAllowedBrowserUrl('javascript:alert(1)', { ports }), false);
  assert.equal(isAllowedBrowserUrl('about:blank', { ports }), true);
  assert.equal(isAllowedBrowserUrl('about:blank', { ports, allowBlank: false }), false);
  assert.equal(isAllowedBrowserUrl('data:text/html;base64,PGI+', { ports }), false);
  assert.equal(isAllowedBrowserUrl('data:text/html;base64,PGI+', { ports, allowHtmlData: true }), true);
});

test('only the browser partitions may be used', () => {
  assert.equal(isAllowedBrowserPartition('persist:asyncat-web'), true);
  assert.equal(isAllowedBrowserPartition('asyncat-web-incognito-1234abcd-0000'), true);
  assert.equal(isAllowedBrowserPartition('persist:main'), false);
  assert.equal(isAllowedBrowserPartition(''), false);
});

test('agent tabs also refuse link-local addresses and Asyncat ports', () => {
  assert.equal(classifyHost('169.254.169.254'), 'link-local');
  assert.equal(classifyHost('[fe80::1]'), 'link-local');
  assert.equal(classifyHost('10.0.0.2'), 'private');
  assert.equal(classifyHost('example.com'), 'name');
  assert.match(agentRequestBlockReason('http://169.254.169.254/latest/meta-data', { ports }), /link-local/);
  assert.match(agentRequestBlockReason('http://127.0.0.1:8765/v1/models', { ports, extraPorts: [8765] }), /belongs to Asyncat/);
  assert.equal(agentRequestBlockReason('http://127.0.0.1:8716/api/files/site/x/index.html', { ports }), null);
  assert.equal(agentRequestBlockReason('http://localhost:3000/', { ports, extraPorts: [8765] }), null);
  assert.equal(agentRequestBlockReason('https://example.com/', { ports }), null);
});

test('window.open with features is a pop-up; links and plain opens are tabs', () => {
  assert.equal(windowOpenDecision({ url: 'https://accounts.example.com/o/oauth2', disposition: 'new-window', ports }), 'popup');
  assert.equal(windowOpenDecision({ url: 'about:blank', disposition: 'new-window', ports }), 'popup');
  assert.equal(windowOpenDecision({ url: 'about:blank', disposition: 'foreground-tab', ports }), 'tab');
  assert.equal(windowOpenDecision({ url: 'https://example.com', disposition: 'foreground-tab', ports }), 'tab');
  assert.equal(windowOpenDecision({ url: 'https://example.com', disposition: 'foreground-tab', openLinks: 'system', ports }), 'external');
  assert.equal(windowOpenDecision({ url: 'https://example.com', disposition: 'new-window', openLinks: 'system', ports }), 'popup');
  assert.equal(windowOpenDecision({ url: 'file:///etc/passwd', disposition: 'new-window', ports }), 'deny');
  assert.equal(windowOpenDecision({ url: 'http://localhost:8717/', disposition: 'foreground-tab', ports }), 'deny');
});

test('panel rectangles become whole-pixel view bounds', () => {
  assert.deepEqual(viewBoundsFromRect({ x: 10.4, y: 20.6, width: 300.2, height: 200 }, 1), { x: 10, y: 21, width: 300, height: 200 });
  assert.deepEqual(viewBoundsFromRect({ x: 10, y: 20, width: 300, height: 200 }, 1.25), { x: 13, y: 25, width: 375, height: 250 });
  assert.equal(viewBoundsFromRect({ x: 0, y: 0, width: 1, height: 100 }), null);
  assert.equal(viewBoundsFromRect(null), null);
});

test('key names and combos map to keyboard events', () => {
  assert.deepEqual(parseKeyCombo('Enter', { platform: 'linux' }), { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r', modifiers: 0 });
  assert.deepEqual(parseKeyCombo('Shift+Tab', { platform: 'linux' }), { key: 'Tab', code: 'Tab', keyCode: 9, modifiers: 8 });
  const selectAll = parseKeyCombo('Control+a', { platform: 'linux' });
  assert.equal(selectAll.modifiers, 2);
  assert.equal(selectAll.text, undefined);
  assert.deepEqual(parseKeyCombo('Meta+A', { platform: 'darwin' }).commands, ['selectAll']);
  assert.equal(parseKeyCombo('a', { platform: 'linux' }).text, 'a');
  assert.equal(parseKeyCombo('Shift+a', { platform: 'linux' }).text, 'A');
  assert.equal(parseKeyCombo('ArrowDown', { platform: 'linux' }).keyCode, 40);
  assert.equal(parseKeyCombo('NotAKey', { platform: 'linux' }), null);
  assert.equal(parseKeyCombo('', { platform: 'linux' }), null);
});
