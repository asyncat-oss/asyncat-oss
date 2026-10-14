// Network modes for sandboxed commands (sandboxNetwork.js). Everything here
// uses local fake servers and made-up host names: no real internet traffic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  bridgeScript, cleanRegistry, closeBridges, createRegistryProxy, ensureBridges, extraRegistries, hostAllowed, networkMode, networkPlan,
} from '../src/agent/sandboxNetwork.js';
import { probeLinuxSandbox, sandboxedCommand, sandboxHint, seatbeltProfile } from '../src/agent/commandSandbox.js';
import { hasBin } from '../src/agent/tools/shared.js';

const canIsolate = process.platform === 'linux' && probeLinuxSandbox().ok && probeLinuxSandbox().net && hasBin('socat') && hasBin('curl');
const noIsolation = !canIsolate && 'needs bwrap with --unshare-net, socat and curl';

// Names in tests resolve to this computer, without asking DNS.
function localLookup(host, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  if (options?.all) cb(null, [{ address: '127.0.0.1', family: 4 }]);
  else cb(null, '127.0.0.1', 4);
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function fakeServer(text) {
  return http.createServer((req, res) => res.end(`${text} ${req.url}`));
}

function fakeBridges(dir = '/tmp/asyncat-net-demo') {
  return {
    dir,
    proxy: { dir: `${dir}/proxy`, socket: `${dir}/proxy/proxy.sock`, port: 50001 },
    modelsDir: `${dir}/models`,
    models: () => [{ port: 8765, socket: `${dir}/models/port-8765.sock` }],
  };
}

test('the network setting is open unless set to registries or off', () => {
  assert.equal(networkMode(''), 'open');
  assert.equal(networkMode('OFF'), 'off');
  assert.equal(networkMode('registries'), 'registries');
  assert.equal(networkMode('everything'), 'open');
});

test('registries you add are host names, never local addresses', () => {
  assert.equal(cleanRegistry('https://npm.example.com/some/path'), 'npm.example.com');
  assert.equal(cleanRegistry('pkgs.example.com:8443'), 'pkgs.example.com:8443');
  for (const bad of ['localhost', 'localhost:8716', '127.0.0.1', 'app.localhost', 'not a host', '']) assert.equal(cleanRegistry(bad), null, bad);
  assert.deepEqual(extraRegistries('["pkgs.example.com", "127.0.0.1:8716", "pkgs.example.com"]'), ['pkgs.example.com']);
  assert.deepEqual(extraRegistries('a.example.com, b.example.com'), ['a.example.com', 'b.example.com']);
});

test('only listed hosts and their subdomains get through, on 443 and 80', () => {
  const list = ['registry.npmjs.org', 'pkgs.example.com:8443'];
  assert.equal(hostAllowed('registry.npmjs.org', 443, list), true);
  assert.equal(hostAllowed('REGISTRY.npmjs.org.', 80, list), true);
  assert.equal(hostAllowed('cdn.registry.npmjs.org', 443, list), true);
  assert.equal(hostAllowed('registry.npmjs.org', 22, list), false);
  assert.equal(hostAllowed('notregistry.npmjs.org', 443, list), false);
  assert.equal(hostAllowed('registry.npmjs.org.attacker.example', 443, list), false);
  assert.equal(hostAllowed('pkgs.example.com', 8443, list), true);
  assert.equal(hostAllowed('pkgs.example.com', 443, list), false);
});

test('the network plan per mode and platform', () => {
  const bridges = fakeBridges();
  const open = networkPlan({ mode: 'open', platform: 'linux', socat: true, bridges });
  assert.equal(open.effective, 'open');
  assert.deepEqual(open.bwrap, []);
  // Sockets started for another mode are out of sight (and out of reach).
  assert.deepEqual(open.mounts, ['--tmpfs', bridges.dir]);

  const off = networkPlan({ mode: 'off', platform: 'linux', socat: true, bridges });
  assert.deepEqual(off.bwrap, ['--unshare-net']);
  // Of the sockets, only the local model's are there: not the proxy's.
  assert.deepEqual(off.mounts, ['--tmpfs', bridges.dir, '--ro-bind', bridges.modelsDir, bridges.modelsDir]);
  assert.deepEqual(off.env, {});
  const [shell, argv] = off.wrap('npm', ['test']);
  assert.equal(shell, '/bin/sh');
  assert.match(argv[1], /TCP-LISTEN:8765,bind=127\.0\.0\.1/, 'the local model stays reachable');
  assert.doesNotMatch(argv[1], /3128/);
  assert.deepEqual(argv.slice(2), ['asyncat-net', 'npm', 'test']);

  const registries = networkPlan({ mode: 'registries', platform: 'linux', socat: true, bridges, exists: () => false });
  assert.equal(registries.effective, 'registries');
  assert.deepEqual(registries.mounts.slice(-6), ['--ro-bind', bridges.modelsDir, bridges.modelsDir, '--ro-bind', bridges.proxy.dir, bridges.proxy.dir]);
  assert.equal(registries.env.HTTPS_PROXY, 'http://127.0.0.1:3128');
  assert.match(registries.wrap('x', [])[1][1], /TCP-LISTEN:3128/);

  const noSocat = networkPlan({ mode: 'registries', platform: 'linux', socat: false, bridges });
  assert.equal(noSocat.effective, 'off', 'without socat, never open');
  assert.deepEqual(noSocat.bwrap, ['--unshare-net']);
  assert.match(noSocat.note, /socat isn't installed/);

  const macOff = networkPlan({ mode: 'off', platform: 'darwin', bridges });
  assert.ok(macOff.seatbelt.includes('(deny network*)'));
  assert.ok(macOff.seatbelt.includes('(allow network-outbound (remote ip "localhost:8765"))'));
  const macRegistries = networkPlan({ mode: 'registries', platform: 'darwin', bridges });
  assert.ok(macRegistries.seatbelt.includes('(allow network-outbound (remote ip "localhost:50001"))'));
  assert.equal(macRegistries.env.HTTP_PROXY, 'http://127.0.0.1:50001');
  const profile = seatbeltProfile({ roots: ['/Users/me/p'], hidden: [], network: macOff.seatbelt });
  assert.ok(profile.indexOf('(deny network*)') > profile.indexOf('(allow default)'));
});

test('the bridge script starts socat, waits for it, then runs the command', () => {
  const script = bridgeScript([{ port: 3128, socket: "/tmp/a b/proxy.sock" }]);
  assert.match(script, /UNIX-CONNECT:'\/tmp\/a b\/proxy\.sock'/);
  assert.match(script, /socat -u OPEN:\/dev\/null TCP:127\.0\.0\.1:3128/);
  assert.match(script, /"\$@"; status=\$\?/);
});

test('a network failure in a sandboxed command is explained', () => {
  const failed = { success: false, stderr: 'npm error code EAI_AGAIN' };
  assert.match(sandboxHint(failed, { effective: 'off' }), /has no network/);
  assert.match(sandboxHint(failed, { effective: 'registries' }), /only reach package registries/);
  assert.equal(sandboxHint(failed, { effective: 'open' }), null);
});

test('the registry proxy connects to listed hosts only', async () => {
  const allowedServer = fakeServer('allowed');
  const otherServer = fakeServer('other');
  const allowedPort = await listen(allowedServer);
  const otherPort = await listen(otherServer);
  const proxy = createRegistryProxy({ allowlist: () => [`registry.test:${allowedPort}`], lookup: localLookup });
  const proxyPort = await listen(proxy);
  const viaProxy = (url) => new Promise((resolve, reject) => {
    const target = new URL(url);
    http.get({ host: '127.0.0.1', port: proxyPort, path: url, headers: { host: target.host } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
  const tunnel = (target) => new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk;
      if (data.startsWith('HTTP/1.1 200') && data.includes('\r\n\r\n') && !data.includes('allowed /')) {
        socket.write('GET /through HTTP/1.1\r\nHost: registry.test\r\nConnection: close\r\n\r\n');
      }
    });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
  try {
    const ok = await viaProxy(`http://registry.test:${allowedPort}/pkg`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body, 'allowed /pkg');
    assert.equal((await viaProxy(`http://registry.test:${otherPort}/pkg`)).status, 403);
    const blocked = await viaProxy(`http://blocked.test:${allowedPort}/pkg`);
    assert.equal(blocked.status, 403);
    assert.match(blocked.body, /isn't one/);
    assert.equal((await viaProxy(`http://127.0.0.1:${otherPort}/`)).status, 403);

    assert.match(await tunnel(`registry.test:${allowedPort}`), /allowed \/through/);
    assert.match(await tunnel(`blocked.test:${allowedPort}`), /^HTTP\/1\.1 403/);
    assert.match(await tunnel(`127.0.0.1:${otherPort}`), /^HTTP\/1\.1 403/);
  } finally {
    proxy.close();
    allowedServer.close();
    otherServer.close();
  }
});

// Real runs: bwrap with an empty network, socat bridges, curl inside.
function runSandboxed(script, workspaceRoot) {
  const plan = sandboxedCommand({ file: '/bin/sh', args: ['-c', script], workspaceRoot });
  return new Promise((resolve) => {
    const child = spawn(plan.file, plan.args, { cwd: workspaceRoot, env: { ...process.env, ...(plan.env || {}) } });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('close', () => resolve({ out, plan }));
  });
}

test('with the network off or limited, commands reach only registries and the local model', { skip: noIsolation }, async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-net-test-'));
  const hostServer = fakeServer('host-only');
  const registry = fakeServer('registry');
  const model = fakeServer('model');
  const hostPort = await listen(hostServer);
  const registryPort = await listen(registry);
  const modelPort = await listen(model);
  const saved = { mode: process.env.ASYNCAT_SANDBOX_NETWORK, port: process.env.LLAMA_SERVER_PORT };
  process.env.LLAMA_SERVER_PORT = String(modelPort);
  closeBridges();
  ensureBridges({ allowlist: () => [`registry.test:${registryPort}`], lookup: localLookup });
  const curl = (url, extra = '') => `curl -s -m 5 ${extra} -o /dev/null -w '${url.replace(/[^a-z]/g, '').slice(-12)}=%{http_code}\\n' '${url}' || echo '${url.replace(/[^a-z]/g, '').slice(-12)}=fail'`;
  try {
    process.env.ASYNCAT_SANDBOX_NETWORK = 'open';
    const open = await runSandboxed(`${curl(`http://127.0.0.1:${hostPort}/`)}; ls '${ensureBridges().dir}' | wc -l`, project);
    assert.match(open.out, /=200/, 'with the network open, the host server answers');
    assert.match(open.out, /^0$/m, "with the network open, the bridges' sockets can't be seen (or removed)");

    process.env.ASYNCAT_SANDBOX_NETWORK = 'off';
    const { proxy } = ensureBridges();
    const off = await runSandboxed([
      curl(`http://127.0.0.1:${hostPort}/`),
      `curl -s -m 5 'http://127.0.0.1:${modelPort}/v1/models'`,
      // Straight at the proxy's socket, past the missing bridge.
      `curl -s -m 5 --unix-socket '${proxy.socket}' -o /dev/null -w 'proxy=%{http_code}\\n' 'http://registry.test:${registryPort}/leak' || echo proxy=fail`,
    ].join('; '), project);
    assert.equal(off.plan.network.effective, 'off');
    assert.doesNotMatch(off.out, /=200/, 'with the network off, the host server is out of reach');
    assert.match(off.out, /model \/v1\/models/, 'the local model stays reachable');
    assert.match(off.out, /proxy=(fail|000)/, "with the network off, the proxy's socket is out of reach");
    assert.doesNotMatch(off.out, /registry \/leak/);

    process.env.ASYNCAT_SANDBOX_NETWORK = 'registries';
    const limited = await runSandboxed([
      `curl -s -m 5 'http://registry.test:${registryPort}/pkg'; echo`,
      `curl -s -m 5 -p 'http://registry.test:${registryPort}/tunnel'; echo`,
      `curl -s -m 5 -o /dev/null -w 'blocked=%{http_code}\\n' 'http://blocked.test:${registryPort}/'`,
      `curl -s -m 5 -o /dev/null -w 'host=%{http_code}\\n' --noproxy '' 'http://127.0.0.1:${hostPort}/'`,
      `curl -s -m 5 'http://127.0.0.1:${modelPort}/v1/models'`,
    ].join('; '), project);
    assert.equal(limited.plan.network.effective, 'registries');
    assert.match(limited.out, /registry \/pkg/);
    assert.match(limited.out, /registry \/tunnel/);
    assert.match(limited.out, /blocked=403/);
    assert.match(limited.out, /host=403/);
    assert.match(limited.out, /model \/v1\/models/);
  } finally {
    if (saved.mode === undefined) delete process.env.ASYNCAT_SANDBOX_NETWORK; else process.env.ASYNCAT_SANDBOX_NETWORK = saved.mode;
    if (saved.port === undefined) delete process.env.LLAMA_SERVER_PORT; else process.env.LLAMA_SERVER_PORT = saved.port;
    closeBridges();
    hostServer.close();
    registry.close();
    model.close();
    fs.rmSync(project, { recursive: true, force: true });
  }
});
