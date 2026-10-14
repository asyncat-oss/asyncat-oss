// den/src/agent/sandboxNetwork.js
// The network for sandboxed commands (commandSandbox.js). The setting
// ASYNCAT_SANDBOX_NETWORK is
//   open        commands use the network like any program (the default)
//   registries  only package registries, through a proxy in den
//   off         no network at all
// With "registries" or "off", a Linux command gets a network of its own with
// nothing in it (bwrap --unshare-net). socat inside turns two local ports into
// unix sockets that den answers on the host: 3128 for the proxy, which only
// connects to registry hosts, and the local model server's port, so commands
// can still use your local model. A command sees only the sockets its mode
// allows: with the network off, the proxy's isn't there at all. macOS denies
// network access in the sandbox-exec profile except to those two ports on
// localhost.

import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { getConfigValue } from '../config/appConfig.js';
import { shellQuote } from './tools/shared.js';

export const NETWORK_MODES = ['open', 'registries', 'off'];
export const PROXY_PORT = 3128;

// Where package managers download from. "registry.npmjs.org" also covers
// its subdomains; "host:port" allows that port only (otherwise 443 and 80).
export const DEFAULT_REGISTRIES = [
  'registry.npmjs.org', 'registry.yarnpkg.com', 'repo.yarnpkg.com', 'npm.jsr.io', 'jsr.io',
  'pypi.org', 'files.pythonhosted.org',
  'crates.io', 'static.crates.io', 'index.crates.io',
  'proxy.golang.org', 'sum.golang.org',
  'rubygems.org', 'index.rubygems.org',
  'repo.maven.apache.org', 'repo1.maven.org', 'plugins.gradle.org', 'services.gradle.org',
  'api.nuget.org',
  'codeload.github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com',
];

function configValue(key) {
  let value = process.env[key];
  if (value === undefined || value === '') {
    try { value = getConfigValue(key); } catch { /* config not ready */ }
  }
  return value ?? '';
}

export function networkMode(value = configValue('ASYNCAT_SANDBOX_NETWORK')) {
  const mode = String(value || 'open').trim().toLowerCase();
  return NETWORK_MODES.includes(mode) ? mode : 'open';
}

/**
 * A host name (optionally host:port) from a registry list, or null. Names
 * only: an address like 127.0.0.1 or localhost would let commands reach
 * this computer's own servers, Asyncat's among them.
 */
export function cleanRegistry(value) {
  const text = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(text)) return null;
  const host = text.split(':')[0];
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host === 'localhost' || host.endsWith('.localhost')) return null;
  return text;
}

/** The registries you added (ASYNCAT_SANDBOX_REGISTRIES, a JSON list or one per line). */
export function extraRegistries(value = configValue('ASYNCAT_SANDBOX_REGISTRIES')) {
  let list;
  try {
    list = JSON.parse(String(value || '[]'));
    if (!Array.isArray(list)) list = [];
  } catch {
    list = String(value || '').split(/[\n,]/);
  }
  return [...new Set(list.map(cleanRegistry).filter(Boolean))];
}

export function registryAllowlist() {
  return [...new Set([...DEFAULT_REGISTRIES, ...extraRegistries()])];
}

/** True when `host:port` is on the list. */
export function hostAllowed(host, port, allowlist) {
  const name = String(host || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const wanted = Number(port);
  return allowlist.some((entry) => {
    const [entryHost, entryPort] = entry.split(':');
    const nameOk = name === entryHost || name.endsWith(`.${entryHost}`);
    const portOk = entryPort ? wanted === Number(entryPort) : wanted === 443 || wanted === 80;
    return nameOk && portOk;
  });
}

function refuse(socket, host) {
  const body = `Asyncat's sandbox only lets commands reach package registries, and ${host} isn't one. The user can add it in Settings → Privacy & safety.\n`;
  socket.end(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
}

/**
 * An HTTP proxy that only connects to hosts on the list: CONNECT for https,
 * and plain http requests with a full URL. `allowlist` is read per request;
 * `lookup` (tests) resolves names like net.connect's option.
 */
export function createRegistryProxy({ allowlist = registryAllowlist, lookup } = {}) {
  const server = http.createServer((req, res) => {
    let target;
    try { target = new URL(req.url); } catch { target = null; }
    if (!target || target.protocol !== 'http:') {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Asyncat\'s registry proxy only forwards http:// URLs and https CONNECT.\n');
      return;
    }
    const port = Number(target.port || 80);
    if (!hostAllowed(target.hostname, port, allowlist())) {
      refuse(res.socket, target.hostname);
      return;
    }
    const upstream = http.request({
      host: target.hostname, port, path: `${target.pathname}${target.search}`, method: req.method,
      headers: { ...req.headers, host: target.host }, ...(lookup ? { lookup } : {}),
    }, (reply) => {
      res.writeHead(reply.statusCode || 502, reply.headers);
      reply.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });

  server.on('connect', (req, client, head) => {
    let target;
    try { target = new URL(`http://${req.url}`); } catch { target = null; }
    client.on('error', () => {});
    if (!target || !target.port) {
      client.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }
    if (!hostAllowed(target.hostname, target.port, allowlist())) {
      refuse(client, target.hostname);
      return;
    }
    const upstream = net.connect({ host: target.hostname.replace(/^\[|\]$/g, ''), port: Number(target.port), ...(lookup ? { lookup } : {}) }, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'));
  });
  server.on('clientError', (err, socket) => socket.destroy());
  return server;
}

/** Ports of the local model servers, kept reachable in every mode. */
export function localModelPorts(platform = process.platform) {
  const keys = platform === 'darwin' ? ['LLAMA_SERVER_PORT', 'MLX_SERVER_PORT'] : ['LLAMA_SERVER_PORT'];
  const defaults = { LLAMA_SERVER_PORT: 8765, MLX_SERVER_PORT: 8766 };
  return [...new Set(keys.map((key) => Number(configValue(key)) || defaults[key]).filter((port) => port > 0 && port < 65536))];
}

/** Pass connections on a unix socket (or local TCP port) to 127.0.0.1:port. */
function portForwarder(port) {
  return net.createServer((client) => {
    const upstream = net.connect(port, '127.0.0.1');
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.pipe(upstream).pipe(client);
  });
}

let bridges = null;

/**
 * Where the sockets' folder goes: the session folder (XDG_RUNTIME_DIR), which
 * commands can't see, when there is one; otherwise the temp folder.
 */
function bridgesBase(env = process.env) {
  const runtimeDir = env.XDG_RUNTIME_DIR;
  try {
    if (runtimeDir && path.isAbsolute(runtimeDir) && fs.statSync(runtimeDir).isDirectory()) return runtimeDir;
  } catch { /* not there */ }
  return os.tmpdir();
}

/**
 * Start (once) what sandboxed commands connect to. Linux: the registry proxy
 * and a forwarder per local model port, on unix sockets in a private folder
 * (proxy/ and models/ inside it, so each mode can be shown only its own).
 * macOS: the proxy on a local TCP port (known once listening); the model
 * ports are reached directly. Tests pass their own `allowlist` and `lookup`.
 */
export function ensureBridges({ platform = process.platform, allowlist = registryAllowlist, lookup } = {}) {
  if (bridges) return bridges;
  const servers = [];
  const keep = (server) => {
    server.on('error', () => {});
    server.unref();
    servers.push(server);
    return server;
  };

  if (platform === 'darwin') {
    const proxy = { port: null };
    const server = keep(createRegistryProxy({ allowlist, lookup }));
    server.listen(0, '127.0.0.1', () => { proxy.port = server.address().port; });
    bridges = {
      dir: null,
      proxy,
      models: () => localModelPorts(platform).map((port) => ({ port })),
      close() { servers.forEach((item) => item.close()); bridges = null; },
    };
    return bridges;
  }

  const dir = fs.mkdtempSync(path.join(bridgesBase(), 'asyncat-net-'));
  fs.chmodSync(dir, 0o700);
  const proxyDir = path.join(dir, 'proxy');
  const modelsDir = path.join(dir, 'models');
  fs.mkdirSync(proxyDir, { mode: 0o700 });
  fs.mkdirSync(modelsDir, { mode: 0o700 });
  const proxySocket = path.join(proxyDir, 'proxy.sock');
  keep(createRegistryProxy({ allowlist, lookup })).listen(proxySocket);
  const forwards = new Map();
  bridges = {
    dir,
    proxy: { dir: proxyDir, socket: proxySocket },
    modelsDir,
    // Forwarders follow the port setting: a new port gets one when first used.
    models: () => localModelPorts(platform).map((port) => {
      if (!forwards.has(port)) {
        const socket = path.join(modelsDir, `port-${port}.sock`);
        keep(portForwarder(port)).listen(socket);
        forwards.set(port, socket);
      }
      return { port, socket: forwards.get(port) };
    }),
    close() {
      servers.forEach((item) => item.close());
      fs.rmSync(dir, { recursive: true, force: true });
      bridges = null;
    },
  };
  process.once('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });
  return bridges;
}

/** Stop the bridges (tests). */
export function closeBridges() {
  bridges?.close();
}

const NO_SOCAT = {
  registries: "socat isn't installed, so commands run with the network off (and can't reach your local model).",
  off: "socat isn't installed, so commands can't reach your local model either.",
};

/** What `mode` amounts to here, without starting anything (for Settings). */
export function networkSummary({ mode = networkMode(), platform = process.platform, socat = false } = {}) {
  if (mode === 'open' || (platform !== 'linux' && platform !== 'darwin')) return { mode, effective: 'open', note: null };
  if (platform === 'linux' && !socat) return { mode, effective: 'off', note: NO_SOCAT[mode] };
  return { mode, effective: mode, note: null };
}

const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`;

/** Environment that sends package managers through the proxy. */
export function proxyEnv(url = PROXY_URL) {
  return {
    HTTP_PROXY: url, HTTPS_PROXY: url, http_proxy: url, https_proxy: url,
    NO_PROXY: 'localhost,127.0.0.1,::1', no_proxy: 'localhost,127.0.0.1,::1',
    NODE_USE_ENV_PROXY: '1',
  };
}

/**
 * The shell script that starts socat bridges inside the command's empty
 * network, waits until they listen, then runs the command ("$@").
 */
export function bridgeScript(links) {
  const lines = [];
  for (const { port, socket } of links) {
    lines.push(`socat TCP-LISTEN:${port},bind=127.0.0.1,fork,reuseaddr UNIX-CONNECT:${shellQuote(socket)} >/dev/null 2>&1 & bridges="$bridges $!"`);
  }
  for (const { port } of links) {
    lines.push(`i=0; while [ $i -lt 100 ] && ! socat -u OPEN:/dev/null TCP:127.0.0.1:${port} >/dev/null 2>&1; do i=$((i+1)); sleep 0.02; done`);
  }
  lines.push('"$@"; status=$?', 'kill $bridges 2>/dev/null', 'exit $status');
  return lines.join('\n');
}

/**
 * How a sandboxed command reaches the network in `mode`: extra bwrap
 * arguments, a wrapper for the command, environment, extra sandbox-exec
 * rules, and what it ends up as (`effective`) with a note when that differs.
 */
export function networkPlan({ mode = networkMode(), platform = process.platform, socat = false, bridges: given = null } = {}) {
  if (mode === 'open' || (platform !== 'linux' && platform !== 'darwin')) {
    // Sockets started for another mode stay out of sight, so a command
    // can't remove them.
    const started = platform === 'linux' ? (given || bridges)?.dir : null;
    return { mode, effective: 'open', bwrap: [], mounts: started ? ['--tmpfs', started] : [], wrap: null, env: {}, seatbelt: [], note: null };
  }
  const links = given || ensureBridges({ platform });

  if (platform === 'darwin') {
    const ports = links.models().map((model) => model.port);
    const proxyPort = mode === 'registries' ? links.proxy.port : null;
    const allowed = [...ports, ...(proxyPort ? [proxyPort] : [])];
    const seatbelt = [
      '(deny network*)',
      ...allowed.map((port) => `(allow network-outbound (remote ip "localhost:${port}"))`),
    ];
    if (mode === 'registries' && !proxyPort) {
      return { mode, effective: 'off', bwrap: [], mounts: [], wrap: null, env: {}, seatbelt, note: 'The registry proxy is still starting, so this command ran with the network off. Try again.' };
    }
    return {
      mode, effective: mode, bwrap: [], mounts: [], wrap: null, seatbelt, note: null,
      env: proxyPort ? proxyEnv(`http://127.0.0.1:${proxyPort}`) : {},
    };
  }

  // Linux: an empty network, plus socat bridges when socat is installed. The
  // sockets' folder is covered, and only this mode's sockets are put back,
  // read-only, so a command can't remove them or reach the proxy with the
  // network off.
  const bwrap = ['--unshare-net'];
  const shown = mode === 'registries' ? [links.modelsDir, links.proxy.dir] : [links.modelsDir];
  const mounts = ['--tmpfs', links.dir, ...shown.flatMap((dir) => ['--ro-bind', dir, dir])];
  if (!socat) {
    return {
      mode, effective: 'off', bwrap, mounts, wrap: null, env: {}, seatbelt: [],
      note: NO_SOCAT[mode],
    };
  }
  const forwards = links.models();
  const all = mode === 'registries' ? [{ port: PROXY_PORT, socket: links.proxy.socket }, ...forwards] : forwards;
  return {
    mode, effective: mode, bwrap, mounts, seatbelt: [], note: null,
    wrap: (file, args) => ['/bin/sh', ['-c', bridgeScript(all), 'asyncat-net', file, ...args]],
    env: mode === 'registries' ? proxyEnv() : {},
  };
}
