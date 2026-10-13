import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAddress, projectPreviewUrl, stripTabs, samplePoints, rectsIntersect, connectionKind } from './browserPanel.js';

test('the address bar opens URLs, domains, localhost and searches', () => {
  assert.equal(resolveAddress('https://example.com/a').url, 'https://example.com/a');
  assert.equal(resolveAddress('example.com/docs?q=1').url, 'https://example.com/docs?q=1');
  assert.equal(resolveAddress('sub.example.co.uk').url, 'https://sub.example.co.uk');
  assert.equal(resolveAddress('localhost:5173').url, 'http://localhost:5173');
  assert.equal(resolveAddress('127.0.0.1:3000/x').url, 'http://127.0.0.1:3000/x');
  assert.equal(resolveAddress('how do refs work', { searchEngine: 'duckduckgo' }).url, 'https://duckduckgo.com/?q=how%20do%20refs%20work');
  assert.ok(resolveAddress('data:text/html;base64,PGI+').url.startsWith('data:text/html'));
  assert.ok(resolveAddress('   ').error);
});

test('project files open through the site preview, and only inside the project', () => {
  const context = { rootId: 'project:abc', rootPath: '/home/me/site' };
  const api = 'http://127.0.0.1:8716/api/files/site';
  assert.deepEqual(projectPreviewUrl('file:///home/me/site/docs/index.html#top', context, api), {
    url: `${api}/project%3Aabc/docs/index.html#top`,
    sourceUrl: 'file:///home/me/site/docs/index.html#top',
  });
  assert.match(projectPreviewUrl('file:///etc/passwd', context, api).error, /outside/);
  assert.match(projectPreviewUrl('file:///home/me/site/a.html', null, api).error, /Project/);
  assert.match(resolveAddress('file:///etc/passwd', { workingContext: context, fileSiteApi: api }).error, /outside/);
});

test('the strip shows the current mode, Asyncat tabs and pop-ups', () => {
  const state = {
    mode: 'incognito',
    tabs: [
      { id: 'a', profile: 'incognito' },
      { id: 'b', profile: 'standard' },
      { id: 'c', profile: 'standard', agent: true },
      { id: 'd', profile: 'standard', popup: true },
    ],
  };
  assert.deepEqual(stripTabs(state).map((t) => t.id), ['a', 'c', 'd']);
  assert.deepEqual(stripTabs({ ...state, mode: 'standard' }).map((t) => t.id), ['b', 'c', 'd']);
  assert.deepEqual(stripTabs(null), []);
});

test('cover checks sample the page area and detect overlap', () => {
  const rect = { left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 };
  const points = samplePoints(rect, 5);
  assert.equal(points.length, 9);
  assert.deepEqual(points[0], { x: 5, y: 5 });
  assert.deepEqual(points[8], { x: 95, y: 45 });
  assert.deepEqual(samplePoints({ left: 0, top: 0, right: 4, bottom: 4, width: 4, height: 4 }, 5), []);
  assert.equal(rectsIntersect(rect, { left: 90, top: 40, right: 120, bottom: 60 }), true);
  assert.equal(rectsIntersect(rect, { left: 100, top: 0, right: 120, bottom: 60 }), false);
});

test('connection badges', () => {
  assert.equal(connectionKind('https://a.example'), 'secure');
  assert.equal(connectionKind('http://a.example'), 'insecure');
  assert.equal(connectionKind('http://localhost:3000'), 'local');
  assert.equal(connectionKind(''), 'none');
});
