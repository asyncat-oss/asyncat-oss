// den/src/ai/embeddings/lexicalVector.js
// ─── Deterministic lexical embedding (offline fallback) ──────────────────────
// Hashed bag-of-tokens vector. No model, no network, fully deterministic.
// Used as the universal fallback so semantic search works even with a local
// chat model that has no /embeddings endpoint, or a provider (e.g. Anthropic
// native) that doesn't expose embeddings. Shared by the embedding service and
// the local RAG tools so there is a single source of truth.

export const LEXICAL_DIMS = 256;
export const LEXICAL_MODEL = 'local-hashed-lexical';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'were',
  'you', 'your', 'but', 'not', 'have', 'has', 'had', 'into', 'about', 'then',
  'function', 'const', 'let', 'var', 'return', 'import', 'export', 'class',
]);

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .match(/[a-z0-9_]{2,}/g)
    ?.filter(token => !STOP_WORDS.has(token))
    .slice(0, 5000) || [];
}

function hashToken(token) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Produce a unit-normalized hashed lexical vector for `text`.
 * @param {string} text
 * @param {number} dims  vector dimensionality (default 256)
 * @returns {number[]}
 */
export function lexicalVector(text, dims = LEXICAL_DIMS) {
  const size = Math.max(16, Math.floor(dims) || LEXICAL_DIMS);
  const vec = new Array(size).fill(0);
  const counts = new Map();
  for (const token of tokenize(text)) counts.set(token, (counts.get(token) || 0) + 1);
  for (const [token, count] of counts.entries()) {
    const hash = hashToken(token);
    const idx = hash % size;
    const sign = hash & 1 ? 1 : -1;
    vec[idx] += sign * Math.log1p(count);
  }
  let mag = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (mag < 1e-8) mag = 1;
  return vec.map(value => Number((value / mag).toFixed(6)));
}

/**
 * Cosine similarity. Returns 0 for null / mismatched-length inputs, which makes
 * it safe to compare vectors from different embedding spaces (they simply never
 * match each other).
 */
export function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag < 1e-8 ? 0 : dot / mag;
}

export default lexicalVector;
