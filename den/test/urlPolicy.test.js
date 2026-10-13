import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { agentFetch, checkAgentUrl, classifyAddress } from '../src/agent/tools/urlPolicy.js';

// Web tools run without asking, so where they may go is limited: no local
// files, no Asyncat servers, no link-local metadata addresses, and redirects
// are checked hop by hop.

test('only http and https addresses can be opened', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'javascript:alert(1)', 'not a url']) {
    assert.equal((await checkAgentUrl(url)).ok, false, url);
  }
});

test("Asyncat's own ports and link-local addresses are refused", async () => {
  const env = { PORT: '8716' };
  for (const url of ['http://127.0.0.1:8716/api/agent/run', 'http://localhost:8717/', 'http://[::1]:8716/', 'http://169.254.169.254/latest/meta-data/', 'http://0.0.0.0:8080/']) {
    assert.equal((await checkAgentUrl(url, { env })).ok, false, url);
  }
});

test('project dev servers and public sites stay reachable', async () => {
  assert.equal((await checkAgentUrl('http://localhost:3000/')).ok, true);
  assert.equal((await checkAgentUrl('http://127.0.0.1:5173/about')).kind, 'loopback');
  assert.equal((await checkAgentUrl('https://93.184.216.34/')).ok, true);
});

test('addresses are classified by range', () => {
  assert.equal(classifyAddress('10.1.2.3'), 'private');
  assert.equal(classifyAddress('192.168.1.1'), 'private');
  assert.equal(classifyAddress('::ffff:127.0.0.1'), 'loopback');
  assert.equal(classifyAddress('fe80::1'), 'link-local');
  assert.equal(classifyAddress('8.8.8.8'), 'public');
});

test('a redirect into a refused address is refused', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(302, { location: 'http://127.0.0.1:8716/api/ai/chats' });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await assert.rejects(agentFetch(`http://127.0.0.1:${port}/`), /belongs to Asyncat/);
  } finally {
    server.close();
  }
});

test('project site previews served by the backend stay reachable', async () => {
  const env = { PORT: '8716' };
  assert.equal((await checkAgentUrl('http://127.0.0.1:8716/api/files/site/project:abc/index.html', { env })).ok, true);
  assert.equal((await checkAgentUrl('http://127.0.0.1:8716/api/files/raw?path=x', { env })).ok, false);
});

test('sites the user blocked for agents are refused, subdomains too', async () => {
  const { setBlockedSites, getBlockedSites, siteBlocked } = await import('../src/privacy/blockedSites.js');
  assert.deepEqual(setBlockedSites(['https://Bank.example/login', 'bank.example', 'not a site', '*.mail.example']), ['bank.example', '*.mail.example']);
  assert.deepEqual(getBlockedSites(), ['bank.example', '*.mail.example']);
  for (const url of ['https://bank.example/', 'https://www.bank.example/account', 'https://inbox.mail.example/']) {
    const check = await checkAgentUrl(url);
    assert.equal(check.ok, false, url);
    assert.match(check.reason, /never to open/);
  }
  assert.equal(siteBlocked('https://notbank.example/'), false);
  setBlockedSites([]);
  assert.equal(siteBlocked('https://bank.example/'), false, 'an empty list blocks nothing');
});
