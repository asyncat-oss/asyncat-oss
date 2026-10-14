// den/src/privacy/sandboxSettings.js
// Settings → Privacy & safety → the command sandbox: whether it is on, the
// network commands get, hidden folders allowed back, and extra registries.
// Saved in app_config; commandSandbox.js and sandboxNetwork.js read them.

import path from 'path';
import { setConfigValue } from '../config/appConfig.js';
import { allowedReads, sandboxStatus } from '../agent/commandSandbox.js';
import { NETWORK_MODES, cleanRegistry } from '../agent/sandboxNetwork.js';

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/**
 * Change any of { enabled, network, allowRead, registries } and return the
 * new status. allowRead holds absolute paths of hidden folders to read
 * again; registries holds host names (not addresses).
 */
export function updateSandboxSettings(body = {}, { save = setConfigValue, status = sandboxStatus } = {}) {
  const changes = [];
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') throw badRequest('enabled must be true or false');
    changes.push(['ASYNCAT_COMMAND_SANDBOX', body.enabled ? 'auto' : 'off']);
  }
  if (body.network !== undefined) {
    if (!NETWORK_MODES.includes(body.network)) throw badRequest(`network must be one of ${NETWORK_MODES.join(', ')}`);
    changes.push(['ASYNCAT_SANDBOX_NETWORK', body.network]);
  }
  if (body.allowRead !== undefined) {
    if (!Array.isArray(body.allowRead) || body.allowRead.some((item) => typeof item !== 'string' || !path.isAbsolute(item))) {
      throw badRequest('allowRead must be a list of full folder paths');
    }
    changes.push(['ASYNCAT_SANDBOX_ALLOW_READ', JSON.stringify(allowedReads(JSON.stringify(body.allowRead)))]);
  }
  if (body.registries !== undefined) {
    if (!Array.isArray(body.registries)) throw badRequest('registries must be a list of host names');
    const hosts = [...new Set(body.registries.map(cleanRegistry).filter(Boolean))];
    changes.push(['ASYNCAT_SANDBOX_REGISTRIES', JSON.stringify(hosts)]);
  }
  for (const [key, value] of changes) save(key, value);
  return status();
}
