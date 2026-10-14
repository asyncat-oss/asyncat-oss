// den/src/agent/tools/urlPolicy.js
// ─── Where the agent's web tools may go ──────────────────────────────────────
// Web tools run without asking, and the text they return can carry
// instructions from whoever wrote the page. So the addresses they may reach
// are limited: http and https only (file:// would read any file on disk), and
// never Asyncat's own servers (its API can run tools) or link-local addresses
// such as the 169.254.169.254 cloud metadata service. Hostnames are resolved
// first, so a name that points at 127.0.0.1 is treated like 127.0.0.1, and
// every redirect is checked again.
//
// Other localhost ports stay reachable: previewing a project's own dev
// server is a normal thing to ask for, and so are project site previews
// that the backend serves under /api/files/site/.

import dns from 'dns/promises';
import net from 'net';
import { currentScheduledRun, runInScheduledContext } from '../scheduledRunContext.js';
import { describeSites, siteAllowed } from '../../cats/catSites.js';
import { siteBlocked } from '../../privacy/blockedSites.js';

/** Ports used by Asyncat itself and the local model servers it starts. */
export function asyncatPorts(env = process.env) {
  const ports = [
    env.PORT || 8716,
    env.ASYNCAT_FRONTEND_PORT || 8717,
    env.LLAMA_SERVER_PORT || 8765,
    env.MLX_SERVER_PORT,
    env.WHISPER_SERVER_PORT,
    env.TTS_SERVER_PORT,
  ];
  for (const url of [env.FRONTEND_URL, env.PUBLIC_URL]) {
    try {
      const parsed = new URL(url);
      ports.push(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    } catch { /* not set */ }
  }
  return new Set(ports.filter(Boolean).map(Number).filter(Number.isInteger));
}

function ipv4Parts(ip) {
  return ip.split('.').map(Number);
}

/** loopback | private | link-local | unspecified | multicast | public */
export function classifyAddress(address) {
  let ip = String(address || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (ip.startsWith('::ffff:') && net.isIPv4(ip.slice(7))) ip = ip.slice(7);
  if (net.isIPv4(ip)) {
    const [a, b] = ipv4Parts(ip);
    if (a === 127) return 'loopback';
    if (a === 0) return 'unspecified';
    if (a === 169 && b === 254) return 'link-local';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'private';
    if (a >= 224) return 'multicast';
    return 'public';
  }
  if (net.isIPv6(ip)) {
    if (ip === '::1') return 'loopback';
    if (ip === '::') return 'unspecified';
    if (/^fe[89ab]/.test(ip)) return 'link-local';
    if (/^f[cd]/.test(ip)) return 'private';
    if (ip.startsWith('ff')) return 'multicast';
    return 'public';
  }
  return 'unknown';
}

const BLOCKED_KINDS = new Set(['link-local', 'unspecified', 'multicast']);

function portOf(url) {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

async function resolveAll(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return [host];
  if (host === 'localhost' || host.endsWith('.localhost')) return ['127.0.0.1'];
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    return records.map((r) => r.address);
  } catch {
    // Unresolvable names fail later in the request itself.
    return [];
  }
}

/**
 * Check a URL the agent wants to open. Resolves to { ok, url, kind } or
 * { ok: false, reason }.
 */
export async function checkAgentUrl(rawUrl, { env = process.env } = {}) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    return { ok: false, reason: `Not a valid web address: ${rawUrl}` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `Only http and https addresses can be opened, not ${url.protocol}` };
  }
  // A Cat keeps to the sites on its list (Cats page → Freedom).
  const sites = currentScheduledRun()?.allowedSites;
  if (Array.isArray(sites) && sites.length && !siteAllowed(url.href, sites)) {
    return { ok: false, reason: `${url.hostname} isn't on this Cat's list of sites (${describeSites(sites)}). Ask the user to add it if it's needed.` };
  }
  // Sites the user told every agent to keep away from (Settings → Privacy & safety).
  if (siteBlocked(url.href)) {
    return { ok: false, reason: `The user has asked agents never to open ${url.hostname}. Don't try another way in; tell them if it's needed.` };
  }
  const addresses = await resolveAll(url.hostname);
  const kinds = addresses.map(classifyAddress);
  if (kinds.some((kind) => BLOCKED_KINDS.has(kind))) {
    return { ok: false, reason: `${url.hostname} is a link-local or reserved address, which the agent may not open.` };
  }
  const sitePreview = Number(env.PORT || 8716) === portOf(url) && url.pathname.startsWith('/api/files/site/');
  if (kinds.includes('loopback') && asyncatPorts(env).has(portOf(url)) && !sitePreview) {
    return { ok: false, reason: `Port ${portOf(url)} on this computer belongs to Asyncat itself, which the agent may not open.` };
  }
  const kind = kinds.includes('loopback') ? 'loopback' : kinds.includes('private') ? 'private' : 'public';
  return { ok: true, url: url.href, kind };
}

/**
 * fetch() for agent tools: checks the address, then follows redirects by
 * hand so every hop is checked too.
 */
export async function agentFetch(rawUrl, init = {}, { maxRedirects = 5 } = {}) {
  let current = rawUrl;
  let options = { ...init, redirect: 'manual' };
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await checkAgentUrl(current);
    if (!check.ok) throw new Error(check.reason);
    const res = await fetch(check.url, options);
    if (res.status < 300 || res.status >= 400 || !res.headers.get('location')) {
      Object.defineProperty(res, 'finalUrl', { value: check.url });
      return res;
    }
    current = new URL(res.headers.get('location'), check.url).href;
    // A 303, or a 301/302 after POST, continues as GET without a body.
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && options.method && options.method !== 'GET' && options.method !== 'HEAD')) {
      options = { ...options, method: 'GET', body: undefined };
    }
  }
  throw new Error(`Too many redirects from ${rawUrl}`);
}

/**
 * Make a Puppeteer page refuse every request (page loads, redirects,
 * images, fetches) that the agent could not open directly. Requests arrive
 * outside the run that opened the page, so a Cat's run is passed in
 * (scheduledRun() returns it) to keep the page to the Cat's sites.
 */
export async function guardPuppeteerPage(page, { scheduledRun = null } = {}) {
  const opener = currentScheduledRun();
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (request.isInterceptResolutionHandled?.()) return;
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') {
      request.continue().catch(() => {});
      return;
    }
    const run = (scheduledRun ? scheduledRun() : null) || opener;
    const check = run ? await runInScheduledContext(run, () => checkAgentUrl(url)) : await checkAgentUrl(url);
    if (check.ok) request.continue().catch(() => {});
    else request.abort('blockedbyclient').catch(() => {});
  });
}
