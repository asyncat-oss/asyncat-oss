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
import { dataTools } from './tools/dataTools.js';
import { planTools } from './tools/planTools.js';
import { askUserTools } from './tools/askUserTool.js';
import { AgentRuntime } from './AgentRuntime.js';
import { AgentSession } from './AgentSession.js';
import { permissionManager } from './PermissionManager.js';
import { ToolCallFormatter } from './ToolCallFormatter.js';
import { loadSkills as loadAgentSkills, listSkills as listAgentSkills } from './skills.js';

import { loadMcpTools } from './tools/mcpTools.js';
import path from 'path';

// ── Skills loader (Cerebellum) ────────────────────────────────────────────────
export function loadSkills() {
  return loadAgentSkills();
}

export function listSkills() {
  return listAgentSkills();
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
  toolRegistry.registerAll(dataTools);
  toolRegistry.registerAll(planTools);
  toolRegistry.registerAll(askUserTools);

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
