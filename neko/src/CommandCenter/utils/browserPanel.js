// Pure helpers for the browser panel (tested in browserPanel.test.js).

export const SEARCH_ENGINES = {
  brave: (query) => `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
  google: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  duckduckgo: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  bing: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
};

function normalizedLocalPath(value = '') {
  let normalized = String(value || '').replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (/^\/[a-zA-Z]:\//.test(normalized)) normalized = normalized.slice(1);
  return normalized.replace(/\/$/, '');
}

/**
 * A file:// address inside the chat's Project folder → the backend's site
 * preview URL for it. Returns { url, sourceUrl } or { error }.
 */
export function projectPreviewUrl(fileUrl, workingContext, fileSiteApi) {
  if (!/^file:\/\//i.test(fileUrl || '')) return null;
  if (!workingContext?.rootId?.startsWith?.('project:') || !workingContext?.rootPath) {
    return { error: 'Choose a Project folder before opening a local file.' };
  }
  try {
    const parsed = new URL(fileUrl);
    const rootPath = normalizedLocalPath(workingContext.rootPath);
    const filePath = normalizedLocalPath(decodeURIComponent(parsed.pathname));
    const caseInsensitive = /^[a-zA-Z]:\//.test(rootPath);
    const comparableRoot = caseInsensitive ? rootPath.toLowerCase() : rootPath;
    const comparableFile = caseInsensitive ? filePath.toLowerCase() : filePath;
    if (comparableFile !== comparableRoot && !comparableFile.startsWith(`${comparableRoot}/`)) {
      return { error: 'That file is outside the folder attached to this Project.' };
    }
    const relativePath = filePath.slice(rootPath.length).replace(/^\/+/, '') || 'index.html';
    const encodedPath = relativePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return {
      url: `${fileSiteApi}/${encodeURIComponent(workingContext.rootId)}/${encodedPath}${parsed.search}${parsed.hash}`,
      sourceUrl: fileUrl,
    };
  } catch {
    return { error: 'The local file URL is not valid.' };
  }
}

/**
 * What the address bar should open for what was typed: a URL as is, a
 * domain or localhost address with a scheme added, a project file through
 * its preview, or else a web search. Returns { url, sourceUrl } or { error }.
 */
export function resolveAddress(raw, { searchEngine = 'brave', workingContext = null, fileSiteApi = '' } = {}) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { error: 'Type an address or something to search for.' };
  if (/^https?:\/\//i.test(trimmed)) return { url: trimmed };
  if (/^data:text\/html[;,]/i.test(trimmed)) return { url: trimmed };
  if (/^file:\/\//i.test(trimmed)) {
    const local = projectPreviewUrl(trimmed, workingContext, fileSiteApi);
    return local?.url ? local : { error: local?.error || 'The local file could not be opened.' };
  }
  if (
    /^localhost(:\d+)?(\/|$)/i.test(trimmed)
    || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(trimmed)
    || /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}(:\d+)?([/?#].*)?$/.test(trimmed)
  ) {
    // Local development usually serves plain HTTP; public sites use HTTPS.
    return { url: /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(trimmed) ? `http://${trimmed}` : `https://${trimmed}` };
  }
  const search = SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.brave;
  return { url: search(trimmed) };
}

/** Tabs shown in the strip: the current mode's tabs, Asyncat's tabs and pop-ups. */
export function stripTabs(state) {
  const tabs = Array.isArray(state?.tabs) ? state.tabs : [];
  return tabs.filter((tab) => tab.profile === state.mode || tab.agent || tab.popup);
}

/** Points (inset from the edges) where something could cover the page. */
export function samplePoints(rect, inset = 6) {
  if (!rect || rect.width < inset * 2 || rect.height < inset * 2) return [];
  const xs = [rect.left + inset, rect.left + rect.width / 2, rect.right - inset];
  const ys = [rect.top + inset, rect.top + rect.height / 2, rect.bottom - inset];
  const points = [];
  for (const y of ys) for (const x of xs) points.push({ x: Math.round(x), y: Math.round(y) });
  return points;
}

export function rectsIntersect(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** The security badge for the address bar. */
export function connectionKind(url) {
  const value = String(url || '');
  if (/^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?/i.test(value)) return 'local';
  if (value.startsWith('https://')) return 'secure';
  if (value.startsWith('http://')) return 'insecure';
  return 'none';
}
