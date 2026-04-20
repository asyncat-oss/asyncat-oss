// den/src/agent/tools/mcpTools.js
import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { toolRegistry, PermissionLevel } from './toolRegistry.js';

const clients = [];

export async function loadMcpTools(configPath) {
  if (!fs.existsSync(configPath)) {
    // Create a default empty config if it doesn't exist
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers: {} }, null, 2));
    return;
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error('[MCP] Failed to parse mcp config:', err.message);
    return;
  }

  if (!config.mcpServers) return;

  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    try {
      console.log(`[MCP] Connecting to server: ${serverName}`);
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: { ...process.env, ...(serverConfig.env || {}) }
      });

      const client = new Client(
        { name: 'asyncat', version: '1.0.0' },
        { capabilities: {} }
      );

      await client.connect(transport);
      clients.push(client);

      const response = await client.listTools();
      const tools = response.tools || [];

      for (const tool of tools) {
        // Register the tool dynamically into our ecosystem
        toolRegistry.register({
          name: tool.name,
          description: `[MCP: ${serverName}] ${tool.description || ''}`,
          parameters: tool.inputSchema || { type: 'object', properties: {} },
          permission: PermissionLevel.MODERATE, // MCP tools interact with external systems
          category: 'mcp',
          execute: async (args) => {
            try {
              const res = await client.callTool({ name: tool.name, arguments: args });
              // MCP tools return { content: [{ type: 'text', text: '...' }] }
              if (res.content && res.content.length > 0) {
                return { success: true, content: res.content.map(c => c.text).join('\n') };
              }
              return { success: true, message: 'Tool executed successfully' };
            } catch (err) {
              return { success: false, error: err.message };
            }
          }
        });
      }
      console.log(`[MCP] Registered ${tools.length} tools from ${serverName}`);
    } catch (err) {
      console.error(`[MCP] Failed to load server ${serverName}:`, err.message);
    }
  }
}
