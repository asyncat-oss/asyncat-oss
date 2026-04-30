// den/src/agent/tools/toolRegistry.js
// ─── Dynamic Tool Registry ──────────────────────────────────────────────────
// Central registry for all agent tools.

export const PermissionLevel = {
  SAFE: 'safe',
  MODERATE: 'moderate',
  DANGEROUS: 'dangerous',
};

class ToolRegistry {
  constructor() {
    this._tools = new Map();
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

  getPermission(name) {
    const tool = this._tools.get(name);
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
    const missing = required.filter(key => value[key] === undefined || value[key] === null || value[key] === '');
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

  async execute(name, args, context) {
    const tool = this._tools.get(name);
    if (!tool) return { success: false, error: `Unknown tool: "${name}"` };
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
