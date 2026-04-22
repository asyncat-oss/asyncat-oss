// den/src/agent/index.js
// ─── Agent Module Entry Point ────────────────────────────────────────────────
// Registers all tools and exports the agent runtime.

import { toolRegistry } from './tools/toolRegistry.js';
import { fileTools } from './tools/fileTools.js';
import { shellTools } from './tools/shellTools.js';
import { searchTools } from './tools/searchTools.js';
import { memoryTools } from './tools/memoryTools.js';
import { browserTools } from './tools/browserTools.js';
import { workspaceTools } from './tools/workspaceTools.js';
import { agentTools } from './tools/agentTools.js';
import { systemTools } from './tools/systemTools.js';
import { gitTools } from './tools/gitTools.js';
import { dockerTools } from './tools/dockerTools.js';
import { devTools } from './tools/devTools.js';
import { osTools } from './tools/osTools.js';
import { screenTools } from './tools/screenTools.js';
import { AgentRuntime } from './AgentRuntime.js';
import { AgentSession } from './AgentSession.js';
import { permissionManager } from './PermissionManager.js';
import { ToolCallFormatter } from './ToolCallFormatter.js';

import { loadMcpTools } from './tools/mcpTools.js';
import path from 'path';
import fs from 'fs';

// ── Skills loader (Cerebellum) ────────────────────────────────────────────────
let bundledSkills = [];

export function loadSkills() {
  const skillsDir = path.resolve(process.cwd(), 'cli', 'skills');
  bundledSkills = [];

  if (!fs.existsSync(skillsDir)) {
    console.log('[agent] No skills directory found');
    return bundledSkills;
  }

  const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md') && !f.startsWith('_'));
  for (const file of files) {
    const skillPath = path.join(skillsDir, file);
    const content = fs.readFileSync(skillPath, 'utf8');
    const lines = content.split('\n');

    const frontmatter = {};
    let inFrontmatter = false;
    let bodyStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true;
        } else {
          bodyStart = i + 1;
          break;
        }
        continue;
      }
      if (inFrontmatter && line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        frontmatter[key.trim()] = valueParts.join(':').trim();
      }
    }

    const body = lines.slice(bodyStart).join('\n').trim();
    bundledSkills.push({
      name: file.replace('.md', ''),
      ...frontmatter,
      body,
    });
  }

  console.log(`[agent] ${bundledSkills.length} skills loaded from Cerebellum`);
  return bundledSkills;
}

export function listSkills() {
  return bundledSkills;
}

function findRelevantSkills(query) {
  if (!query || bundledSkills.length === 0) return [];
  const q = query.toLowerCase();
  return bundledSkills.filter(s => {
    const haystack = `${s.name} ${s.description} ${s.tags} ${s.when_to_use} ${s.body}`.toLowerCase();
    return haystack.includes(q);
  }).slice(0, 3);
}

// ── Register all tools ───────────────────────────────────────────────────────
let initialized = false;

export async function initializeAgent() {
  if (initialized) return;

  toolRegistry.registerAll(fileTools);
  toolRegistry.registerAll(shellTools);
  toolRegistry.registerAll(searchTools);
  toolRegistry.registerAll(memoryTools);
  toolRegistry.registerAll(workspaceTools);
  toolRegistry.registerAll(agentTools);
  toolRegistry.registerAll(systemTools);
  toolRegistry.registerAll(gitTools);
  toolRegistry.registerAll(dockerTools);
  toolRegistry.registerAll(devTools);
  toolRegistry.registerAll(osTools);
  toolRegistry.registerAll(screenTools);

  // Browser tools are optional — puppeteer may not be installed
  try {
    toolRegistry.registerAll(browserTools);
  } catch (err) {
    console.warn('[agent] Browser tools not available (puppeteer not installed):', err.message);
  }


  // Load MCP tools
  const mcpConfigPath = path.resolve(process.cwd(), 'data', 'mcp.json');
  await loadMcpTools(mcpConfigPath);

  // Load skills (Cerebellum)
  loadSkills();

  initialized = true;
  console.log(`[agent] ${toolRegistry.names().length} tools registered`);
}

export {
  AgentRuntime,
  AgentSession,
  toolRegistry,
  permissionManager,
  ToolCallFormatter,
};
