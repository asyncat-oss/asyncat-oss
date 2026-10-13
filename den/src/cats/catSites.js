// den/src/cats/catSites.js
// A Cat's list of sites it may visit: "example.com" covers example.com and
// its subdomains, "*.example.com" only the subdomains' parent and children.
// An empty list allows every site.

/** "example.com", "*.example.com" or a full address, as a host pattern, or null. */
export function cleanSite(raw) {
  let text = String(raw || '').trim().toLowerCase();
  if (!text) return null;
  const wildcard = text.startsWith('*.');
  if (wildcard) text = text.slice(2);
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(text) ? text : `https://${text}`).hostname;
    if (!host || !/^[a-z0-9.-]+$/.test(host) || (!host.includes('.') && host !== 'localhost')) return null;
    return wildcard ? `*.${host}` : host;
  } catch {
    return null;
  }
}

/** Is `url` on the list? */
export function siteAllowed(url, sites = []) {
  if (!Array.isArray(sites) || sites.length === 0) return true;
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return sites.some((site) => {
    const bare = site.startsWith('*.') ? site.slice(2) : site;
    return host === bare || host.endsWith(`.${bare}`);
  });
}

/** "example.com, news.example.org and 3 more", for messages. */
export function describeSites(sites = []) {
  if (!sites.length) return 'any site';
  if (sites.length <= 3) return sites.join(', ');
  return `${sites.slice(0, 3).join(', ')} and ${sites.length - 3} more`;
}
