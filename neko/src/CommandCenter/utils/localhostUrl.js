// Finds the address of a dev server the agent started, in command output, so
// the built-in browser can open it.
//
// Only clear announcements count: a localhost URL, "port 3000", "listening on
// :8080", "0.0.0.0:8000". A bare ":1047" is not enough; stack traces are full
// of those (file.js:1047:25).

const EXPLICIT_URL = /https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}(?:\/[^\s,)'"]*)?/;
const VITE_LOCAL = /Local:\s+(https?:\/\/localhost:\d+)/;
const PORT_WORD = /\bport\b\s*[:=]?\s*(\d{2,5})\b/i;
const LISTENING_ON = /\b(?:listening|serving|running|available|started)\s+(?:on|at)\s+(?:port\s+)?:?(\d{4,5})\b/i;
const ANY_ADDRESS = /(?:0\.0\.0\.0|\[::\]):(\d{2,5})\b/;

export function extractLocalhostUrl(text = '') {
  if (!text || typeof text !== 'string') return null;
  const explicit = text.match(EXPLICIT_URL);
  if (explicit) return explicit[0].replace(/[,.)'"]+$/, '');
  const vite = text.match(VITE_LOCAL);
  if (vite) return vite[1];
  for (const pattern of [PORT_WORD, LISTENING_ON, ANY_ADDRESS]) {
    const match = text.match(pattern);
    const port = match ? Number(match[1]) : 0;
    if (port >= 80 && port <= 65535) return `http://localhost:${port}`;
  }
  return null;
}
