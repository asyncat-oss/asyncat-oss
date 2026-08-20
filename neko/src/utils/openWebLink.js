const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

export function normalizeWebLink(value) {
  try {
    const url = new URL(String(value || '').trim());
    return HTTP_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Open an HTTP(S) link using the user's Workbench preference.
 * Internal links are handed to Command Center's embedded browser; system links
 * use Electron's validated shell bridge, with a normal browser-tab fallback.
 */
export function openWebLink(value, mode = 'internal') {
  const url = normalizeWebLink(value);
  if (!url) return false;

  if (mode !== 'system') {
    window.dispatchEvent(new CustomEvent('asyncat-open-preview', {
      detail: { url, source: 'web-link' },
    }));
    return true;
  }

  if (window.electronAPI?.openExternalUrl) {
    window.electronAPI.openExternalUrl(url).catch(() => {});
    return true;
  }

  return Boolean(window.open(url, '_blank', 'noopener,noreferrer'));
}

