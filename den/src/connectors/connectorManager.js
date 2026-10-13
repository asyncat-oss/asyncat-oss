// den/src/connectors/connectorManager.js
// Connectors are MCP servers: local programs that talk over stdin/stdout, or
// remote services over Streamable HTTP (older ones over SSE). This keeps one
// connection per connector, offers each one's tools to the agent as
// mcp__<connector>__<tool>, and tracks the status Settings → Connections →
// Connectors shows. Changes to data/mcp.json, from the app or by hand, apply
// without a restart; only connectors whose settings changed reconnect.

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { toolRegistry, PermissionLevel } from '../agent/tools/toolRegistry.js';
import { publishAppEvent } from '../lib/appEvents.js';
import {
  MASKED_VALUE, connectorConfigPath, fingerprintOf, maskMap, normalizeServer, readConnectorFile, sealConnectorFile,
} from './connectorConfig.js';
import { ConnectorAuthProvider, forgetAuth, isSignedIn, takePendingSignIn } from './connectorAuth.js';
import { downloadCheck, offlineEnv, onlineEnv } from './launchers.js';

const CONNECT_TIMEOUT_MS = 30_000;
const FIRST_DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const CALL_TIMEOUT_MS = 2 * 60_000; // progress messages from the server restart it
const MAX_CALL_MS = 10 * 60_000;
const MAX_RESULT_CHARS = 60_000;
const LOG_LIMIT = 8_000;
const AUTO_RESTART_GAP_MS = 10 * 60_000;
const STOP_TIMEOUT_MS = 5_000;

const APP_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version || '0';
  } catch {
    return '0';
  }
})();
const CLIENT_INFO = { name: 'Asyncat', version: APP_VERSION };

// What a local connector inherits from Asyncat's environment, besides the
// MCP SDK's minimal set (HOME, PATH, USER…). Asyncat's own keys and tokens
// are never passed on; a connector gets the keys saved for it.
const PASSTHROUGH_ENV = [
  'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TMPDIR', 'TMP', 'TEMP',
  'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME',
  'DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
  'npm_config_cache', 'npm_config_registry', 'UV_CACHE_DIR', 'UV_INDEX_URL',
  'NVM_DIR', 'VOLTA_HOME', 'PNPM_HOME', 'BUN_INSTALL',
  'ComSpec', 'PATHEXT', 'ProgramData', 'ProgramFiles(x86)', 'CommonProgramFiles', 'WINDIR', 'OS',
];

// connector name → { name, config, fingerprint, status, error, log, tools,
// client, transport, attempt, generation, starting, download, authUrl, … }
const connections = new Map();
let fileError = null;
let started = false;
let watcher = null;
let watchTimer = null;
let publishTimer = null;
let syncChain = Promise.resolve();

function publish() {
  if (publishTimer) return;
  publishTimer = setTimeout(() => {
    publishTimer = null;
    publishAppEvent('connectors.updated', {});
  }, 50);
  publishTimer.unref?.();
}

// ── Names, permissions and results ────────────────────────────────────────────

function slug(value, max) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max) || 'x';
}

/** The name the agent sees for a connector's tool: mcp__<connector>__<tool>, at most 64 characters. */
export function connectorToolName(connector, tool) {
  const prefix = `mcp__${slug(connector, 20)}__`;
  const toolPart = String(tool || '').replace(/[^A-Za-z0-9_-]+/g, '_') || 'tool';
  const full = `${prefix}${toolPart}`;
  if (full.length <= 64) return full;
  const hash = crypto.createHash('sha1').update(String(tool)).digest('hex').slice(0, 6);
  return `${prefix}${toolPart.slice(0, 64 - prefix.length - 7)}_${hash}`;
}

/**
 * How careful to be with a tool, from what its server says about it (MCP tool
 * annotations). Only a tool that says it changes nothing runs without asking;
 * one that only adds, inside the service, is moderate; anything else (and any
 * tool that says nothing, as MCP's defaults assume the worst) is dangerous.
 */
export function permissionForTool(annotations = {}) {
  if (annotations?.readOnlyHint === true) return PermissionLevel.SAFE;
  if (annotations?.destructiveHint === false && annotations?.openWorldHint === false) return PermissionLevel.MODERATE;
  return PermissionLevel.DANGEROUS;
}

/** An MCP tool result in the shape agent tools return. */
export function toolResultFromMcp(result, connectorTitle = 'The connector') {
  const parts = [];
  let dataUrl = null;
  for (const item of Array.isArray(result?.content) ? result.content : []) {
    if (item?.type === 'text') {
      parts.push(String(item.text ?? ''));
    } else if (item?.type === 'image' && item.data) {
      if (!dataUrl) dataUrl = `data:${item.mimeType || 'image/png'};base64,${item.data}`;
      parts.push(`[image: ${item.mimeType || 'image'}]`);
    } else if (item?.type === 'audio') {
      parts.push(`[audio: ${item.mimeType || 'audio'}, not shown]`);
    } else if (item?.type === 'resource') {
      const res = item.resource || {};
      parts.push(typeof res.text === 'string' ? res.text : `[file: ${res.uri || 'resource'}${res.mimeType ? `, ${res.mimeType}` : ''}]`);
    } else if (item?.type === 'resource_link') {
      parts.push(`[link: ${item.name || item.uri}${item.uri && item.name ? ` (${item.uri})` : ''}]`);
    }
  }
  if (!parts.length && result?.structuredContent !== undefined) parts.push(JSON.stringify(result.structuredContent));
  if (!parts.length && result?.toolResult !== undefined) parts.push(typeof result.toolResult === 'string' ? result.toolResult : JSON.stringify(result.toolResult));
  let text = parts.join('\n').trim();
  if (text.length > MAX_RESULT_CHARS) {
    text = `${text.slice(0, MAX_RESULT_CHARS)}\n… [cut: ${text.length - MAX_RESULT_CHARS} more characters]`;
  }
  if (result?.isError) return { success: false, error: text || `${connectorTitle} reported an error.` };
  return { success: true, content: text || 'Done (no output).', ...(dataUrl ? { dataUrl } : {}) };
}

function inputSchemaFor(tool) {
  const schema = tool?.inputSchema && typeof tool.inputSchema === 'object' ? { ...tool.inputSchema } : {};
  delete schema.$schema;
  schema.type = 'object';
  if (!schema.properties || typeof schema.properties !== 'object') schema.properties = {};
  return schema;
}

function titleOf(entry) {
  return entry.config.title || entry.name;
}

// ── Tools ─────────────────────────────────────────────────────────────────────

function unregisterTools(entry) {
  toolRegistry.unregisterWhere((tool) => tool.category === 'mcp' && tool.serverName === entry.name);
  entry.tools = [];
}

function registerTools(entry, tools) {
  unregisterTools(entry);
  const used = new Set();
  for (const tool of tools) {
    if (!tool?.name) continue;
    const base = connectorToolName(entry.name, tool.name);
    let name = base;
    for (let n = 2; used.has(name) || (toolRegistry.has(name) && toolRegistry.get(name).serverName !== entry.name); n += 1) {
      name = `${base.slice(0, 60)}_${n}`;
    }
    used.add(name);
    const permission = permissionForTool(tool.annotations);
    const description = String(tool.description || tool.title || tool.annotations?.title || tool.name).trim();
    toolRegistry.register({
      name,
      description: `[${titleOf(entry)}] ${description.slice(0, 1000)}`,
      parameters: inputSchemaFor(tool),
      permission,
      category: 'mcp',
      serverName: entry.name,
      displayName: `${titleOf(entry)} · ${tool.title || tool.annotations?.title || tool.name}`,
      execute: (args, context) => callConnectorTool(entry, tool.name, args, context),
    });
    entry.tools.push({
      name,
      tool: tool.name,
      title: tool.title || tool.annotations?.title || null,
      description: description.slice(0, 300),
      permission,
    });
  }
}

async function listAllTools(client) {
  if (!client.getServerCapabilities()?.tools) return [];
  const tools = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const res = await client.listTools(cursor ? { cursor } : undefined);
    tools.push(...(res.tools || []));
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return tools;
}

async function callConnectorTool(entry, toolName, args, context = {}) {
  const title = titleOf(entry);
  if (connections.get(entry.name) !== entry || !entry.client || entry.status !== 'connected') {
    return { success: false, error: `The ${title} connector isn't connected right now. Check it in Settings → Connections → Connectors.` };
  }
  try {
    const result = await entry.client.callTool({ name: toolName, arguments: args || {} }, undefined, {
      timeout: CALL_TIMEOUT_MS,
      resetTimeoutOnProgress: true,
      maxTotalTimeout: MAX_CALL_MS,
      ...(context.abortSignal ? { signal: context.abortSignal } : {}),
    });
    return toolResultFromMcp(result, title);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      entry.status = 'needs_sign_in';
      entry.error = 'Its sign-in ran out.';
      unregisterTools(entry);
      publish();
      return { success: false, error: `${title} needs you to sign in again (Settings → Connections → Connectors).` };
    }
    return { success: false, error: `${title}: ${err?.message || err}` };
  }
}

// ── Starting and stopping ─────────────────────────────────────────────────────

function userBinDirs() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return [process.env.APPDATA && path.join(process.env.APPDATA, 'npm'), path.join(home, '.local', 'bin')].filter(Boolean);
  }
  return [
    path.join(home, '.local', 'bin'),
    path.join(home, '.cargo', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.volta', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ];
}

/** Environment for a local connector, before its own saved variables. */
export function childEnv(source = process.env) {
  const env = {};
  for (const key of PASSTHROUGH_ENV) {
    const value = source[key];
    if (value !== undefined && !String(value).startsWith('()')) env[key] = value;
  }
  // Started from a desktop launcher, PATH often misses the user's own tool
  // folders (npx, uvx): add the usual ones that exist, after the rest.
  const current = String(source.PATH || '').split(path.delimiter).filter(Boolean);
  const extra = [path.dirname(process.execPath), ...userBinDirs()]
    .filter((dir) => !current.includes(dir) && fs.existsSync(dir));
  env.PATH = [...current, ...extra].join(path.delimiter);
  return env;
}

function appendLog(entry, chunk) {
  entry.log = `${entry.log}${String(chunk)}`;
  if (entry.log.length > LOG_LIMIT) entry.log = entry.log.slice(-LOG_LIMIT);
}

function lastLogLine(entry) {
  const lines = String(entry.log || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.at(-1)?.slice(0, 300) || '';
}

function friendlyError(err, entry) {
  const message = String(err?.message || err || 'Unknown error');
  const { config } = entry;
  if (config.kind === 'local') {
    if (err?.code === 'ENOENT' || /\bENOENT\b/.test(message)) {
      const base = path.basename(config.command).toLowerCase();
      const hint = /^(npx|npm|node|pnpm|yarn)(\.cmd|\.exe)?$/.test(base) ? ' Install Node.js from nodejs.org, then restart it.'
        : /^(uvx|uv)(\.exe)?$/.test(base) ? ' Install uv (docs.astral.sh/uv), then restart it.'
          : /^(docker|podman)(\.exe)?$/.test(base) ? ' Install and start Docker, then restart it.' : '';
      return `Couldn't find the program "${config.command}".${hint}`;
    }
    const last = lastLogLine(entry);
    if (/timed out/i.test(message)) return `It didn't answer in time.${last ? ` Last message: ${last}` : ''}`;
    if (/connection closed|closed/i.test(message)) return `It stopped before it was ready.${last ? ` ${last}` : ''}`;
    return message.slice(0, 400);
  }
  let host = config.url;
  try {
    host = new URL(config.url).host;
  } catch {
    // keep the raw address
  }
  if (/ECONNREFUSED/.test(message)) return `Nothing is answering at ${host}.`;
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/.test(message)) return `Couldn't reach ${host}. Check the address and your connection.`;
  if (/timed out/i.test(message)) return `${host} didn't answer in time.`;
  if (/\b404\b/.test(message)) return `There is no MCP server at ${config.url} (404). Check the address.`;
  if (/\b(401|403)\b/.test(message)) return `${host} refused the connection (${message.match(/\b(401|403)\b/)[1]}). Check its key or sign-in.`;
  return message.slice(0, 400);
}

async function settle(promise, ms) {
  let timer;
  await Promise.race([
    Promise.resolve(promise).catch(() => {}),
    new Promise((resolve) => { timer = setTimeout(resolve, ms); timer.unref?.(); }),
  ]);
  clearTimeout(timer);
}

async function closeQuietly(client, transport) {
  if (client) await settle(client.close(), STOP_TIMEOUT_MS);
  else if (transport) await settle(transport.close(), STOP_TIMEOUT_MS);
}

function makeEntry(name, config, fingerprint) {
  return {
    name,
    config,
    fingerprint,
    status: config.disabled ? 'off' : 'starting',
    error: null,
    log: '',
    tools: [],
    client: null,
    transport: null,
    attempt: null,
    generation: 0,
    starting: null,
    download: null,
    authUrl: null,
    usesSignIn: false,
    startedAt: null,
    serverInfo: null,
    lastAutoRestart: 0,
    retryTimer: null,
  };
}

function handleClosed(entry, generation) {
  if (entry.generation !== generation || connections.get(entry.name) !== entry) return;
  if (entry.status !== 'connected') return; // a failed start reports itself
  unregisterTools(entry);
  entry.client = null;
  entry.transport = null;
  entry.status = 'error';
  const last = entry.config.kind === 'local' ? lastLogLine(entry) : '';
  entry.error = `It stopped unexpectedly.${last ? ` ${last}` : ''}`;
  publish();
  const now = Date.now();
  if (now - entry.lastAutoRestart > AUTO_RESTART_GAP_MS) {
    entry.lastAutoRestart = now;
    entry.retryTimer = setTimeout(() => {
      if (connections.get(entry.name) === entry && entry.status === 'error') startEntry(entry);
    }, 3_000);
    entry.retryTimer.unref?.();
  }
}

async function connectEntry(entry, generation) {
  const { config, name } = entry;
  const current = () => entry.generation === generation && connections.get(name) === entry;
  entry.status = 'starting';
  entry.error = null;
  entry.authUrl = null;
  entry.download = null;
  publish();

  let transport = null;
  let client = null;
  let provider = null;
  let timeout = CONNECT_TIMEOUT_MS;
  try {
    if (config.kind === 'local') {
      if (!config.command) throw new Error('It has no command to start it with.');
      const check = downloadCheck(config.command, config.args);
      let launchEnv = {};
      if (check.launcher && !check.needed) {
        launchEnv = offlineEnv(check.launcher);
      } else if (check.needed) {
        if (config.approvedDownload?.spec !== check.launcher.spec) {
          entry.status = 'needs_download';
          entry.download = {
            kind: check.launcher.kind,
            launcher: check.launcher.launcher,
            name: check.launcher.name,
            version: check.launcher.version,
            spec: check.launcher.spec,
          };
          publish();
          return;
        }
        launchEnv = onlineEnv(check.launcher);
        timeout = FIRST_DOWNLOAD_TIMEOUT_MS;
      }
      entry.log = '';
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...childEnv(), ...launchEnv, ...config.env },
        cwd: config.cwd || undefined,
        stderr: 'pipe',
      });
      transport.stderr?.on('data', (chunk) => appendLog(entry, chunk));
    } else {
      provider = new ConnectorAuthProvider({
        name,
        serverUrl: config.url,
        oauth: config.oauth,
        onAuthorizationUrl: (url) => { if (current()) entry.authUrl = url; },
      });
      const options = {
        authProvider: provider,
        ...(Object.keys(config.headers).length ? { requestInit: { headers: config.headers } } : {}),
      };
      transport = config.transport === 'sse'
        ? new SSEClientTransport(new URL(config.url), options)
        : new StreamableHTTPClientTransport(new URL(config.url), options);
      provider.transport = transport;
    }

    client = new Client(CLIENT_INFO, {
      capabilities: {},
      listChanged: {
        tools: {
          onChanged: (error, tools) => {
            if (error || !current() || entry.status !== 'connected') return;
            const apply = tools ? Promise.resolve(tools) : listAllTools(client);
            apply.then((list) => { if (current()) { registerTools(entry, list); publish(); } }).catch(() => {});
          },
        },
      },
    });
    client.onclose = () => handleClosed(entry, generation);
    entry.attempt = { client, transport };
    await client.connect(transport, { timeout });
    if (!current()) {
      await closeQuietly(client);
      return;
    }
    const tools = await listAllTools(client);
    if (!current()) {
      await closeQuietly(client);
      return;
    }
    entry.client = client;
    entry.transport = transport;
    entry.attempt = null;
    entry.usesSignIn = Boolean(provider?.tokens()?.access_token);
    entry.serverInfo = client.getServerVersion?.() || null;
    registerTools(entry, tools);
    entry.status = 'connected';
    entry.error = null;
    entry.startedAt = new Date().toISOString();
  } catch (err) {
    if (!current()) {
      await closeQuietly(client, transport);
      return;
    }
    entry.attempt = null;
    unregisterTools(entry);
    entry.client = null;
    entry.transport = null;
    if (err instanceof UnauthorizedError || entry.authUrl) {
      entry.status = 'needs_sign_in';
      entry.usesSignIn = true;
      entry.error = entry.authUrl ? null : 'It needs a sign-in, but it offered no way to sign in. Add its key under Headers instead.';
    } else if (config.kind === 'local' && /ENOTCACHED/.test(entry.log)) {
      // Started offline, but part of it is no longer cached.
      entry.status = 'needs_download';
      const check = downloadCheck(config.command, config.args);
      entry.download = check.launcher ? { kind: check.launcher.kind, launcher: check.launcher.launcher, name: check.launcher.name, version: check.launcher.version, spec: check.launcher.spec } : null;
      entry.error = 'Part of it needs downloading again.';
    } else {
      entry.status = 'error';
      entry.error = friendlyError(err, entry);
    }
    await closeQuietly(client, transport);
  }
  publish();
}

function startEntry(entry) {
  entry.generation += 1;
  const generation = entry.generation;
  clearTimeout(entry.retryTimer);
  const previous = entry.attempt;
  entry.attempt = null;
  const run = (async () => {
    if (previous) await closeQuietly(previous.client, previous.transport);
    if (entry.client) {
      const client = entry.client;
      entry.client = null;
      entry.transport = null;
      unregisterTools(entry);
      await closeQuietly(client);
    }
    if (entry.generation === generation) await connectEntry(entry, generation);
  })();
  entry.starting = run.finally(() => {
    if (entry.generation === generation) entry.starting = null;
  });
  return entry.starting;
}

async function stopEntry(entry) {
  entry.generation += 1;
  clearTimeout(entry.retryTimer);
  unregisterTools(entry);
  const { client, transport, attempt } = entry;
  entry.client = null;
  entry.transport = null;
  entry.attempt = null;
  entry.starting = null;
  await Promise.all([
    client ? closeQuietly(client) : null,
    attempt ? closeQuietly(attempt.client, attempt.transport) : null,
  ]);
  if (!client && transport) await closeQuietly(null, transport);
}

// ── Keeping in step with data/mcp.json ────────────────────────────────────────

async function doSync() {
  sealConnectorFile();
  const file = readConnectorFile();
  if (file._error) {
    // Keep what runs; nothing changes until the file is fixed.
    fileError = file._error;
    publish();
    return;
  }
  fileError = null;
  const wanted = new Map(Object.entries(file.mcpServers).map(([name, raw]) => [name, normalizeServer(raw)]));
  await Promise.all([...connections.values()]
    .filter((entry) => !wanted.has(entry.name))
    .map(async (entry) => {
      connections.delete(entry.name);
      await stopEntry(entry);
    }));
  for (const [name, config] of wanted) {
    const fingerprint = fingerprintOf(config);
    const existing = connections.get(name);
    if (existing && existing.fingerprint === fingerprint) {
      existing.config = config; // a new title needs no restart
      continue;
    }
    if (existing) await stopEntry(existing);
    const entry = makeEntry(name, config, fingerprint);
    connections.set(name, entry);
    if (!config.disabled) startEntry(entry);
  }
  publish();
}

/** Apply data/mcp.json as it is now. Calls run one after another. */
export function syncConnectors() {
  syncChain = syncChain.then(doSync, doSync).catch((err) => {
    console.error('[connectors] Sync failed:', err.message);
  });
  return syncChain;
}

function watchConfig() {
  const file = connectorConfigPath();
  const dir = path.dirname(file);
  try {
    fs.mkdirSync(dir, { recursive: true });
    // The folder, not the file: saves replace the file, which ends a watch on it.
    watcher = fs.watch(dir, (_event, filename) => {
      if (filename && filename !== path.basename(file)) return;
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => { syncConnectors(); }, 300);
      watchTimer.unref?.();
    });
    watcher.on('error', () => {});
    watcher.unref?.();
  } catch (err) {
    console.warn('[connectors] Not watching data/mcp.json:', err.message);
  }
}

/** Connect every connector that is on, and follow changes to data/mcp.json. */
export function startConnectors({ watch = true } = {}) {
  if (!started) {
    started = true;
    if (watch) watchConfig();
  }
  return syncConnectors();
}

export async function stopConnectors() {
  started = false;
  clearTimeout(watchTimer);
  watcher?.close();
  watcher = null;
  const entries = [...connections.values()];
  connections.clear();
  await Promise.all(entries.map((entry) => stopEntry(entry)));
}

/** Wait (up to timeoutMs) for a connector that is starting to finish starting. */
export async function waitForConnector(name, timeoutMs = 10_000) {
  await syncChain;
  const entry = connections.get(name);
  if (entry?.starting) await settle(entry.starting, timeoutMs);
}

// ── What the screens see ──────────────────────────────────────────────────────

export function connectorFileError() {
  return fileError;
}

function publicConnector(name, config) {
  const entry = connections.get(name);
  const signedIn = config.kind === 'remote' ? isSignedIn(name, config.url) : false;
  const status = entry?.status || (config.disabled ? 'off' : 'starting');
  return {
    name,
    title: config.title || name,
    kind: config.kind,
    catalogId: config.catalogId,
    enabled: !config.disabled,
    command: config.command,
    args: config.args,
    cwd: config.cwd,
    env: maskMap(config.env),
    url: config.url,
    transport: config.kind === 'remote' ? config.transport : null,
    headers: maskMap(config.headers),
    oauth: config.oauth
      ? { clientId: config.oauth.clientId, clientSecret: config.oauth.clientSecret ? MASKED_VALUE : '', scope: config.oauth.scope }
      : null,
    status: config.disabled ? 'off' : status,
    error: config.disabled ? null : entry?.error || null,
    log: config.kind === 'local' ? String(entry?.log || '').slice(-2_000) : '',
    tools: entry?.tools || [],
    toolCount: entry?.tools?.length || 0,
    signedIn,
    usesSignIn: Boolean(entry?.usesSignIn || signedIn),
    download: entry?.download || null,
    approvedDownload: config.approvedDownload,
    startedAt: entry?.startedAt || null,
    server: entry?.serverInfo ? { name: entry.serverInfo.name || null, version: entry.serverInfo.version || null } : null,
  };
}

/** Every saved connector with its live status. */
export function listConnectors() {
  const file = readConnectorFile();
  if (file._error) {
    return [...connections.values()].map((entry) => publicConnector(entry.name, entry.config));
  }
  return Object.entries(file.mcpServers).map(([name, raw]) => publicConnector(name, normalizeServer(raw)));
}

export function getConnector(name) {
  return listConnectors().find((item) => item.name === name) || null;
}

/** Names of the saved connectors, for agent and Cat pickers. */
export function connectorNames() {
  return listConnectors().map((item) => item.name);
}

// ── Actions ───────────────────────────────────────────────────────────────────

function liveEntry(name) {
  const entry = connections.get(name);
  if (!entry) throw Object.assign(new Error('No connector by that name.'), { status: 404 });
  return entry;
}

export async function restartConnector(name) {
  await syncChain;
  const entry = liveEntry(name);
  if (entry.config.disabled) throw Object.assign(new Error('Turn it on first.'), { status: 409 });
  entry.lastAutoRestart = 0;
  await startEntry(entry);
  return getConnector(name);
}

/**
 * Start signing in to a remote connector. Returns the page to open in the
 * browser, or { status: 'connected' } when no sign-in was needed.
 */
export async function beginSignIn(name) {
  await syncChain;
  const entry = liveEntry(name);
  if (entry.config.kind !== 'remote') throw Object.assign(new Error('Only remote connectors sign in.'), { status: 400 });
  if (entry.config.disabled) throw Object.assign(new Error('Turn it on first.'), { status: 409 });
  // A fresh attempt makes a fresh sign-in link.
  await startEntry(entry);
  if (entry.status === 'connected') return { status: 'connected' };
  if (entry.authUrl) return { status: 'needs_sign_in', authorizationUrl: entry.authUrl };
  throw Object.assign(new Error(entry.error || "It didn't offer a way to sign in."), { status: 409 });
}

/**
 * The browser came back from the service's sign-in page. Exchanges the code
 * for tokens and reconnects. Returns { name, title, status }.
 */
export async function finishSignIn({ state, code, error = null, errorDescription = null }) {
  const item = takePendingSignIn(state);
  if (!item) {
    throw Object.assign(new Error('This sign-in link has expired or was already used. Start the sign-in again from Asyncat.'), { status: 400 });
  }
  const entry = connections.get(item.name);
  const title = entry ? titleOf(entry) : item.name;
  if (error) {
    const message = errorDescription || (error === 'access_denied' ? 'You said no on the sign-in page.' : error);
    if (entry) {
      entry.error = `Sign-in didn't finish: ${message}`;
      publish();
    }
    throw Object.assign(new Error(message), { status: 400, title });
  }
  if (!code) throw Object.assign(new Error('The sign-in page sent no code back.'), { status: 400, title });
  try {
    await item.transport.finishAuth(String(code));
  } catch (err) {
    if (entry) {
      entry.error = `Sign-in didn't finish: ${err.message}`;
      publish();
    }
    throw Object.assign(new Error(err.message), { status: 400, title });
  }
  if (entry && !entry.config.disabled && connections.get(item.name) === entry) await startEntry(entry);
  return { name: item.name, title, status: entry?.status || 'connected' };
}

export async function signOut(name) {
  await syncChain;
  const entry = liveEntry(name);
  forgetAuth(name);
  if (!entry.config.disabled) await startEntry(entry);
  return getConnector(name);
}

/** Forget a removed connector's sign-in. */
export function forgetConnectorAuth(name) {
  forgetAuth(name, { all: true });
}

/** Tool names of the connectors in `names` (all connectors when null). */
export function connectorToolNames(names = null) {
  const allowed = Array.isArray(names) ? new Set(names) : null;
  return toolRegistry.all()
    .filter((tool) => tool.category === 'mcp' && (!allowed || allowed.has(tool.serverName)))
    .map((tool) => tool.name);
}
