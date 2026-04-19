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
  names() { return [...this._tools.keys()]; }
  all() { return [...this._tools.values()]; }

  getPermission(name) {
    const tool = this._tools.get(name);
    return tool ? tool.permission : PermissionLevel.DANGEROUS;
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
