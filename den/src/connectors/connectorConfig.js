// den/src/connectors/connectorConfig.js
// Where connectors (MCP servers) are saved: data/mcp.json, in the shape other
// MCP apps use ({ "mcpServers": { "<name>": { ... } } }), so a config copied
// from elsewhere works as it is. Keys and tokens in it (env values, request
// headers, an OAuth client secret) are sealed with secretBox, so the file on
// its own gives nothing away.
//
// A local program:  { command, args, env, cwd }
// A remote server:  { url, type: "http" | "sse", headers, oauth: { clientId, clientSecret, scope } }
// Both may have:    { disabled, title, catalogId, approvedDownload: { spec, approvedAt } }

import fs from 'fs';
import path from 'path';
import { runtimeDataPath } from '../config/runtimeConfig.js';
import { isSealed, openSecret, sealSecret } from '../lib/secretBox.js';

// Listings show which keys are set, not their values. Sending this back for
// a key keeps the value already saved.
export const MASKED_VALUE = '********';

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/;

export function connectorConfigPath() {
  return runtimeDataPath('mcp.json');
}

export function validConnectorName(name) {
  return NAME_PATTERN.test(String(name || ''));
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function stringMap(value) {
  const source = plainObject(value) || {};
  const out = {};
  for (const [key, raw] of Object.entries(source)) {
    const name = String(key || '').trim();
    if (!name || raw === null || raw === undefined) continue;
    out[name] = String(raw);
  }
  return out;
}

function openMap(map) {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, openSecret(value)]));
}

/** Read data/mcp.json. A file that isn't valid JSON comes back with _error. */
export function readConnectorFile(file = connectorConfigPath()) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { mcpServers: {} };
    return { mcpServers: {}, _error: `Couldn't read ${path.basename(file)}: ${err.message}` };
  }
  try {
    const parsed = JSON.parse(text.trim() ? text : '{}');
    const servers = plainObject(parsed?.mcpServers) || {};
    return { ...(plainObject(parsed) || {}), mcpServers: servers };
  } catch (err) {
    return { mcpServers: {}, _error: `${path.basename(file)} isn't valid JSON (${err.message}). Fix or remove it to manage connectors here.` };
  }
}

function writeConnectorFile(config, file = connectorConfigPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { _error, ...rest } = config;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(rest, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * Change data/mcp.json: `change(config)` edits config.mcpServers in place.
 * Refuses when the file can't be read, so a hand-edit with a typo is never
 * overwritten.
 */
export function updateConnectorFile(change, file = connectorConfigPath()) {
  const config = readConnectorFile(file);
  if (config._error) {
    const error = new Error(config._error);
    error.status = 409;
    throw error;
  }
  const result = change(config);
  sealServerSecrets(config);
  writeConnectorFile(config, file);
  return result;
}

/** Seal plain env values, headers and client secrets. Returns how many. */
export function sealServerSecrets(config) {
  let sealed = 0;
  const sealMap = (map) => {
    if (!plainObject(map)) return;
    for (const [key, value] of Object.entries(map)) {
      if (typeof value === 'string' && value && !isSealed(value)) {
        const next = sealSecret(value);
        if (next !== value) {
          map[key] = next;
          sealed += 1;
        }
      }
    }
  };
  for (const server of Object.values(config.mcpServers || {})) {
    if (!plainObject(server)) continue;
    sealMap(server.env);
    sealMap(server.headers);
    if (plainObject(server.oauth) && typeof server.oauth.clientSecret === 'string' && server.oauth.clientSecret && !isSealed(server.oauth.clientSecret)) {
      const next = sealSecret(server.oauth.clientSecret);
      if (next !== server.oauth.clientSecret) {
        server.oauth.clientSecret = next;
        sealed += 1;
      }
    }
  }
  return sealed;
}

/**
 * Seal anything a hand-edit left in plain text. Leaves an unreadable file
 * alone.
 */
export function sealConnectorFile(file = connectorConfigPath()) {
  const config = readConnectorFile(file);
  if (config._error) return 0;
  const sealed = sealServerSecrets(config);
  if (sealed) writeConnectorFile(config, file);
  return sealed;
}

/**
 * One saved server as the manager uses it, with secrets opened. Unknown or
 * broken fields fall back to safe defaults.
 */
export function normalizeServer(raw = {}) {
  const source = plainObject(raw) || {};
  const url = typeof source.url === 'string' ? source.url.trim() : '';
  const remote = Boolean(url);
  const type = String(source.type || source.transport || '').toLowerCase();
  const oauth = plainObject(source.oauth);
  const approved = plainObject(source.approvedDownload);
  return {
    kind: remote ? 'remote' : 'local',
    title: typeof source.title === 'string' && source.title.trim() ? source.title.trim().slice(0, 80) : null,
    catalogId: typeof source.catalogId === 'string' ? source.catalogId : null,
    disabled: Boolean(source.disabled),
    // Local program
    command: remote ? '' : String(source.command || '').trim(),
    args: remote ? [] : (Array.isArray(source.args) ? source.args.map((arg) => String(arg)) : []),
    env: remote ? {} : openMap(stringMap(source.env)),
    cwd: !remote && typeof source.cwd === 'string' && source.cwd.trim() ? source.cwd.trim() : null,
    approvedDownload: approved && typeof approved.spec === 'string'
      ? { spec: approved.spec, approvedAt: String(approved.approvedAt || '') }
      : null,
    // Remote server
    url,
    transport: remote && type === 'sse' ? 'sse' : 'http',
    headers: remote ? openMap(stringMap(source.headers)) : {},
    oauth: remote && oauth ? {
      clientId: typeof oauth.clientId === 'string' ? oauth.clientId.trim() : '',
      clientSecret: typeof oauth.clientSecret === 'string' ? openSecret(oauth.clientSecret) : '',
      scope: typeof oauth.scope === 'string' ? oauth.scope.trim() : '',
    } : null,
  };
}

/** What a running connection depends on: change any of it and it restarts. */
export function fingerprintOf(server) {
  const { title, catalogId, ...rest } = server;
  return JSON.stringify(rest);
}

export function maskMap(map) {
  return Object.fromEntries(Object.keys(map || {}).map((key) => [key, MASKED_VALUE]));
}

/**
 * Submitted key/value pairs, keeping the saved value for any key sent back
 * as MASKED_VALUE. Keys left out are removed.
 */
export function mergeMasked(current, submitted) {
  if (!plainObject(submitted)) return {};
  const stored = plainObject(current) || {};
  const out = {};
  for (const [rawKey, value] of Object.entries(submitted)) {
    const key = String(rawKey || '').trim();
    if (!key || value === null || value === undefined) continue;
    if (value === MASKED_VALUE) {
      if (Object.hasOwn(stored, key)) out[key] = stored[key];
      continue;
    }
    out[key] = String(value);
  }
  return out;
}

/**
 * Turn a request body into a saved server entry. `current` is the entry
 * already saved under this name (for masked values), or null.
 */
export function serverFromInput(input = {}, current = null) {
  const body = plainObject(input) || {};
  const saved = plainObject(current) || {};
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const entry = {};
  if (typeof body.title === 'string' && body.title.trim()) entry.title = body.title.trim().slice(0, 80);
  if (typeof body.catalogId === 'string' && body.catalogId) entry.catalogId = body.catalogId;

  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw Object.assign(new Error('That address isn\'t a valid URL.'), { status: 400 });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw Object.assign(new Error('Remote connectors need an http:// or https:// address.'), { status: 400 });
    }
    entry.url = parsed.href;
    entry.type = String(body.type || body.transport || '').toLowerCase() === 'sse' ? 'sse' : 'http';
    const headers = mergeMasked(saved.headers, body.headers);
    if (Object.keys(headers).length) entry.headers = headers;
    const oauth = plainObject(body.oauth);
    if (oauth && (oauth.clientId || oauth.scope)) {
      const savedOauth = plainObject(saved.oauth) || {};
      entry.oauth = {
        clientId: String(oauth.clientId || '').trim(),
        ...(oauth.clientSecret === MASKED_VALUE
          ? (savedOauth.clientSecret ? { clientSecret: savedOauth.clientSecret } : {})
          : (oauth.clientSecret ? { clientSecret: String(oauth.clientSecret) } : {})),
        ...(oauth.scope ? { scope: String(oauth.scope).trim() } : {}),
      };
    }
  } else {
    const command = String(body.command || '').trim();
    if (!command) throw Object.assign(new Error('Give the command that starts it, or a remote address.'), { status: 400 });
    entry.command = command;
    entry.args = Array.isArray(body.args) ? body.args.map((arg) => String(arg)) : [];
    const env = mergeMasked(saved.env, body.env);
    if (Object.keys(env).length) entry.env = env;
    if (typeof body.cwd === 'string' && body.cwd.trim()) entry.cwd = body.cwd.trim();
    // An approval stays only while it is for the same package.
    if (plainObject(saved.approvedDownload)) entry.approvedDownload = saved.approvedDownload;
  }
  if (body.disabled !== undefined ? body.disabled : saved.disabled) entry.disabled = true;
  return entry;
}
