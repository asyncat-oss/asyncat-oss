// integrations/google/googleCalendarService.js
// Google OAuth 2.0 + Calendar API service.
// Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.
// Redirect URI must be registered in Google Cloud Console as:
//   http://localhost:8716/api/integrations/google/callback

import { google } from 'googleapis';
import db from '../../db/client.js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getRedirectUri() {
  return `${process.env.PUBLIC_URL || 'http://localhost:8716'}/api/integrations/google/callback`;
}

// Read credentials from process.env each call so UI-saved values take effect immediately.
export const isConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
}

export function getAuthUrl(state = '') {
  const oauth2 = createOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state,
  });
}

export async function exchangeCode(code) {
  const oauth2 = createOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

export async function getConnectedEmail(tokens) {
  const oauth2 = createOAuthClient();
  oauth2.setCredentials(tokens);
  const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
  const { data } = await oauth2Api.userinfo.get();
  return data.email || null;
}

export async function refreshTokensIfNeeded(userId) {
  const row = db.prepare(
    'SELECT * FROM user_integrations WHERE user_id = ? AND provider = ?'
  ).get(userId, 'google_calendar');

  if (!row) return null;

  const oauth2 = createOAuthClient();
  oauth2.setCredentials({
    access_token:  row.access_token,
    refresh_token: row.refresh_token,
    expiry_date:   row.expires_at ? new Date(row.expires_at).getTime() : undefined,
  });

  // googleapis auto-refreshes when expiry_date is set and token is expired
  const { token } = await oauth2.getAccessToken();
  const creds = oauth2.credentials;

  // Persist if refreshed
  if (creds.access_token !== row.access_token) {
    db.prepare(`
      UPDATE user_integrations
      SET access_token = ?, expires_at = ?, updated_at = datetime('now')
      WHERE user_id = ? AND provider = ?
    `).run(
      creds.access_token,
      creds.expiry_date ? new Date(creds.expiry_date).toISOString() : null,
      userId,
      'google_calendar'
    );
  }

  return oauth2;
}

export function saveIntegration(userId, tokens, email) {
  const existing = db.prepare(
    'SELECT id FROM user_integrations WHERE user_id = ? AND provider = ?'
  ).get(userId, 'google_calendar');

  if (existing) {
    db.prepare(`
      UPDATE user_integrations
      SET access_token = ?, refresh_token = ?, expires_at = ?,
          scope = ?, email = ?, updated_at = datetime('now')
      WHERE user_id = ? AND provider = ?
    `).run(
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      tokens.scope || null,
      email,
      userId,
      'google_calendar'
    );
  } else {
    db.prepare(`
      INSERT INTO user_integrations
        (user_id, provider, access_token, refresh_token, expires_at, scope, email)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      'google_calendar',
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      tokens.scope || null,
      email
    );
  }
}

export function deleteIntegration(userId) {
  db.prepare(
    'DELETE FROM user_integrations WHERE user_id = ? AND provider = ?'
  ).run(userId, 'google_calendar');
}

export function getIntegrationStatus(userId) {
  const row = db.prepare(
    'SELECT provider, email, scope, connected_at, updated_at FROM user_integrations WHERE user_id = ? AND provider = ?'
  ).get(userId, 'google_calendar');

  return row
    ? { connected: true, email: row.email, scope: row.scope, connectedAt: row.connected_at }
    : { connected: false };
}

export async function revokeToken(userId) {
  const row = db.prepare(
    'SELECT access_token FROM user_integrations WHERE user_id = ? AND provider = ?'
  ).get(userId, 'google_calendar');

  if (row?.access_token) {
    try {
      const oauth2 = createOAuthClient();
      await oauth2.revokeToken(row.access_token);
    } catch {
      // Revocation best-effort — delete locally regardless
    }
  }
}
