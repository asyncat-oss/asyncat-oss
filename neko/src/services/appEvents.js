// neko/src/services/appEvents.js
// ─── Live updates from the backend ───────────────────────────────────────────
// One connection per window to GET /api/events (Server-Sent Events), shared by
// every screen that wants to know when something changed on the server: a chat
// a scheduled run or a Cat wrote to, a Cat's inbox, a connector's status.

const EVENTS_URL = `${import.meta.env.VITE_MAIN_URL}/api/events`;

/** This window's id. Saves carry it so a window can skip its own events. */
export const CLIENT_ID = (() => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* fall through */ }
  return `window_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
})();

const listeners = new Map(); // type ('*' for all) → Set of handlers
let source = null;
let dropped = false;

function dispatch(event) {
  for (const key of [event.type, '*']) {
    for (const handler of listeners.get(key) || []) {
      try {
        handler(event);
      } catch (error) {
        console.warn(`[events] ${event.type} handler failed:`, error);
      }
    }
  }
}

function connect() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource(EVENTS_URL);
  source.onmessage = (message) => {
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    if (event?.type) dispatch(event);
  };
  source.onopen = () => {
    // Events sent while the connection was down are lost: tell screens to
    // look again.
    if (dropped) dispatch({ type: 'events.reconnected', data: {} });
    dropped = false;
  };
  source.onerror = () => {
    // EventSource reconnects by itself.
    dropped = true;
  };
}

/**
 * Call `handler(event)` for each event of `type` ('*' for every event).
 * Returns a function that stops it.
 */
export function subscribeAppEvent(type, handler) {
  connect();
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(handler);
  return () => listeners.get(type)?.delete(handler);
}
