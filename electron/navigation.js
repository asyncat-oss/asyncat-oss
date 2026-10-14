// electron/navigation.js — Keeps an app window on the app's own pages: links
// to other sites open in the system browser, and anything else is refused.
// Used by the main window (window.js) and the Quick ask window (quick.js).
//
// No Electron imports (the caller passes openExternal), so it can be
// unit-tested with plain node.

/** 'app' for the app's own pages, 'external' for web links, 'blocked' otherwise. */
export function navigationTarget(url, frontendPort) {
  let target;
  try { target = new URL(url); } catch { return 'blocked'; }
  if (
    target.protocol === 'http:'
    && ['localhost', '127.0.0.1'].includes(target.hostname)
    && target.port === String(frontendPort)
  ) return 'app';
  if (target.protocol === 'http:' || target.protocol === 'https:') return 'external';
  return 'blocked';
}

/**
 * Route new windows and navigations away from the app to `openExternal`
 * (http and https only) and stop them in the window itself.
 */
export function guardNavigation(webContents, { frontendPort, openExternal }) {
  const openOutside = (url) => {
    if (navigationTarget(url, frontendPort) === 'blocked') return;
    Promise.resolve(openExternal(url)).catch(() => {});
  };

  webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (navigationTarget(url, frontendPort) === 'app') return;
    event.preventDefault();
    openOutside(url);
  });
}
