// Plain words for connectors: their status, what they download, how their
// tools behave. Used by Settings → Connections → Connectors and the agent
// and Cat pickers.

import { formatBytes } from '../Models/engineProgress.js';

export const STATUS = {
  connected: { label: 'Connected', tone: 'green' },
  starting: { label: 'Starting…', tone: 'muted' },
  needs_sign_in: { label: 'Needs sign-in', tone: 'amber' },
  needs_download: { label: 'Needs your OK to download', tone: 'amber' },
  error: { label: "Couldn't connect", tone: 'red' },
  off: { label: 'Off', tone: 'muted' },
};

/** "Connected · 12 tools", "Off", "Needs sign-in"… */
export function statusLine(connector) {
  const status = STATUS[connector?.status] || STATUS.starting;
  if (connector?.status === 'connected') {
    const count = connector.toolCount || 0;
    return `${status.label} · ${count} ${count === 1 ? 'tool' : 'tools'}`;
  }
  return status.label;
}

/** Where it runs, in a few words. */
export function whereLine(connector) {
  if (!connector) return '';
  if (connector.kind === 'remote') {
    try {
      return new URL(connector.url).host;
    } catch {
      return connector.url || '';
    }
  }
  return [connector.command, ...(connector.args || [])].join(' ');
}

/** "up to about 12.4 MB (85 packages)" for an OK-to-download question. */
export function downloadSizeText(download) {
  if (!download) return '';
  if (download.bytes === null || download.bytes === undefined) return 'an unknown amount';
  const size = `${download.approximate ? 'up to about ' : ''}${formatBytes(download.bytes)}`;
  if (download.shallow) {
    const deps = download.dependencies || 0;
    return deps ? `${size} for the package itself, plus ${deps} ${deps === 1 ? 'package' : 'packages'} it needs` : size;
  }
  if (download.ownFilesOnly) return `${size}, plus the packages it needs`;
  if (download.packages > 1) return `${size} (${download.packages} packages)`;
  return size;
}

export const PERMISSION_TEXT = {
  safe: 'Only reads',
  moderate: 'Adds things',
  dangerous: 'Can change or delete',
};

/** Split a typed command line into the program and its arguments, keeping quoted parts together. */
export function splitCommand(text) {
  const parts = [];
  let current = '';
  let quote = null;
  let started = false;
  for (const ch of String(text || '')) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started || current) parts.push(current);
      current = '';
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }
  if (started || current) parts.push(current);
  return { command: parts[0] || '', args: parts.slice(1) };
}

/** The reverse of splitCommand, quoting arguments with spaces. */
export function joinCommand(command, args = []) {
  return [command, ...args].filter((part) => part !== undefined && part !== null)
    .map((part) => (/[\s"']/.test(part) || part === '' ? `"${String(part).replace(/"/g, '\\"')}"` : part))
    .join(' ');
}

/** Rows of KEY=value text → { KEY: value }. */
export function parsePairs(text, separator = '=') {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const at = line.indexOf(separator);
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    if (key) out[key] = line.slice(at + separator.length).trim();
  }
  return out;
}

export function pairsText(map, separator = '=') {
  return Object.entries(map || {}).map(([key, value]) => `${key}${separator}${value}`).join('\n');
}

function customTitle(connector) {
  return connector?.title && connector.title !== connector.name ? connector.title : '';
}

/** Form values for a remote connector (new, or one being edited). */
export function remoteFormFrom(connector = null) {
  return {
    url: connector?.url || '',
    title: customTitle(connector),
    transport: connector?.transport || 'http',
    headersText: pairsText(connector?.headers, ': '),
    clientId: connector?.oauth?.clientId || '',
    clientSecret: connector?.oauth?.clientSecret || '',
    scope: connector?.oauth?.scope || '',
  };
}

export function remotePayload(form) {
  const payload = { url: form.url.trim(), type: form.transport, headers: parsePairs(form.headersText, ':') };
  if (form.title.trim()) payload.title = form.title.trim();
  if (form.clientId.trim() || form.scope.trim()) {
    payload.oauth = { clientId: form.clientId.trim(), clientSecret: form.clientSecret, scope: form.scope.trim() };
  }
  return payload;
}

/** Form values for a local program (new, or one being edited). */
export function localFormFrom(connector = null) {
  return {
    commandLine: connector ? joinCommand(connector.command, connector.args) : '',
    title: customTitle(connector),
    envText: pairsText(connector?.env),
    cwd: connector?.cwd || '',
  };
}

export function localPayload(form) {
  const { command, args } = splitCommand(form.commandLine);
  const payload = { command, args, env: parsePairs(form.envText) };
  if (form.cwd.trim()) payload.cwd = form.cwd.trim();
  if (form.title.trim()) payload.title = form.title.trim();
  return payload;
}

/**
 * A connector tool's name (mcp__<connector>__<tool>) in parts:
 * { connector: 'Team notes', tool: 'search' }, or null for other tools.
 */
export function connectorToolParts(name) {
  const match = /^mcp__(.+?)__(.+)$/.exec(String(name || ''));
  if (!match) return null;
  const connector = match[1].replace(/_/g, ' ');
  return { connector: `${connector.charAt(0).toUpperCase()}${connector.slice(1)}`, tool: match[2] };
}

/** "Team notes · search" for a connector tool, or null. */
export function connectorToolLabel(name) {
  const parts = connectorToolParts(name);
  return parts ? `${parts.connector} · ${parts.tool}` : null;
}
