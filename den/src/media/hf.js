// den/src/media/hf.js
// Hugging Face file addresses and sizes for the voice and image catalogs.
// HF_ENDPOINT, as in Hugging Face's own tools, points at a mirror instead.

const SIZE_TTL_MS = 60 * 60_000;
const sizeCache = new Map(); // `${repo}:${dir}` → { at, sizes: Map(path → bytes) }

export function hfEndpoint() {
  return String(process.env.HF_ENDPOINT || 'https://huggingface.co').replace(/\/+$/, '');
}

function encodePath(file) {
  return String(file).split('/').map(encodeURIComponent).join('/');
}

/** Where a file in a model repo downloads from. */
export function hfFileUrl(repo, file) {
  return `${hfEndpoint()}/${repo}/resolve/main/${encodePath(file)}`;
}

/**
 * The sizes of the files in one folder of a model repo, in bytes: one small
 * listing request, kept for an hour.
 */
export async function hfFolderSizes(repo, dir = '', { fetchImpl = globalThis.fetch, headers = {}, timeoutMs = 10_000 } = {}) {
  const key = `${repo}:${dir}`;
  const cached = sizeCache.get(key);
  if (cached && Date.now() - cached.at < SIZE_TTL_MS) return cached.sizes;
  const url = `${hfEndpoint()}/api/models/${repo}/tree/main${dir ? `/${encodePath(dir)}` : ''}`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Hugging Face answered ${res.status} for ${repo}${dir ? `/${dir}` : ''}.`);
  const list = await res.json();
  const sizes = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    if (item?.type === 'file' && item.path) sizes.set(item.path, Number(item.lfs?.size ?? item.size) || 0);
  }
  sizeCache.set(key, { at: Date.now(), sizes });
  return sizes;
}

/** One file's size in bytes, or null when the listing doesn't have it. */
export async function hfFileSize(repo, file, options = {}) {
  const slash = String(file).lastIndexOf('/');
  const dir = slash >= 0 ? file.slice(0, slash) : '';
  const sizes = await hfFolderSizes(repo, dir, options);
  return sizes.has(file) ? sizes.get(file) : null;
}

export function clearHfSizeCache() {
  sizeCache.clear();
}
