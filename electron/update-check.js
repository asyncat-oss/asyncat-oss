// Release checks with a cache. Plain Node.js (no Electron imports) so it can
// be tested directly.
//
// Unauthenticated calls to the GitHub API are limited to 60 an hour per IP
// address, shared with everything else on that network. Asyncat checks at
// startup, every few hours, and whenever Settings → About opens, so:
//   - a recent answer (younger than `maxAgeMs`) is reused without asking;
//   - "Check again" asks at most once every `minIntervalMs`;
//   - every request sends the last ETag, so an unchanged list comes back as
//     a small 304 and the saved copy is used.
// The cache is kept in a JSON file so it survives restarts.

import fs from 'fs';
import path from 'path';

export const CHECK_MAX_AGE_MS = 15 * 60 * 1000;
export const CHECK_MIN_INTERVAL_MS = 30 * 1000;

/** Only the fields the updater reads, so the cache file stays small. */
export function trimReleases(releases) {
  return (Array.isArray(releases) ? releases : []).map((release) => ({
    tag_name: release?.tag_name ?? null,
    name: release?.name ?? null,
    draft: Boolean(release?.draft),
    prerelease: Boolean(release?.prerelease),
    published_at: release?.published_at ?? null,
    created_at: release?.created_at ?? null,
    html_url: release?.html_url ?? null,
    body: typeof release?.body === 'string' ? release.body.slice(0, 20000) : '',
    assets: (Array.isArray(release?.assets) ? release.assets : []).map((asset) => ({
      name: asset?.name ?? null,
      browser_download_url: asset?.browser_download_url ?? null,
      size: asset?.size ?? null,
      digest: asset?.digest ?? null,
    })),
  }));
}

export function readCheckCache(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && Array.isArray(data.releases) ? data : null;
  } catch {
    return null;
  }
}

function writeCheckCache(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data));
    fs.renameSync(temp, file);
  } catch (error) {
    console.warn('[updater] could not save the update check:', error.message);
  }
}

/**
 * The published releases at `url`, from the cache when it is fresh enough.
 * Resolves { releases, source: 'cache' | 'not-modified' | 'network' }.
 */
export async function fetchReleasesCached({
  url,
  cacheFile,
  fetchImpl = fetch,
  headers = {},
  force = false,
  now = Date.now(),
  maxAgeMs = CHECK_MAX_AGE_MS,
  minIntervalMs = CHECK_MIN_INTERVAL_MS,
}) {
  const cached = readCheckCache(cacheFile);
  const sameUrl = cached?.url === url;
  const age = sameUrl ? now - Number(cached.checkedAt || 0) : Infinity;
  if (sameUrl && age >= 0 && age < (force ? minIntervalMs : maxAgeMs)) {
    return { releases: cached.releases, source: 'cache' };
  }

  const requestHeaders = { ...headers };
  if (sameUrl && cached.etag) requestHeaders['If-None-Match'] = cached.etag;
  const response = await fetchImpl(url, { headers: requestHeaders });

  if (response.status === 304 && sameUrl) {
    writeCheckCache(cacheFile, { ...cached, checkedAt: now });
    return { releases: cached.releases, source: 'not-modified' };
  }
  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const hint = remaining === '0' ? ' GitHub rate limit reached; try again later.' : '';
    throw new Error(`GitHub update check failed (${response.status}).${hint}`);
  }
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error('GitHub returned an invalid releases response.');
  const releases = trimReleases(body);
  writeCheckCache(cacheFile, { url, etag: response.headers.get('etag') || null, checkedAt: now, releases });
  return { releases, source: 'network' };
}
