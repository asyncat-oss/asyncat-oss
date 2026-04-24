// cli/commands/mcp.js
import { c, ok, info, warn, log } from '../lib/colors.js';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/denApi.js';

function printServers(data) {
  const servers = data.servers || [];
  if (servers.length === 0) {
    info('No MCP servers configured.');
    log(`Use ${c.cyan}/mcp add <name> <command> [args...]${c.reset} to add one.`);
    log(`Example: ${c.cyan}/mcp add sqlite npx -y @modelcontextprotocol/server-sqlite --db-path ./test.db${c.reset}`);
    return;
  }

  info('Configured MCP Servers:');
  for (const srv of servers) {
    const state = srv.disabled ? c.dim + 'disabled' + c.reset : srv.status?.connected ? c.green + 'connected' + c.reset : c.yellow + 'not connected' + c.reset;
    log(`  ${c.green}• ${srv.name}${c.reset}  ${state}`);
    log(`    Command: ${c.dim}${srv.command} ${(srv.args || []).join(' ')}${c.reset}`);
    if (srv.status?.tools !== undefined) log(`    Tools: ${srv.status.tools}`);
    if (srv.status?.error) log(`    ${c.yellow}${srv.status.error}${c.reset}`);
  }
}

export async function run(args = []) {
  const sub = args[0] || 'list';

  try {
    if (sub === 'list' || sub === 'ls') {
      printServers(await apiGet('/api/agent/mcp'));
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
      await apiPost('/api/agent/mcp', { name, command, args: cmdArgs });
      ok(`Added MCP server '${name}' and reloaded tools.`);
      return;
    }

    if (sub === 'rm' || sub === 'remove') {
      const name = args[1];
      if (!name) { warn('Usage: /mcp rm <name>'); return; }
      await apiDelete(`/api/agent/mcp/${encodeURIComponent(name)}`);
      ok(`Removed MCP server '${name}' and reloaded tools.`);
      return;
    }

    if (sub === 'enable' || sub === 'disable') {
      const name = args[1];
      if (!name) { warn(`Usage: /mcp ${sub} <name>`); return; }
      await apiPatch(`/api/agent/mcp/${encodeURIComponent(name)}`, { disabled: sub === 'disable' });
      ok(`${sub === 'disable' ? 'Disabled' : 'Enabled'} MCP server '${name}' and reloaded tools.`);
      return;
    }

    if (sub === 'reload') {
      await apiPost('/api/agent/mcp/reload', {});
      ok('Reloaded MCP tools.');
      return;
    }

    warn(`Unknown mcp subcommand: ${sub}. Valid: list, add, rm, enable, disable, reload`);
  } catch (err) {
    warn(`MCP: ${err.message}`);
  }
}
