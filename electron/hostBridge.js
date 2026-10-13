// electron/hostBridge.js
// ─── The desktop side of the backend ↔ desktop channel ───────────────────────
// The backend (den) can't call into Electron directly, so this long-polls
// /api/host/next for messages: notifications to show while the window is
// closed, and requests only the desktop app can serve (registered with
// registerHostHandler). Desktop events such as waking from sleep go the other
// way with postHostEvent. See den/src/lib/hostBridge.js.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BACKEND_URL, DEN_CWD } from './constants.js';

const handlers = new Map();
let running = false;
let launchToken = null;
let readToken = null;

/** A token for a backend this app starts; passed to it in ASYNCAT_HOST_TOKEN. */
export function createLaunchToken() {
  launchToken = crypto.randomBytes(32).toString('hex');
  return launchToken;
}

function currentToken() {
  if (launchToken) return launchToken;
  // A backend started separately (npm run electron:dev) writes its token here.
  try {
    readToken = fs.readFileSync(path.join(DEN_CWD, 'data', 'host-token'), 'utf8').trim();
  } catch {
    readToken = null;
  }
  return readToken;
}

/** Handle messages of one type. For requests, the return value is the reply. */
export function registerHostHandler(type, handler) {
  handlers.set(type, handler);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function hostFetch(pathname, init = {}) {
  const token = currentToken();
  if (!token) throw new Error('no host token yet');
  return fetch(`${BACKEND_URL}/api/host${pathname}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-asyncat-host-token': token, ...(init.headers || {}) },
  });
}

async function reply(id, body) {
  try {
    await hostFetch(`/reply/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(body) });
  } catch (err) {
    console.warn('[Asyncat] Host bridge reply failed:', err.message);
  }
}

async function handleMessage(message) {
  const handler = handlers.get(message.type);
  if (!message.expectsReply) {
    if (!handler) return;
    try { await handler(message.payload || {}); } catch (err) {
      console.warn(`[Asyncat] Host message ${message.type} failed:`, err.message);
    }
    return;
  }
  if (!handler) {
    await reply(message.id, { ok: false, error: `The desktop app can't do "${message.type}".` });
    return;
  }
  try {
    const result = await handler(message.payload || {});
    await reply(message.id, { ok: true, result: result ?? null });
  } catch (err) {
    await reply(message.id, { ok: false, error: err?.message || String(err) });
  }
}

/** Start polling. Safe to call again; only one loop runs. */
export function startHostBridge() {
  if (running) return;
  running = true;
  (async () => {
    while (running) {
      try {
        const capabilities = [...handlers.keys()].map((type) => type.split('.')[0]);
        const res = await hostFetch(`/next?wait=25&capabilities=${encodeURIComponent([...new Set(capabilities)].join(','))}`);
        if (!res.ok) {
          await sleep(res.status === 401 ? 3000 : 2000);
          continue;
        }
        const { messages = [] } = await res.json();
        // Requests can take a while (a page load); don't hold up the next poll.
        for (const message of messages) handleMessage(message);
      } catch {
        await sleep(2000);
      }
    }
  })();
}

export function stopHostBridge() {
  running = false;
}

/** Tell the backend about something that happened on the desktop. */
export async function postHostEvent(type, payload = {}) {
  try {
    await hostFetch('/event', { method: 'POST', body: JSON.stringify({ type, payload }) });
  } catch (err) {
    console.warn(`[Asyncat] Host event ${type} not delivered:`, err.message);
  }
}
