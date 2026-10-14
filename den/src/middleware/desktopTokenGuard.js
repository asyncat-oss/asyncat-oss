/**
 * When the desktop app started this backend, only the app changes things
 * through the API.
 *
 * The API has no login, and any program on this computer can reach it: among
 * them the agent's sandboxed commands while their network is open. One
 * request could turn the sandbox off, let commands read its hidden folders,
 * or add a connector that runs anything. The desktop app adds its per-launch
 * token to every request its window makes (electron/hostBridge.js), and no
 * other program has it: den keeps it out of their environment. Routes with a
 * token of their own pass, and so do reads: sign-in callbacks, files opened
 * in a browser, the agent's browser and the app's own background check load
 * without the token. So a command with the network open can still read chats
 * and settings here (saved keys come back masked); with Network set to
 * "Package registries only" or "Off", commands get a network without den in
 * it. A backend started on its own (development, a browser) has no launch
 * token and checks nothing.
 */

import { desktopLaunchToken, tokenMatches } from '../lib/hostBridge.js';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
// The desktop bridge and Claude Code's approvals check tokens of their own.
const OWN_TOKEN = [/^\/api\/host(\/|$)/, /^\/api\/(agent|ai)\/external-approvals\//];

export function createDesktopTokenGuard({ launchToken = desktopLaunchToken, matches = tokenMatches } = {}) {
  return (req, res, next) => {
    if (READS.has(req.method) || OWN_TOKEN.some((route) => route.test(req.path)) || !launchToken()) return next();
    if (matches(req.headers['x-asyncat-host-token'])) return next();
    return res.status(403).json({ success: false, error: 'Only the Asyncat app can change this.' });
  };
}
