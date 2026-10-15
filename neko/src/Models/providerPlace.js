// Where a provider runs, for the default model's subtitle: a server on this
// computer or the local network is not a "cloud provider".

const PRIVATE_V4 = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
];

function hostOf(baseUrl) {
  try {
    return new URL(String(baseUrl || '')).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * "runs on your computer", "on your network", "OpenAI-compatible server"
 * (a custom server elsewhere) or "cloud provider".
 */
export function providerPlace(config = {}) {
  const host = hostOf(config?.base_url);
  if (config?.provider_type === 'local' || host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '::1') {
    return 'runs on your computer';
  }
  if (PRIVATE_V4.some((re) => re.test(host)) || host.endsWith('.local') || host.endsWith('.lan') || /^f[cd][0-9a-f]{2}:/.test(host)) {
    return 'on your network';
  }
  if (config?.provider_id === 'custom' || config?.provider_type === 'custom') return 'OpenAI-compatible server';
  return 'cloud provider';
}
