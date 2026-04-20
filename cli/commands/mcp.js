// cli/commands/mcp.js
import fs from 'fs';
import path from 'path';
import { c, ok, info, warn, log } from '../lib/colors.js';
import { ROOT } from '../lib/env.js';

const MCP_CONFIG_PATH = path.join(ROOT, 'den', 'data', 'mcp.json');

function loadConfig() {
  if (!fs.existsSync(MCP_CONFIG_PATH)) {
    return { mcpServers: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, 'utf8'));
  } catch (err) {
    warn('Failed to parse mcp.json: ' + err.message);
    return { mcpServers: {} };
  }
}

function saveConfig(config) {
  const dir = path.dirname(MCP_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function run(args) {
  const sub = args[0];
  const config = loadConfig();

  if (!sub || sub === 'list') {
    const servers = Object.keys(config.mcpServers || {});
    if (servers.length === 0) {
      info('No MCP servers configured.');
      log(`Use ${c.cyan}/mcp add <name> <command> [args...]${c.reset} to add one.`);
      log(`Example: ${c.cyan}/mcp add sqlite npx -y @modelcontextprotocol/server-sqlite --db-path ./test.db${c.reset}`);
      return;
    }
    
    info('Configured MCP Servers:');
    for (const name of servers) {
      const srv = config.mcpServers[name];
      log(`  ${c.green}• ${name}${c.reset}`);
      log(`    Command: ${c.dim}${srv.command} ${(srv.args || []).join(' ')}${c.reset}`);
    }
    log(`\nNote: Changes take effect after restarting the backend (${c.cyan}/restart${c.reset})`);
    return;
  }

  if (sub === 'add') {
    const name = args[1];
    const command = args[2];
    const cmdArgs = args.slice(3);

    if (!name || !command) {
      warn('Usage: /mcp add <name> <command> [args...]');
      return;
    }

    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers[name] = { command, args: cmdArgs };
    saveConfig(config);
    ok(`Added MCP server '${name}'. Please run ${c.cyan}/restart${c.reset} to load its tools.`);
    return;
  }

  if (sub === 'rm' || sub === 'remove') {
    const name = args[1];
    if (!name) {
      warn('Usage: /mcp rm <name>');
      return;
    }

    if (!config.mcpServers || !config.mcpServers[name]) {
      warn(`MCP server '${name}' not found.`);
      return;
    }

    delete config.mcpServers[name];
    saveConfig(config);
    ok(`Removed MCP server '${name}'. Please run ${c.cyan}/restart${c.reset} to unload its tools.`);
    return;
  }

  warn(`Unknown mcp subcommand: ${sub}. Valid: list, add, rm`);
}
