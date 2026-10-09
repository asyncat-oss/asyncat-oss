/**
 * Reject requests sent by web pages other than Asyncat's own frontend.
 *
 * The API listens on 127.0.0.1 and has no login, so binding to loopback is not
 * enough: any website open in the user's browser can still reach it. A form
 * POST or a no-cors fetch needs no CORS preflight, so it runs even though the
 * page cannot read the response, and a DNS-rebinding domain can read responses
 * too. Browsers always attach an Origin header to those cross-site writes and
 * send the attacker's domain as the Host header, so both are checked here.
 *
 * Requests without an Origin header (Electron's main process, curl, the
 * agent's own HTTP calls, top-level navigations such as OAuth callbacks) pass.
 */

const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

export function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function createLocalRequestGuard({ allowedOrigins = [], allowedHostnames = [], sameOriginPaths = [] } = {}) {
  const origins = new Set(allowedOrigins);
  const hostnames = new Set([...LOOPBACK_HOSTNAMES, ...allowedHostnames]);

  return (req, res, next) => {
    const host = req.headers.host;
    if (host && !hostnames.has(hostnameOf(`http://${host}`))) {
      return res.status(403).json({ success: false, error: 'Requests must target a local address.' });
    }

    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      return res.status(403).json({ success: false, error: 'Cross-origin requests are not allowed.' });
    }

    // Pages this server serves itself (project site previews, raw or uploaded
    // HTML) share its origin, so their GETs carry no Origin header. Let them
    // load files, but not read or change anything else through the API.
    if (
      req.headers['sec-fetch-site'] === 'same-origin'
      && req.path.startsWith('/api/')
      && !sameOriginPaths.some((prefix) => req.path.startsWith(prefix))
    ) {
      return res.status(403).json({ success: false, error: 'Pages served by Asyncat cannot call its API.' });
    }

    return next();
  };
}
