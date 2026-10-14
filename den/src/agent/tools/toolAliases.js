// den/src/agent/tools/toolAliases.js
// ─── Old tool names ──────────────────────────────────────────────────────────
// Tools that were merged into others, by their old names: which tool took
// over and how the old arguments map onto it. Saved agent profiles, Cats,
// chat approvals, skills and old chats keep working through these (see
// toolRegistry.registerAlias); none of them is listed as a tool.

const text = (value) => (value === undefined || value === null ? undefined : String(value));
const defined = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

export const TOOL_ALIASES = {
  // ── One browser tool set (the preview_* tools, headless without the app) ──
  browse_url: { to: 'preview_get_text', args: (old) => defined({ url: text(old.url) }) },
  screenshot_page: { to: 'preview_screenshot', args: (old) => defined({ url: text(old.url), full_page: old.full_page }) },
  browser_navigate: { to: 'preview_navigate', args: (old) => defined({ url: text(old.url) }) },
  browser_click: { to: 'preview_click', args: (old) => defined({ selector: text(old.selector) }) },
  browser_type: {
    to: 'preview_type',
    args: (old) => defined({ selector: text(old.selector), text: text(old.text) ?? '', clear: old.clear, submit: old.press_enter }),
  },
  browser_fill: {
    to: 'preview_fill',
    args: (old) => defined({
      fields: Object.entries(old.fields && typeof old.fields === 'object' ? old.fields : {}).map(([selector, value]) => ({ selector, value: String(value ?? '') })),
      submit: text(old.submit_selector),
    }),
  },
  // Every match comes back (one per line for an attribute), and a
  // structure's selectors are read together, in page order.
  browser_extract: {
    to: 'preview_get_text',
    args: (old) => defined({
      selector: old.structure && typeof old.structure === 'object'
        ? Object.values(old.structure).map(String).join(', ')
        : text(old.selector),
      attribute: text(old.attribute) || undefined,
    }),
  },

  // ── semantic_search was local_rag_search plus recall_memory ──
  semantic_search: {
    to: 'local_rag_search',
    args: (old) => defined({
      query: text(old.query),
      limit: old.limit,
      index_name: text(old.index_name),
      include_memory: !Array.isArray(old.sources) || !old.sources.length || old.sources.includes('memory'),
    }),
  },
};
