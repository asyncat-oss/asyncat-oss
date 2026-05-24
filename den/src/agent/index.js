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
import { skillTools } from './tools/skillTools.js';
import { artifactTools } from './tools/artifactTools.js';
import { noteTools } from './tools/noteTools.js';
import { audioTools } from './tools/audioTools.js';
import { visualTools } from './tools/visualTools.js';
import { designTools } from './tools/designTools.js';
import { socialTools } from './tools/socialTools.js';
import { installTools } from './tools/installTools.js';
import { integrationTools } from './tools/integrationTools.js';
import { dbQueryTools } from './tools/dbQueryTools.js';
import { modelStatusTools } from './tools/modelStatusTools.js';
import { modelManagementTools } from './tools/modelManagementTools.js';
import { datasetTools } from './tools/datasetTools.js';
import { hardwareTools } from './tools/hardwareTools.js';
import { schedulerTools } from './tools/schedulerTools.js';
import { codeSearchTools } from './tools/codeSearchTools.js';
import { apiExplorerTools } from './tools/apiExplorerTools.js';
import { localRagTools } from './tools/localRagTools.js';
import { testRunnerTools } from './tools/testRunnerTools.js';
import { codebaseMetricsTools } from './tools/codebaseMetricsTools.js';
import { sandboxTools } from './tools/sandboxTools.js';
import { astTools } from './tools/astTools.js';
import { lspTools } from './tools/lspTools.js';
import { searchReplaceBlockTools } from './tools/searchReplaceBlockTool.js';
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
  toolRegistry.registerAll(skillTools);
  toolRegistry.registerAll(artifactTools);
  toolRegistry.registerAll(noteTools);
  toolRegistry.registerAll(audioTools);
  toolRegistry.registerAll(visualTools);
  toolRegistry.registerAll(designTools);
  toolRegistry.registerAll(socialTools);
  toolRegistry.registerAll(installTools);
  toolRegistry.registerAll(integrationTools);
  toolRegistry.registerAll(dbQueryTools);
  toolRegistry.registerAll(modelStatusTools);
  toolRegistry.registerAll(modelManagementTools);
  toolRegistry.registerAll(datasetTools);
  toolRegistry.registerAll(hardwareTools);
  toolRegistry.registerAll(schedulerTools);
  toolRegistry.registerAll(codeSearchTools);
  toolRegistry.registerAll(apiExplorerTools);
  toolRegistry.registerAll(localRagTools);
  toolRegistry.registerAll(testRunnerTools);
  toolRegistry.registerAll(codebaseMetricsTools);
  toolRegistry.registerAll(sandboxTools);
  toolRegistry.registerAll(astTools);
  toolRegistry.registerAll(lspTools);
  toolRegistry.registerAll(searchReplaceBlockTools);

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
