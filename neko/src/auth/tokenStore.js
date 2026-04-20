// auth/tokenStore.js — JWT token storage + no-op realtime shim (local build)
const TOKEN_KEY = 'asyncat_token';

export const getToken   = () => localStorage.getItem(TOKEN_KEY);
export const setToken   = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// ── No-op channel (presence / realtime) ───────────────────────────────────────
// Returns a chainable stub so presence hooks compile and run without crashing.
// All subscriptions are silently ignored in the local build.
const noopChannel = () => {
  const ch = {
    on:           ()  => ch,
    subscribe:    (cb) => { if (cb) cb('CLOSED'); return ch; },
    unsubscribe:  async () => {},
    track:        async () => 'ok',
    untrack:      async () => {},
    send:         async () => {},
    presenceState: () => ({}),
  };
  return ch;
};

// ── No-op realtime shim ────────────────────────────────────────────────────────
// Presence hooks import { supabase } from this file. In the local build these
// channels do nothing — all realtime is silently dropped.
export const supabase = {
  channel: noopChannel,
  removeChannel: () => {},
};