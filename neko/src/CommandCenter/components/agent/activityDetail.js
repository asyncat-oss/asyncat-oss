// The one or two quiet lines under a step in the Steps panel: plain words,
// without markdown marks, reasoning or tool-call wrappers, and a tool's JSON
// arguments shown as the few fields that say what it did.

const NAMED_FIELDS = ['title', 'path', 'file_path', 'query', 'command', 'url', 'name', 'note_id', 'pattern'];

function plainMarkdown(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?=[^\w*]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1');
}

function jsonSummary(text) {
  const trimmed = text.trim();
  if (!/^[{[]/.test(trimmed)) return null;
  let value;
  try { value = JSON.parse(trimmed); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const primitive = (entry) => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean';
  const keys = [
    ...NAMED_FIELDS.filter((key) => primitive(value[key])),
    ...Object.keys(value).filter((key) => !NAMED_FIELDS.includes(key) && primitive(value[key])),
  ].slice(0, 2);
  if (!keys.length) return '';
  return keys.map((key) => `${key.replace(/_/g, ' ')}: ${String(value[key])}`).join(' · ');
}

export function activityDetail(detail) {
  const text = String(detail || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\s*<tool_call>[\s\S]*?<\/(?:\w+:)?tool_call>/gi, '')
    .replace(/\s*<tool_call[\s\S]*$/i, '')
    .trim();
  const summary = jsonSummary(text);
  if (summary !== null) return summary;
  return plainMarkdown(text).replace(/\s+/g, ' ').trim();
}
