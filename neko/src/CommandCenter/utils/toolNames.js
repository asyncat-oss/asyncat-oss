// Old names of agent tools that were merged into others (den's
// agent/tools/toolAliases.js). Old chats still carry them, so they get the
// label, icon and handling of the tool that replaced them.

export const RENAMED_TOOLS = {
  browse_url: 'preview_get_text',
  screenshot_page: 'preview_screenshot',
  browser_navigate: 'preview_navigate',
  browser_click: 'preview_click',
  browser_type: 'preview_type',
  browser_fill: 'preview_fill',
  browser_extract: 'preview_get_text',
  semantic_search: 'local_rag_search',
  patch_file: 'edit_file',
  search_replace_block: 'apply_patch',
  diff_apply: 'apply_patch',
  ast_view_outline: 'list_definitions',
  glob_find: 'find_files',
  http_get: 'fetch_url',
  key_sequence: 'screen_key',
  screen_find_window: 'window_list',
  models_loaded: 'ai_status',
  code_fix: 'linter_run',
  image_describe: 'inspect_attachment',
};

/**
 * The current name for a tool name that may be an old one. Always a string:
 * an event without a tool name (an old saved message) gives ''.
 */
export function currentToolName(name) {
  if (typeof name !== 'string') return '';
  return Object.hasOwn(RENAMED_TOOLS, name) ? RENAMED_TOOLS[name] : name;
}

/** The files an edit tool call changes, from its arguments and result. */
export function editedPaths(tool, args = {}, result = {}) {
  const name = currentToolName(tool);
  if (name === 'edit_file') return args.path ? [args.path] : [];
  if (name !== 'apply_patch') return [];
  if (Array.isArray(result?.results)) {
    return result.results.filter((entry) => entry?.path && entry.action !== 'deleted' && entry.action !== 'renamed').map((entry) => entry.path);
  }
  if (Array.isArray(args.edits)) return [...new Set(args.edits.map((edit) => edit?.path).filter(Boolean))];
  return args.path ? [args.path] : [];
}
