// den/src/media/hf.js
// Hugging Face for the voice and image catalogs and "Add from Hugging Face":
// file addresses and sizes, searching model repos and listing a repo's
// files. HF_ENDPOINT, as in Hugging Face's own tools, points at a mirror
// instead.

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

/**
 * Search model repos: { q, filter, sort, limit, page }. `filter` narrows to
 * a task, such as 'automatic-speech-recognition' or 'text-to-image'.
 */
export async function hfSearchModels({ q = '', filter = '', sort = 'downloads', limit = 20, page = 0 } = {}, { fetchImpl = globalThis.fetch, headers = {}, timeoutMs = 8000 } = {}) {
  const params = new URLSearchParams({ search: q, sort, direction: '-1', page: String(page), limit: String(limit), full: 'true' });
  if (filter) params.set('filter', String(filter));
  const res = await fetchImpl(`${hfEndpoint()}/api/models?${params}`, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HF API ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((model) => ({
    id: model.id,
    repoId: model.id,
    repo: model.repoId || model.id,
    modelId: model.modelId || model.id,
    author: model.author || String(model.id).split('/')[0],
    downloads: model.downloads || 0,
    likes: model.likes || 0,
    tags: (model.tags || []).filter((tag) => !tag.startsWith('license:')),
    pipeline_tag: model.pipeline_tag || '',
    created: model.createdAt || null,
    updated: model.lastModified || null,
    private: model.private || false,
    gated: model.gated || false,
  }));
}

/**
 * A repo's files, each with its size and download address. Sizes need
 * blobs=true: without it Hugging Face leaves them out, and large files
 * stored in LFS give their size under lfs.
 */
export async function hfRepoFiles(repoId, { fetchImpl = globalThis.fetch, headers = {}, timeoutMs = 8000 } = {}) {
  const res = await fetchImpl(`${hfEndpoint()}/api/models/${encodePath(repoId)}?blobs=true`, {
    headers: { Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403
      ? 'Check that HF_TOKEN is saved and that your Hugging Face account has accepted this model license.'
      : res.statusText;
    throw new Error(`HF API ${res.status}: ${hint}`);
  }
  const data = await res.json();
  return {
    repoId,
    private: Boolean(data.private),
    gated: data.gated || false,
    files: (data.siblings || []).map((file) => ({
      rfilename: file.rfilename,
      size: Number(file.lfs?.size ?? file.size) || 0,
      url: hfFileUrl(repoId, file.rfilename),
    })),
  };
}
