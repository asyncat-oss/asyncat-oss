// integrations/github/githubService.js
import db from '../../db/client.js';

const SCOPES = 'read:user repo';

function getRedirectUri() {
  return `${process.env.PUBLIC_URL || 'http://localhost:8716'}/api/integrations/github/callback`;
}

export function isConfigured() {
  return !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(code) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: getRedirectUri(),
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error_description || data.error);
  if (!data.access_token) throw new Error('No access token returned from GitHub');
  return data.access_token;
}

export async function getGitHubUser(accessToken) {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  if (!response.ok) throw new Error('Failed to fetch GitHub user profile');
  return response.json();
}

export function saveIntegration(userId, accessToken, login, email) {
  db.prepare(`
    INSERT INTO user_integrations (user_id, provider, access_token, email, metadata, updated_at)
    VALUES (?, 'github', ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, provider) DO UPDATE SET
      access_token = excluded.access_token,
      email        = excluded.email,
      metadata     = excluded.metadata,
      updated_at   = datetime('now')
  `).run(userId, accessToken, email || '', JSON.stringify({ login }));
}

export function deleteIntegration(userId) {
  db.prepare(
    `DELETE FROM user_integrations WHERE user_id = ? AND provider = 'github'`
  ).run(userId);
}

export function getIntegrationStatus(userId) {
  const row = db.prepare(
    `SELECT email, metadata FROM user_integrations WHERE user_id = ? AND provider = 'github'`
  ).get(userId);
  if (!row) return { connected: false };
  const meta = JSON.parse(row.metadata || '{}');
  return { connected: true, email: row.email, login: meta.login };
}

export async function revokeToken(userId) {
  const row = db.prepare(
    `SELECT access_token FROM user_integrations WHERE user_id = ? AND provider = 'github'`
  ).get(userId);
  if (!row?.access_token || !isConfigured()) return;

  // Best-effort: delete the token from GitHub's side
  try {
    const encoded = Buffer.from(
      `${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`
    ).toString('base64');
    await fetch(
      `https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${encoded}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: row.access_token }),
      }
    );
  } catch {
    // Revocation is best-effort; local deletion always happens.
  }
}
