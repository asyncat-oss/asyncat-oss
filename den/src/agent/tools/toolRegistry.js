// den/src/agent/tools/toolRegistry.js
// ─── Dynamic Tool Registry ──────────────────────────────────────────────────
// Central registry for all agent tools.
//
// Old names of tools that were merged into others are kept as aliases: saved
// agent profiles, Cats and chat approvals list tools by name, old chats and
// skills mention them, and models repeat what they have seen. An alias sends
// the old name to the tool that replaced it, reshaping the arguments where
// they differ. Aliases are not tools: all(), names() and tool_search never
// show them.

export const PermissionLevel = {
  SAFE: 'safe',
  MODERATE: 'moderate',
  DANGEROUS: 'dangerous',
};

const plainObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/**
 * Whether a required argument was given. Models send "" for arguments they
 * have nothing for, so an empty string counts as missing, except where it
 * means something: an empty new_string deletes the text it replaces.
 */
export function argumentGiven(key, value) {
  if (value === undefined || value === null) return false;
  return value !== '' || key === 'new_string';
}

class ToolRegistry {
  constructor() {
    this._tools = new Map();
    this._aliases = new Map(); // old name → { to, args }
  }

  /**
   * Keep an old tool name working. `to` is the tool that replaced it;
   * `args(old)` turns the old arguments into the new tool's, when the shapes
   * differ.
   */
  registerAlias(oldName, { to, args = null } = {}) {
    if (!oldName || !to) throw new Error('An alias needs an old name and a tool to point to');
    if (args !== null && typeof args !== 'function') throw new Error(`Alias "${oldName}" has an argument adapter that is not a function`);
    this._aliases.set(oldName, { to, args });
  }

  registerAliases(map) {
    for (const [oldName, spec] of Object.entries(map)) {
      this.registerAlias(oldName, typeof spec === 'string' ? { to: spec } : spec);
    }
  }

  isAlias(name) { return this._aliases.has(name) && !this._tools.has(name); }
  aliases() { return [...this._aliases.entries()].map(([name, spec]) => ({ name, to: spec.to })); }

  /** The current name for a tool name that may be an old one. */
  canonicalName(name) {
    if (typeof name !== 'string' || this._tools.has(name)) return name;
    return this._aliases.get(name)?.to || name;
  }

  /**
   * A tool call as the current tools take it: { name, args, aliasOf }, where
   * aliasOf is the old name when one was used (null otherwise).
   */
  resolve(name, args) {
    if (this._tools.has(name) || !this._aliases.has(name)) return { name, args, aliasOf: null };
    const spec = this._aliases.get(name);
    const adapted = spec.args ? spec.args(plainObject(args)) : args;
    return { name: spec.to, args: adapted, aliasOf: name };
  }

  register(tool) {
    if (!tool.name) throw new Error('Tool must have a name');
    if (!tool.execute || typeof tool.execute !== 'function') {
      throw new Error(`Tool "${tool.name}" must have an execute function`);
    }
    this._tools.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || { type: 'object', properties: {}, required: [] },
      permission: tool.permission || PermissionLevel.SAFE,
      category: tool.category || 'general',
      // Connector tools (category 'mcp') name the connector they come from,
      // and how to show them ("Notion · search").
      ...(tool.serverName ? { serverName: tool.serverName } : {}),
      ...(tool.displayName ? { displayName: tool.displayName } : {}),
      execute: tool.execute,
    });
  }

  registerAll(tools) {
    for (const tool of tools) this.register(tool);
  }

  get(name) { return this._tools.get(name) || null; }
  has(name) { return this._tools.has(name); }
  unregister(name) { return this._tools.delete(name); }
  unregisterWhere(predicate) {
    let removed = 0;
    for (const [name, tool] of this._tools.entries()) {
      if (predicate(tool, name)) {
        this._tools.delete(name);
        removed++;
      }
    }
    return removed;
  }
  names() { return [...this._tools.keys()]; }
  all() { return [...this._tools.values()]; }

  /** An old name asks like the tool that replaced it. */
  getPermission(name) {
    const tool = this.get(this.canonicalName(name));
    return tool ? tool.permission : PermissionLevel.DANGEROUS;
  }

  validateArgs(name, args) {
    const tool = this._tools.get(name);
    if (!tool) {
      return { valid: false, error: `Unknown tool: "${name}"`, missing: [], invalid: [] };
    }

    const parameters = tool.parameters || {};
    const required = Array.isArray(parameters.required) ? parameters.required : [];
    const props = parameters.properties || {};
    const value = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    const missing = required.filter(key => !argumentGiven(key, value[key]));
    const invalid = [];

    for (const [key, spec] of Object.entries(props)) {
      if (value[key] === undefined || value[key] === null) continue;
      const expected = spec?.type;
      if (!expected) continue;
      const actual = Array.isArray(value[key]) ? 'array' : typeof value[key];
      const allowed = Array.isArray(expected) ? expected : [expected];
      if (!allowed.includes(actual)) {
        invalid.push({ key, expected: allowed.join(' or '), actual });
      }
    }

    if (missing.length || invalid.length) {
      const parts = [];
      if (missing.length) parts.push(`missing required ${missing.map(k => `\`${k}\``).join(', ')}`);
      if (invalid.length) {
        parts.push(`invalid ${invalid.map(item => `\`${item.key}\` (${item.actual}, expected ${item.expected})`).join(', ')}`);
      }
      return {
        valid: false,
        error: `Invalid arguments for ${name}: ${parts.join('; ')}`,
        missing,
        invalid,
      };
    }

    return { valid: true, missing: [], invalid: [] };
  }

  byCategory(category) {
    return this.all().filter(t => t.category === category);
  }

  toOpenAIFormat(filter = null) {
    let tools = this.all();
    if (filter) {
      const filterSet = new Set(filter);
      tools = tools.filter(t => filterSet.has(t.name));
    }
    return tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));
  }

  async execute(calledName, calledArgs, context) {
    const { name, args } = this.resolve(calledName, calledArgs);
    const tool = this._tools.get(name);
    if (!tool) return { success: false, error: `Unknown tool: "${calledName}"` };
    const validation = this.validateArgs(name, args);
    if (!validation.valid) {
      return {
        success: false,
        code: 'invalid_tool_arguments',
        error: validation.error,
        missing: validation.missing,
        invalid: validation.invalid,
      };
    }
    try {
      return await tool.execute(args, context);
    } catch (err) {
      console.error(`Tool execution error [${name}]:`, err);
      return { success: false, error: err.message || 'Tool execution failed' };
    }
  }

  summary() {
    const categories = {};
    for (const t of this.all()) {
      const cat = t.category || 'general';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(`${t.name} [${t.permission}]`);
    }
    const lines = ['Registered tools:'];
    for (const [cat, tools] of Object.entries(categories)) {
      lines.push(`  ${cat}: ${tools.join(', ')}`);
    }
    return lines.join('\n');
  }
}

export const toolRegistry = new ToolRegistry();
export default toolRegistry;
