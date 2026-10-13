/**
 * A readable name for a stored model value. Built-in engines store file paths,
 * so "~/.cache/huggingface/hub/models--Qwen--Qwen2.5-0.5B/snapshots/…" becomes
 * "Qwen/Qwen2.5-0.5B" and "/models/foo.gguf" becomes "foo.gguf". Provider model
 * ids such as "meta-llama/Llama-3.3-70B" are left alone.
 */
export const friendlyModelName = (raw = '') => {
  const text = String(raw || '').trim();
  const hub = text.match(/models--([^/\\]+?)--([^/\\]+)/);
  if (hub) return `${hub[1]}/${hub[2]}`;
  const looksLikePath = text.startsWith('/') || text.startsWith('~') || text.includes('\\') || /^[A-Za-z]:[\\/]/.test(text);
  return looksLikePath ? text.split(/[\\/]/).filter(Boolean).pop() || text : text;
};
