/**
 * A channel between this backend and the desktop app that started it.
 *
 * The backend runs as its own process, so the desktop app (Electron main)
 * long-polls it for messages: notifications to show while the window is
 * closed, and commands for things only the desktop app can do. Replies and
 * desktop events (the laptop woke up, the app is quitting) come back as
 * POSTs. Everything goes through /api/host with a per-launch token, so web
 * pages and other local programs can't pose as the desktop app.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { runtimeDataPath } from '../config/runtimeConfig.js';

const HOST_SEEN_MS = 45_000;
const MAX_QUEUE = 500;

let token = null;
let launchToken = null; // from ASYNCAT_HOST_TOKEN, kept after it leaves the environment
let lastPollAt = 0;
let hostCapabilities = new Set();
const queue = [];
const waiters = new Set();
const pending = new Map();
const events = new EventEmitter();

/**
 * The token the desktop app must present. Electron passes one in
 * ASYNCAT_HOST_TOKEN when it starts the backend; when the backend was started
 * on its own (development), one is made and written to data/host-token, where
 * the desktop app reads it.
 */
export function hostToken() {
  if (token) return token;
  const fromEnv = String(process.env.ASYNCAT_HOST_TOKEN || '').trim();
  // The agent's commands inherit this process's environment; keep it out.
  delete process.env.ASYNCAT_HOST_TOKEN;
  if (fromEnv) launchToken = fromEnv;
  if (launchToken) {
    token = launchToken;
    return token;
  }
  token = crypto.randomBytes(32).toString('hex');
  try {
    const file = runtimeDataPath('host-token');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, token, { mode: 0o600 });
  } catch {
    // Without the file a separately started desktop app can't connect;
    // the backend works the same otherwise.
  }
  return token;
}

export function tokenMatches(candidate) {
  const expected = Buffer.from(hostToken());
  const given = Buffer.from(String(candidate || ''));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** True when the desktop app polled recently (and offers the capability). */
export function isHostConnected(capability = null) {
  if (Date.now() - lastPollAt > HOST_SEEN_MS) return false;
  return capability ? hostCapabilities.has(capability) : true;
}

function deliver() {
  for (const waiter of [...waiters]) {
    if (!queue.length) break;
    waiters.delete(waiter);
    waiter(queue.splice(0, queue.length));
  }
}

/** Queue a one-way message for the desktop app, e.g. a notification. */
export function sendToHost(type, payload = {}) {
  queue.push({ id: crypto.randomUUID(), type, payload, at: Date.now() });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  deliver();
}

/**
 * Ask the desktop app to do something and wait for its answer. Rejects at
 * once when no desktop app is connected.
 */
export function requestFromHost(type, payload = {}, { timeoutMs = 30_000, capability = null } = {}) {
  if (!isHostConnected(capability)) {
    return Promise.reject(new Error('The Asyncat desktop app is not connected.'));
  }
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`The desktop app did not answer "${type}" within ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    queue.push({ id, type, payload, at: Date.now(), expectsReply: true });
    deliver();
  });
}

/** Called by the poll route. Resolves with queued messages or [] after waitMs. */
export function waitForHostMessages({ waitMs = 25_000, capabilities = [] } = {}) {
  lastPollAt = Date.now();
  if (capabilities.length) hostCapabilities = new Set(capabilities);
  if (queue.length) return Promise.resolve(queue.splice(0, queue.length));
  return new Promise((resolve) => {
    const waiter = (messages) => {
      clearTimeout(timer);
      resolve(messages);
    };
    const timer = setTimeout(() => {
      waiters.delete(waiter);
      lastPollAt = Date.now();
      resolve([]);
    }, waitMs);
    waiters.add(waiter);
  });
}

/** Called by the reply route. */
export function settleHostRequest(id, { ok = true, result = null, error = null } = {}) {
  const entry = pending.get(id);
  if (!entry) return false;
  pending.delete(id);
  clearTimeout(entry.timer);
  if (ok) entry.resolve(result);
  else entry.reject(new Error(error || 'The desktop app could not do that.'));
  return true;
}

/** Events reported by the desktop app: power.resume, app.quit, ... */
export function onHostEvent(type, handler) {
  events.on(type, handler);
  return () => events.off(type, handler);
}

export function emitHostEvent(type, payload = {}) {
  events.emit(type, payload);
}

/** For tests. */
export function resetHostBridge() {
  token = null;
  lastPollAt = 0;
  hostCapabilities = new Set();
  queue.splice(0, queue.length);
  for (const waiter of waiters) waiter([]);
  waiters.clear();
  for (const [id, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(new Error('reset'));
    pending.delete(id);
  }
}
