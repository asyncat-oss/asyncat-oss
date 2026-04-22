// den/src/agent/tools/osTools.js
// ─── OS-Level Tools ───────────────────────────────────────────────────────────
// process_kill, process_spawn, port_scan, disk_usage, memory_detail, network_check.

import { spawn, execSync, exec } from 'child_process';
import os from 'os';
import { PermissionLevel } from './toolRegistry.js';

const execAsync = (cmd, cwd, timeout = 10000) => {
  return new Promise((resolve) => {
    let stdout = '', stderr = '';
    const proc = spawn('/bin/sh', ['-c', cmd], { cwd, shell: false });
    const timer = setTimeout(() => { proc.kill(); resolve({ success: false, error: `Timed out after ${timeout / 1000}s`, stdout, stderr }); }, timeout);
    proc.stdout?.on('data', d => { stdout += d.toString(); });
    proc.stderr?.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => { clearTimeout(timer); resolve({ success: code === 0, exit_code: code, stdout: stdout.trim(), stderr: stderr.trim() }); });
    proc.on('error', err => resolve({ success: false, error: err.message }));
  });
};

export const processKillTool = {
  name: 'process_kill',
  description: 'Kill a process by PID or name. Use ps_list first to find the process ID.',
  category: 'system',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      pid: { type: 'number', description: 'Process ID to kill' },
      name: { type: 'string', description: 'Process name to kill (kills all processes matching this name)' },
      signal: { type: 'string', enum: ['SIGTERM', 'SIGINT', 'SIGKILL', 'SIGHUP'], description: 'Signal to send (default: SIGTERM)' },
      force: { type: 'boolean', description: 'Use SIGKILL instead of SIGTERM for force kill' },
    },
  },
  execute: async (args) => {
    const signal = args.force ? 'SIGKILL' : (args.signal || 'SIGTERM');
    try {
      if (args.pid) {
        execSync(`kill -${signal} ${args.pid} 2>/dev/null`, { timeout: 3000 });
        return { success: true, action: 'killed', pid: args.pid, signal };
      }
      if (args.name) {
        const out = execSync(`pgrep -x "${args.name}" 2>/dev/null || pgrep "${args.name}" 2>/dev/null || true`, { encoding: 'utf8', timeout: 5000 });
        const pids = out.trim().split('\n').filter(Boolean).map(Number);
        if (!pids.length) return { success: false, error: `No process found matching: ${args.name}` };
        for (const pid of pids) {
          try { execSync(`kill -${signal} ${pid} 2>/dev/null`, { timeout: 3000 }); } catch {}
        }
        return { success: true, action: 'killed', matched: pids.length, signal, pids };
      }
      return { success: false, error: 'Must specify either pid or name' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const processSpawnTool = {
  name: 'process_spawn',
  description: 'Spawn a long-running process. Returns the PID so you can manage it with process_kill later.',
  category: 'system',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run' },
      cwd: { type: 'string', description: 'Working directory (default: current)' },
      detached: { type: 'boolean', description: 'Run detached (nohup style, default: false)' },
      env_vars: { type: 'object', description: 'Environment variables to set' },
    },
    required: ['command'],
  },
  execute: async (args, context) => {
    const cwd = args.cwd || context.workingDir;
    const env = { ...process.env, ...(args.env_vars || {}) };
    try {
      if (args.detached) {
        execSync(`nohup sh -c '${args.command.replace(/'/g, "'\\''")}' > /dev/null 2>&1 &`, { cwd, timeout: 5000 });
        const pidOut = execSync('echo $!', { encoding: 'utf8', timeout: 3000 }).trim();
        return { success: true, action: 'spawned_detached', pid: parseInt(pidOut) || null, command: args.command };
      } else {
        const proc = spawn('/bin/sh', ['-c', args.command], { cwd, shell: false, env, detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
        return { success: true, action: 'spawned', pid: proc.pid, command: args.command, note: 'Process is running. Use process_kill to stop it.' };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const portScanTool = {
  name: 'port_scan',
  description: 'Show which processes are listening on network ports. Useful to check if a service is running.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      port: { type: 'number', description: 'Check a specific port number' },
      protocol: { type: 'string', enum: ['tcp', 'udp', 'all'], description: 'Protocol to check (default: tcp)' },
    },
    required: [],
  },
  execute: async (args) => {
    const platform = os.platform();
    try {
      let output;
      if (platform === 'linux') {
        const proto = args.protocol === 'udp' ? '-u' : '-t';
        if (args.port) {
          output = execSync(`ss -${proto}lnp 2>/dev/null | grep ':${args.port}' || netstat -${proto}lnp 2>/dev/null | grep ':${args.port}' || echo "No process found on port ${args.port}"`, { encoding: 'utf8', timeout: 8000 });
        } else {
          output = execSync(`ss -${proto}lnp 2>/dev/null | head -50 || netstat -${proto}lnp 2>/dev/null | head -50`, { encoding: 'utf8', timeout: 8000 });
        }
      } else if (platform === 'darwin') {
        if (args.port) {
          output = execSync(`lsof -i :${args.port} -P -n 2>/dev/null || echo "No process found on port ${args.port}"`, { encoding: 'utf8', timeout: 8000 });
        } else {
          output = execSync(`lsof -i -P -n 2>/dev/null | head -50`, { encoding: 'utf8', timeout: 8000 });
        }
      } else {
        return { success: false, error: `Platform "${platform}" not supported for port scanning.` };
      }

      const lines = output.trim().split('\n').filter(Boolean);
      return { success: true, port: args.port || null, protocol: args.protocol || 'tcp', count: lines.length, processes: lines.join('\n').slice(0, 4000) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const diskUsageTool = {
  name: 'disk_usage',
  description: 'Show disk space usage for mounts and filesystems.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to check (default: /)' },
      inodes: { type: 'boolean', description: 'Also show inode usage (default: false)' },
    },
    required: [],
  },
  execute: async (args) => {
    const pathArg = args.path || '/';
    try {
      const dfOut = execSync(`df -h ${pathArg} 2>/dev/null | tail -1`, { encoding: 'utf8', timeout: 5000 });
      const inodesOut = args.inodes ? execSync(`df -i ${pathArg} 2>/dev/null | tail -1`, { encoding: 'utf8', timeout: 5000 }) : '';

      const dfLine = dfOut.trim().split(/\s+/);
      const [filesystem, total, used, available, percent, mounted] = dfLine;

      let inodes = null;
      if (inodesOut) {
        const iLine = inodesOut.trim().split(/\s+/);
        inodes = { total: iLine[1], used: iLine[2], available: iLine[3], percent: iLine[4] };
      }

      return {
        success: true,
        filesystem,
        total,
        used,
        available,
        percent_used: percent,
        mounted_on: mounted,
        inodes,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const memoryDetailTool = {
  name: 'memory_detail',
  description: 'Get detailed memory usage breakdown — total, used, free, swap, and per-process top consumers.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      top: { type: 'number', description: 'Show top N memory-consuming processes (default: 10)' },
    },
    required: [],
  },
  execute: async (args) => {
    const top = args.top || 10;
    try {
      const memInfo = execSync('free -b 2>/dev/null || vm_stat 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
      let memData = {};
      if (os.platform() === 'linux') {
        const lines = memInfo.trim().split('\n');
        const header = lines[0].split(/\s+/);
        const values = (lines[1] || '').split(/\s+/);
        const total = parseInt(values[1] || '0') * 1024;
        const used = parseInt(values[2] || '0') * 1024;
        const free = parseInt(values[3] || '0') * 1024;
        const available = parseInt(values[4] || '0') * 1024;
        const buffers = parseInt(values[5] || '0') * 1024;
        const swapTotal = parseInt(values[7] || '0') * 1024;
        const swapUsed = parseInt(values[8] || '0') * 1024;
        memData = { total, used, free, available, buffers, swap: { total: swapTotal, used: swapUsed, free: swapTotal - swapUsed } };
      } else if (os.platform() === 'darwin') {
        const lines = memInfo.trim().split('\n');
        const extract = (label) => {
          const line = lines.find(l => l.includes(label));
          return line ? parseInt(line.match(/(\d+)/)?.[1] || '0') * 1024 * 1024 : 0;
        };
        memData = { total: os.totalmem(), used: extract('Pages active'), free: extract('Pages free'), swap: { total: 0, used: 0, free: 0 } };
      }

      const procOut = execSync(`ps aux --no-headers 2>/dev/null | awk '{printf "%s\\t%s\\t%s\\t%s\\n", $2, $4, $6, $11}' | sort -k3 -rn | head -${top}`, { encoding: 'utf8', timeout: 5000 });
      const topProcs = procOut.trim().split('\n').filter(Boolean).map(line => {
        const [pid, memPct, rssKb, cmd] = line.split('\t');
        return { pid: parseInt(pid), mem_percent: parseFloat(memPct), rss_kb: parseInt(rssKb), command: cmd };
      });

      return {
        success: true,
        memory: {
          total_bytes: memData.total,
          used_bytes: memData.used,
          free_bytes: memData.free,
          available_bytes: memData.available || memData.free,
          swap: memData.swap,
          total_gb: (memData.total / 1e9).toFixed(2),
          used_gb: (memData.used / 1e9).toFixed(2),
          free_gb: (memData.free / 1e9).toFixed(2),
        },
        top_processes: topProcs,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const networkCheckTool = {
  name: 'network_check',
  description: 'Check network connectivity to a host. Tests DNS resolution, TCP connection, and latency.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      host: { type: 'string', description: 'Hostname or IP to check (e.g. "google.com", "8.8.8.8")' },
      port: { type: 'number', description: 'Port to check (default: 80)' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 5)' },
    },
    required: ['host'],
  },
  execute: async (args) => {
    const host = args.host;
    const port = args.port || 80;
    const timeout = (args.timeout || 5) * 1000;

    const start = Date.now();
    try {
      const dnsResult = execSync(`dig +short "${host}" 2>/dev/null || nslookup "${host}" 2>/dev/null | tail -1 || echo ""`, { encoding: 'utf8', timeout: 5000 }).trim();
      const tcpResult = execSync(`timeout ${args.timeout || 5} bash -c 'echo > /dev/tcp/${host}/${port}' 2>/dev/null && echo "open" || echo "closed"`, { encoding: 'utf8', timeout: timeout + 1000 }).trim();
      const latency = Date.now() - start;
      return {
        success: tcpResult === 'open',
        host,
        port,
        dns_resolved: dnsResult.split('\n')[0] || null,
        tcp_status: tcpResult,
        latency_ms: latency,
        reachable: tcpResult === 'open',
      };
    } catch (err) {
      const tcpMatch = err.message.includes('open') ? 'open' : 'closed';
      return { success: false, host, port, tcp_status: tcpMatch, reachable: false, error: err.message };
    }
  },
};

export const osTools = [
  processKillTool, processSpawnTool, portScanTool, diskUsageTool, memoryDetailTool, networkCheckTool,
];
export default osTools;
