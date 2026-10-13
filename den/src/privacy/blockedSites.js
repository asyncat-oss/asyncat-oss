// den/src/privacy/blockedSites.js
// Settings → Privacy & safety → "Sites agents never open": every agent and
// Cat keeps away from these. The web tools refuse them, and the desktop
// app's browser won't load them in the tabs agents drive. Saved in the app
// config as a JSON list of host patterns ("example.com" covers subdomains).

import { getConfigValue, setConfigValue } from '../config/appConfig.js';
import { cleanSite, siteAllowed } from '../cats/catSites.js';

export const BLOCKED_SITES_KEY = 'ASYNCAT_AGENT_BLOCKED_SITES';
const MAX_SITES = 200;

function parse(value) {
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list : [];
  } catch {
    return String(value).split(/[\s,]+/);
  }
}

/** Clean, de-duplicated host patterns; anything that isn't a site is dropped. */
export function cleanSiteList(list = []) {
  const out = [];
  for (const raw of list) {
    const site = cleanSite(raw);
    if (site && !out.includes(site)) out.push(site);
  }
  return out.slice(0, MAX_SITES);
}

export function getBlockedSites() {
  let value = process.env[BLOCKED_SITES_KEY];
  if (value === undefined) value = getConfigValue(BLOCKED_SITES_KEY);
  return cleanSiteList(parse(value));
}

export function setBlockedSites(list) {
  const sites = cleanSiteList(Array.isArray(list) ? list : []);
  setConfigValue(BLOCKED_SITES_KEY, JSON.stringify(sites));
  return sites;
}

/** Is `url` on the list? An empty list blocks nothing. */
export function siteBlocked(url, sites = getBlockedSites()) {
  return sites.length > 0 && siteAllowed(url, sites);
}
