// den/src/connectors/connectorAuth.js
// Sign-in for remote connectors: OAuth with PKCE, as MCP specifies. The MCP
// SDK finds the service's sign-in server, registers Asyncat with it and
// refreshes tokens; this keeps what it learns (the registered client and the
// tokens) sealed in the database. Signing in opens the service's page in the
// user's own browser, which sends them back to den's
// /api/connectors/oauth/callback with a one-time code.

import crypto from 'crypto';
import db from '../db/client.js';
import { sealSecret } from '../lib/secretBox.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS connector_oauth (
    name        TEXT PRIMARY KEY,
    server_url  TEXT NOT NULL,
    client_info TEXT,
    tokens      TEXT,
    updated_at  TEXT NOT NULL
  )
`);

const PENDING_TTL_MS = 15 * 60_000;
// Sign-ins waiting for the browser to come back: state → { name, provider, transport, createdAt }.
const pending = new Map();

export function oauthRedirectUrl(port = process.env.PORT || 8716) {
  return `http://127.0.0.1:${port}/api/connectors/oauth/callback`;
}

function parse(value) {
  try {
    return value ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

function readRow(name) {
  return db.prepare('SELECT * FROM connector_oauth WHERE name = ?').get(name) || null;
}

function writeRow(name, serverUrl, patch) {
  const row = readRow(name);
  const sameServer = row && row.server_url === serverUrl;
  const clientInfo = 'clientInfo' in patch ? patch.clientInfo : (sameServer ? parse(row.client_info) : undefined);
  const tokens = 'tokens' in patch ? patch.tokens : (sameServer ? parse(row.tokens) : undefined);
  db.prepare(`
    INSERT INTO connector_oauth (name, server_url, client_info, tokens, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      server_url = excluded.server_url,
      client_info = excluded.client_info,
      tokens = excluded.tokens,
      updated_at = excluded.updated_at
  `).run(
    name,
    serverUrl,
    clientInfo ? sealSecret(JSON.stringify(clientInfo)) : null,
    tokens ? sealSecret(JSON.stringify(tokens)) : null,
    new Date().toISOString(),
  );
}

/** What is saved for this connector at this address. */
export function savedAuth(name, serverUrl) {
  const row = readRow(name);
  if (!row || row.server_url !== serverUrl) return { clientInfo: undefined, tokens: undefined };
  return { clientInfo: parse(row.client_info), tokens: parse(row.tokens) };
}

export function isSignedIn(name, serverUrl) {
  return Boolean(savedAuth(name, serverUrl).tokens?.access_token);
}

/** Sign out: drop the tokens (and with `all`, the registered client too). */
export function forgetAuth(name, { all = false } = {}) {
  if (all) {
    db.prepare('DELETE FROM connector_oauth WHERE name = ?').run(name);
  } else {
    db.prepare('UPDATE connector_oauth SET tokens = NULL, updated_at = ? WHERE name = ?').run(new Date().toISOString(), name);
  }
  for (const [state, item] of pending) {
    if (item.name === name) pending.delete(state);
  }
}

function prunePending(now = Date.now()) {
  for (const [state, item] of pending) {
    if (now - item.createdAt > PENDING_TTL_MS) pending.delete(state);
  }
}

/** The sign-in a callback's `state` belongs to, once; null if unknown or stale. */
export function takePendingSignIn(state) {
  prunePending();
  const item = pending.get(String(state || ''));
  if (!item) return null;
  pending.delete(String(state));
  return item;
}

/**
 * The SDK's OAuthClientProvider for one connection attempt. `oauth` holds a
 * client ID (and secret) the user entered for services that don't let apps
 * register themselves.
 */
export class ConnectorAuthProvider {
  constructor({ name, serverUrl, oauth = null, redirectUrl = oauthRedirectUrl(), onAuthorizationUrl = null }) {
    this.name = name;
    this.serverUrl = serverUrl;
    this.oauth = oauth?.clientId ? oauth : null;
    this.scope = oauth?.scope || '';
    this._redirectUrl = redirectUrl;
    this.onAuthorizationUrl = onAuthorizationUrl;
    this.transport = null;
    this.verifier = null;
    this.authorizationUrl = null;
  }

  get redirectUrl() {
    return this._redirectUrl;
  }

  get clientMetadata() {
    return {
      client_name: 'Asyncat',
      client_uri: 'https://github.com/asyncat-oss/asyncat-oss',
      redirect_uris: [this._redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this.oauth?.clientSecret ? 'client_secret_post' : 'none',
      ...(this.scope ? { scope: this.scope } : {}),
    };
  }

  state() {
    return crypto.randomBytes(24).toString('base64url');
  }

  clientInformation() {
    if (this.oauth) {
      return { client_id: this.oauth.clientId, ...(this.oauth.clientSecret ? { client_secret: this.oauth.clientSecret } : {}) };
    }
    const info = savedAuth(this.name, this.serverUrl).clientInfo;
    // Registered for another address (den's port changed): register again.
    if (Array.isArray(info?.redirect_uris) && !info.redirect_uris.includes(this._redirectUrl)) return undefined;
    return info;
  }

  saveClientInformation(info) {
    if (!this.oauth) writeRow(this.name, this.serverUrl, { clientInfo: info });
  }

  tokens() {
    return savedAuth(this.name, this.serverUrl).tokens;
  }

  saveTokens(tokens) {
    writeRow(this.name, this.serverUrl, { tokens });
  }

  redirectToAuthorization(url) {
    const href = String(url?.href || url);
    this.authorizationUrl = href;
    const state = new URL(href).searchParams.get('state');
    if (state) {
      prunePending();
      pending.set(state, { name: this.name, provider: this, transport: this.transport, createdAt: Date.now() });
    }
    this.onAuthorizationUrl?.(href);
  }

  saveCodeVerifier(verifier) {
    this.verifier = verifier;
  }

  codeVerifier() {
    if (!this.verifier) throw new Error('No sign-in is in progress.');
    return this.verifier;
  }

  invalidateCredentials(scope) {
    if (scope === 'all') {
      if (!this.oauth) writeRow(this.name, this.serverUrl, { clientInfo: undefined, tokens: undefined });
      else writeRow(this.name, this.serverUrl, { tokens: undefined });
    } else if (scope === 'client') {
      if (!this.oauth) writeRow(this.name, this.serverUrl, { clientInfo: undefined });
    } else if (scope === 'tokens') {
      writeRow(this.name, this.serverUrl, { tokens: undefined });
    } else if (scope === 'verifier') {
      this.verifier = null;
    }
  }
}
