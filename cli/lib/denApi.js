import { readEnv } from './env.js';

let _token = null;

function getDenConfig() {
  const env = readEnv('den/.env');
  return {
    port:     env['PORT']          || '8716',
    email:    env['SOLO_EMAIL']    || 'admin@local',
    password: env['SOLO_PASSWORD'] || 'changeme',
  };
}

export function getBase() {
  const { port } = getDenConfig();
  return `http://localhost:${port}`;
}

export function clearToken() { _token = null; }

export async function getToken(forceRefresh = false) {
  if (_token && !forceRefresh) return _token;

  const { port, email, password } = getDenConfig();
  const base = `http://localhost:${port}`;

  let res;
  try {
    res = await fetch(`${base}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
      signal:  AbortSignal.timeout(5000),
    });
  } catch (_) {
    throw new Error(`Cannot reach backend at ${base} — run \x1b[36mstart\x1b[0m first`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Auth failed (${res.status}): ${text.slice(0, 120)}`);
  }

  const data = await res.json();
  _token = data.token;
  if (!_token) throw new Error('Auth response missing token');
  return _token;
}

export async function apiGet(path) {
  const base  = getBase();
  const token = await getToken();
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

export async function apiPost(path, body) {
  const base  = getBase();
  const token = await getToken();
  const res = await fetch(`${base}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json();
}

export async function apiDelete(path) {
  const base  = getBase();
  const token = await getToken();
  const res = await fetch(`${base}${path}`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    signal:  AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return res.json().catch(() => ({}));
}

export async function apiGetNoTimeout(path) {
  const base  = getBase();
  const token = await getToken();
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

// Stream SSE from den. onEvent receives each parsed JSON event object.
export async function streamPost(path, body, onEvent) {
  const base  = getBase();
  const token = await getToken();

  const res = await fetch(`${base}${path}`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
      Accept:         'text/event-stream',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`STREAM ${path} → ${res.status}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }
      await onEvent(event);
    }
  }
}
