// integrations/outlook/outlookService.js
import db from '../../db/client.js';

const TENANT = 'common';
const BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
const SCOPES = 'openid email profile Calendars.Read offline_access';

function getRedirectUri() {
  return `${process.env.PUBLIC_URL || 'http://localhost:8716'}/api/integrations/outlook/callback`;
}

export function isConfigured() {
  return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    state,
    response_mode: 'query',
    prompt: 'select_account',
  });
  return `${BASE}/authorize?${params.toString()}`;
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    code,
    redirect_uri: getRedirectUri(),
    grant_type: 'authorization_code',
    scope: SCOPES,
  });

  const response = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data;
}

export async function getMicrosoftUser(accessToken) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Failed to fetch Microsoft user profile');
  return response.json();
}

export async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    scope: SCOPES,
  });

  const response = await fetch(`${BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data;
}

export function saveIntegration(userId, tokens, email) {
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  db.prepare(`
    INSERT INTO user_integrations
      (user_id, provider, access_token, refresh_token, expires_at, scope, email, updated_at)
    VALUES (?, 'outlook', ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, provider) DO UPDATE SET
      access_token  = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at    = excluded.expires_at,
      scope         = excluded.scope,
      email         = excluded.email,
      updated_at    = datetime('now')
  `).run(
    userId,
    tokens.access_token,
    tokens.refresh_token || null,
    expiresAt,
    tokens.scope || '',
    email || ''
  );
}

export function deleteIntegration(userId) {
  db.prepare(
    `DELETE FROM user_integrations WHERE user_id = ? AND provider = 'outlook'`
  ).run(userId);
}

export function getIntegrationStatus(userId) {
  const row = db.prepare(
    `SELECT email FROM user_integrations WHERE user_id = ? AND provider = 'outlook'`
  ).get(userId);
  if (!row) return { connected: false };
  return { connected: true, email: row.email };
}

export async function getValidAccessToken(userId) {
  const row = db.prepare(
    `SELECT access_token, refresh_token, expires_at
     FROM user_integrations WHERE user_id = ? AND provider = 'outlook'`
  ).get(userId);
  if (!row) throw new Error('Outlook not connected');

  const isExpired = row.expires_at && new Date(row.expires_at) < new Date(Date.now() + 60_000);
  if (!isExpired) return row.access_token;

  if (!row.refresh_token) throw new Error('Outlook token expired and no refresh token available');

  const tokens = await refreshAccessToken(row.refresh_token);
  const email = (await getMicrosoftUser(tokens.access_token)).mail || '';
  saveIntegration(userId, tokens, email);
  return tokens.access_token;
}
