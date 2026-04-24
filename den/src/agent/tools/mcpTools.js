// den/src/agent/tools/mcpTools.js
import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { toolRegistry, PermissionLevel } from './toolRegistry.js';

let clients = [];
let activeConfigPath = null;
let watcher = null;
let reloadTimer = null;
let lastStatus = { servers: {}, loadedTools: 0, errors: [] };

function ensureConfig(configPath) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ mcpServers: {} }, null, 2));
  }
}

export function readMcpConfig(configPath = activeConfigPath) {
  ensureConfig(configPath);
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.mcpServers) config.mcpServers = {};
    return config;
  } catch (err) {
    return { mcpServers: {}, _error: err.message };
  }
}

export function writeMcpConfig(configPath = activeConfigPath, config) {
  ensureConfig(configPath);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function closeClients() {
  for (const client of clients) {
    try { await client.close?.(); } catch {}
  }
  clients = [];
}

export async function reloadMcpTools(configPath = activeConfigPath) {
  if (!configPath) return lastStatus;
  activeConfigPath = configPath;
  ensureConfig(configPath);
  await closeClients();
  toolRegistry.unregisterWhere(tool => tool.category === 'mcp');
  lastStatus = { servers: {}, loadedTools: 0, errors: [] };

  const config = readMcpConfig(configPath);
  if (config._error) {
    lastStatus.errors.push(config._error);
    return lastStatus;
  }

  for (const [serverName, serverConfig] of Object.entries(config.mcpServers || {})) {
    const status = { disabled: !!serverConfig.disabled, connected: false, tools: 0, error: null };
    lastStatus.servers[serverName] = status;
    if (serverConfig.disabled) continue;

    try {
      console.log(`[MCP] Connecting to server: ${serverName}`);
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: { ...process.env, ...(serverConfig.env || {}) },
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
        const registeredName = toolRegistry.has(tool.name) ? `${serverName}_${tool.name}` : tool.name;
        toolRegistry.register({
          name: registeredName,
          description: `[MCP: ${serverName}] ${tool.description || ''}`,
          parameters: tool.inputSchema || { type: 'object', properties: {} },
          permission: PermissionLevel.MODERATE,
          category: 'mcp',
          serverName,
          execute: async (args) => {
            try {
              const res = await client.callTool({ name: tool.name, arguments: args });
              if (res.content && res.content.length > 0) {
                return { success: true, content: res.content.map(c => c.text || JSON.stringify(c)).join('\n') };
              }
              return { success: true, message: 'Tool executed successfully' };
            } catch (err) {
              return { success: false, error: err.message };
            }
          },
        });
      }
      status.connected = true;
      status.tools = tools.length;
      lastStatus.loadedTools += tools.length;
      console.log(`[MCP] Registered ${tools.length} tools from ${serverName}`);
    } catch (err) {
      status.error = err.message;
      lastStatus.errors.push(`${serverName}: ${err.message}`);
      console.error(`[MCP] Failed to load server ${serverName}:`, err.message);
    }
  }

  return lastStatus;
}

export async function loadMcpTools(configPath) {
  activeConfigPath = configPath;
  const status = await reloadMcpTools(configPath);
  if (!watcher) {
    watcher = fs.watch(configPath, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => reloadMcpTools(configPath).catch(err => {
        console.error('[MCP] Hot reload failed:', err.message);
      }), 250);
      reloadTimer?.unref?.();
    });
    watcher.unref?.();
  }
  return status;
}

export function listMcpServers(configPath = activeConfigPath) {
  const config = readMcpConfig(configPath);
  return Object.entries(config.mcpServers || {}).map(([name, server]) => ({
    name,
    command: server.command,
    args: server.args || [],
    env: server.env || {},
    disabled: !!server.disabled,
    status: lastStatus.servers[name] || null,
  }));
}

export function getMcpStatus() {
  return lastStatus;
}
