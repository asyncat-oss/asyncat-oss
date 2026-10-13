// electron/browserPolicy.js
// ─── Rules for the built-in browser ───────────────────────────────────────────
// Pure functions (no Electron imports) so they can be tested with node:test:
// which addresses tabs may load, how new windows open, how the panel's
// position maps to a view, and how key names map to keyboard events.

export const STANDARD_PARTITION = 'persist:asyncat-web';
export const INCOGNITO_PREFIX = 'asyncat-web-incognito-';
const PRIVATE_PARTITION = 'asyncat-web-private';
// Each Cat browses in a profile of its own, kept across restarts, so the
// sites it signs in to aren't shared with other Cats or the user's tabs.
export const CAT_PARTITION_PREFIX = 'persist:asyncat-cat-';

// Paths on the backend's port that web pages may load: project site
// previews and raw project files. Everything else there is the API.
export const BACKEND_PAGE_PATHS = ['/api/files/site/', '/api/files/raw', '/files/'];

export function isAllowedBrowserPartition(partition) {
  const value = String(partition || '');
  return value === STANDARD_PARTITION
    || value === PRIVATE_PARTITION
    || new RegExp(`^${INCOGNITO_PREFIX}[a-zA-Z0-9-]{8,120}$`).test(value)
    || isCatPartition(value);
}

export function isCatPartition(partition) {
  return /^persist:asyncat-cat-[A-Za-z0-9-]{8,80}$/.test(String(partition || ''));
}

/**
 * Is `rawUrl` on a Cat's list of sites? "example.com" covers its subdomains;
 * an empty list allows every site. Mirrors den/src/cats/catSites.js.
 */
export function siteOnList(rawUrl, sites = []) {
  if (!Array.isArray(sites) || sites.length === 0) return true;
  let host;
  try { host = new URL(rawUrl).hostname.toLowerCase(); } catch { return false; }
  return sites.some((site) => {
    const bare = String(site || '').toLowerCase().replace(/^\*\./, '');
    return Boolean(bare) && (host === bare || host.endsWith(`.${bare}`));
  });
}

function stripBrackets(host) {
  return String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
}

export function isLoopbackHost(hostname) {
  const host = stripBrackets(hostname);
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1'
    || /^127\./.test(host) || host === '0.0.0.0' || host === '::ffff:127.0.0.1';
}

function portOf(url) {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

/**
 * True for Asyncat's own interface and API. Loaded in a browser tab, the
 * interface would run with the app's own origin, so it is never shown there.
 */
export function isAsyncatInternalUrl(url, { frontendPort, backendPort }) {
  if (!isLoopbackHost(url.hostname)) return false;
  const port = portOf(url);
  if (port === Number(frontendPort)) return true;
  if (port === Number(backendPort)) return !BACKEND_PAGE_PATHS.some((prefix) => url.pathname.startsWith(prefix));
  return false;
}

/**
 * May a tab load this address? http(s) only (never Asyncat itself), plus
 * about:blank and, when the user opens one from a chat, an HTML data: page.
 */
export function isAllowedBrowserUrl(value, { ports, allowBlank = true, allowHtmlData = false } = {}) {
  const raw = String(value || '');
  if (allowBlank && raw === 'about:blank') return true;
  if (allowHtmlData && /^data:text\/html[;,]/i.test(raw)) return true;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return !isAsyncatInternalUrl(url, ports);
  } catch {
    return false;
  }
}

/** loopback | private | link-local | unspecified | multicast | public | name */
export function classifyHost(hostname) {
  let host = stripBrackets(hostname);
  if (host.startsWith('::ffff:') && /^\d+\.\d+\.\d+\.\d+$/.test(host.slice(7))) host = host.slice(7);
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127) return 'loopback';
    if (a === 0) return 'unspecified';
    if (a === 169 && b === 254) return 'link-local';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'private';
    if (a >= 224) return 'multicast';
    return 'public';
  }
  if (host.includes(':')) {
    if (host === '::1') return 'loopback';
    if (host === '::') return 'unspecified';
    if (/^fe[89ab]/.test(host)) return 'link-local';
    if (/^f[cd]/.test(host)) return 'private';
    if (host.startsWith('ff')) return 'multicast';
    return 'public';
  }
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback';
  return 'name';
}

/**
 * Extra limits for tabs the agent drives, mirroring den's checkAgentUrl for
 * the requests it can't see (redirects, links the page follows): no
 * link-local or reserved addresses, and none of Asyncat's own ports.
 * Hostnames that resolve to such addresses are checked by den before the
 * agent navigates; this is the literal-address backstop.
 */
export function agentRequestBlockReason(rawUrl, { ports, extraPorts = [] } = {}) {
  let url;
  try { url = new URL(String(rawUrl || '')); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const kind = classifyHost(url.hostname);
  if (kind === 'link-local' || kind === 'unspecified' || kind === 'multicast') {
    return `${url.hostname} is a link-local or reserved address.`;
  }
  if (kind === 'loopback') {
    const port = portOf(url);
    const sitePreview = port === Number(ports?.backendPort) && url.pathname.startsWith('/api/files/site/');
    const asyncatPorts = new Set([ports?.frontendPort, ports?.backendPort, ...extraPorts].filter(Boolean).map(Number));
    if (asyncatPorts.has(port) && !sitePreview) return `Port ${port} on this computer belongs to Asyncat.`;
  }
  return null;
}

/**
 * How a page's request for a new window is handled:
 *   'deny'     — not an address tabs may load
 *   'popup'    — window.open with size or position features: a real child
 *                window in the same session, so window.opener keeps working
 *                (sign-in and payment pop-ups)
 *   'tab'      — links with target=_blank and window.open without features
 *                (Electron reports both the same way): a new tab that keeps
 *                its opener, so flows that use one still work
 *   'external' — the user chose to open links in the system browser
 */
export function windowOpenDecision({ url, disposition, openLinks = 'internal', ports } = {}) {
  const target = String(url || '');
  if (target !== '' && target !== 'about:blank' && !isAllowedBrowserUrl(target, { ports, allowBlank: false })) return 'deny';
  if (disposition === 'save-to-disk') return 'deny';
  if (disposition === 'new-window') return 'popup';
  if (target === '' || target === 'about:blank') return 'tab';
  if (openLinks === 'system' && (disposition === 'foreground-tab' || disposition === 'background-tab')) return 'external';
  return 'tab';
}

/** Panel rectangle (CSS pixels) → view bounds (window DIPs), or null. */
export function viewBoundsFromRect(rect, zoomFactor = 1) {
  if (!rect) return null;
  const zoom = Number(zoomFactor) > 0 ? Number(zoomFactor) : 1;
  const x = Math.round(Number(rect.x) * zoom);
  const y = Math.round(Number(rect.y) * zoom);
  const width = Math.round(Number(rect.width) * zoom);
  const height = Math.round(Number(rect.height) * zoom);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width < 2 || height < 2) return null;
  return { x: Math.max(0, x), y: Math.max(0, y), width, height };
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const NAMED_KEYS = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  return: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
};
for (let n = 1; n <= 12; n++) NAMED_KEYS[`f${n}`] = { key: `F${n}`, code: `F${n}`, keyCode: 111 + n };

const MODIFIERS = { alt: 1, option: 1, control: 2, ctrl: 2, meta: 4, cmd: 4, command: 4, super: 4, shift: 8 };

// macOS only edits text through these commands; the key alone does nothing.
const MAC_COMMANDS = { a: 'selectAll', c: 'copy', v: 'paste', x: 'cut', z: 'undo' };

function charKey(ch, shift) {
  const upper = ch.toUpperCase();
  if (/^[a-z]$/i.test(ch)) {
    return { key: shift ? upper : ch.toLowerCase(), code: `Key${upper}`, keyCode: upper.charCodeAt(0), text: shift ? upper : ch.toLowerCase() };
  }
  if (/^[0-9]$/.test(ch)) return { key: ch, code: `Digit${ch}`, keyCode: ch.charCodeAt(0), text: ch };
  return { key: ch, code: '', keyCode: 0, text: ch };
}

/**
 * "Enter", "Shift+Tab", "Control+a", "Meta+Enter" → the events to send.
 * Returns null for an unknown key name.
 */
export function parseKeyCombo(combo, { platform = process.platform } = {}) {
  const raw = String(combo || '').trim();
  if (!raw) return null;
  const parts = raw === '+' ? ['+'] : raw.split('+').map((part) => part.trim()).filter(Boolean);
  if (raw.endsWith('++')) parts.push('+');
  let modifiers = 0;
  let keyName = null;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (MODIFIERS[lower] && parts.length > 1 && part !== parts[parts.length - 1]) modifiers |= MODIFIERS[lower];
    else keyName = part;
  }
  if (!keyName) return null;
  const shift = Boolean(modifiers & 8);
  const named = NAMED_KEYS[keyName.toLowerCase()];
  let key;
  if (named) key = { ...named };
  else if ([...keyName].length === 1) key = charKey(keyName, shift);
  else return null;
  // With Ctrl, Alt or Meta held a key is a shortcut, not typed text.
  if (modifiers & (1 | 2 | 4)) delete key.text;
  const result = { ...key, modifiers };
  if (platform === 'darwin' && (modifiers & 4) && MAC_COMMANDS[String(key.key).toLowerCase()]) {
    result.commands = [MAC_COMMANDS[String(key.key).toLowerCase()]];
  }
  return result;
}
