// den/src/agent/tools/systemTools.js
// ─── System & OS Tools ───────────────────────────────────────────────────────
// Gives the agent visibility into the running system.
// Zero new packages — uses Node.js built-ins only (os, child_process, fs).

import os from 'os';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { IS_WIN, PLATFORM, appleScriptLiteral, clampInt, powerShellLiteral, runFile } from './shared.js';
import { PermissionLevel } from './toolRegistry.js';

const execFileAsync = promisify(execFile);

// ── sys_info ──────────────────────────────────────────────────────────────────
export const sysInfoTool = {
  name: 'sys_info',
  description: 'Get current system information: CPU usage, memory, disk space, uptime, OS, Node version, and load averages. Useful for diagnosing performance issues or understanding the environment.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => {
    try {
      const totalMem  = os.totalmem();
      const freeMem   = os.freemem();
      const usedMem   = totalMem - freeMem;
      const cpus      = os.cpus();
      const loadAvg   = os.loadavg();

      // Disk usage via df (available on Linux/macOS)
      let disk = null;
      try {
        const dfOut = execSync('df -h / 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
        const lines = dfOut.trim().split('\n');
        if (lines[1]) {
          const parts = lines[1].split(/\s+/);
          disk = { total: parts[1], used: parts[2], free: parts[3], percent: parts[4] };
        }
      } catch {}

      return {
        success: true,
        os: {
          platform: os.platform(),
          release: os.release(),
          arch: os.arch(),
          hostname: os.hostname(),
        },
        cpu: {
          model: cpus[0]?.model || 'unknown',
          cores: cpus.length,
          load_1m: loadAvg[0].toFixed(2),
          load_5m: loadAvg[1].toFixed(2),
          load_15m: loadAvg[2].toFixed(2),
        },
        memory: {
          total_gb: (totalMem / 1e9).toFixed(2),
          used_gb:  (usedMem  / 1e9).toFixed(2),
          free_gb:  (freeMem  / 1e9).toFixed(2),
          percent_used: ((usedMem / totalMem) * 100).toFixed(1) + '%',
        },
        disk,
        uptime_hours: (os.uptime() / 3600).toFixed(1),
        node_version: process.version,
        pid: process.pid,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── ps_list ───────────────────────────────────────────────────────────────────
export const psListTool = {
  name: 'ps_list',
  description: 'List running processes, sorted by CPU or memory usage. Optionally filter by name. Use to diagnose what is consuming resources.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      filter:  { type: 'string',  description: 'Optional: filter by process name substring' },
      sort_by: { type: 'string',  enum: ['cpu', 'mem', 'pid'], description: 'Sort by cpu, mem, or pid (default: cpu)' },
      limit:   { type: 'number',  description: 'Max processes to return (default: 20)' },
    },
    required: [],
  },
  execute: async (args) => {
    try {
      const sort  = args.sort_by || 'cpu';
      const limit = clampInt(args.limit, 20, 1, 200);
      let procs = [];

      if (IS_WIN) {
        // tasklist /FO CSV /NH — Name,PID,SessionName,Session#,Mem Usage
        const raw = runFile('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 8000 }).stdout;
        procs = raw.trim().split('\n').filter(Boolean).map(line => {
          const parts = line.replace(/"/g, '').split(',');
          const memKb = parseInt((parts[4] || '0').replace(/\D/g, '')) || 0;
          return { pid: parseInt(parts[1]) || 0, cpu: 0, mem: parseFloat((memKb / 1024).toFixed(1)), command: parts[0] };
        }).filter(p => p.pid > 0);
        if (sort === 'mem') procs.sort((a, b) => b.mem - a.mem);
      } else {
        // pid, %cpu, %mem and command for every process, on Linux and macOS.
        const raw = runFile('ps', ['-axo', 'pid=,pcpu=,pmem=,comm='], { timeout: 5000 }).stdout;
        procs = raw.split('\n').map(line => line.trim().match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/)).filter(Boolean)
          .map(([, pid, cpu, mem, cmd]) => ({ pid: parseInt(pid, 10), cpu: parseFloat(cpu), mem: parseFloat(mem), command: cmd }));
        procs.sort((a, b) => (sort === 'mem' ? b.mem - a.mem : sort === 'pid' ? a.pid - b.pid : b.cpu - a.cpu));
      }

      if (args.filter) {
        const f = args.filter.toLowerCase();
        procs = procs.filter(p => p.command?.toLowerCase().includes(f));
      }

      return { success: true, count: procs.length, processes: procs.slice(0, limit) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

// ── env_get ───────────────────────────────────────────────────────────────────
export const envGetTool = {
  name: 'env_get',
  description: 'Read environment variables. Sensitive values (keys containing PASSWORD, SECRET, TOKEN, KEY) are masked. Use to check configuration, API keys availability, or runtime environment.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      keys: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific env var names to retrieve. If omitted, returns a safe summary of all non-sensitive vars.',
      },
    },
    required: [],
  },
  execute: async (args) => {
    const SENSITIVE = /password|secret|token|key|auth|credential|private|api_key/i;
    const mask = (k, v) => SENSITIVE.test(k) ? `[MASKED — ${v?.length || 0} chars]` : v;

    if (args.keys && args.keys.length > 0) {
      const result = {};
      for (const k of args.keys) {
        const v = process.env[k];
        result[k] = v !== undefined ? mask(k, v) : '[not set]';
      }
      return { success: true, vars: result };
    }

    // Return summary of all env vars (safe ones only)
    const result = {};
    for (const [k, v] of Object.entries(process.env)) {
      result[k] = mask(k, v ?? '');
    }
    return { success: true, count: Object.keys(result).length, vars: result };
  },
};

const NOTIFY_URGENCIES = new Set(['low', 'normal', 'critical']);

/** The program and argument list that shows a desktop notification. */
export function notificationCommand({ title, message, urgency = 'normal', platform = PLATFORM }) {
  if (platform === 'darwin') {
    return ['osascript', ['-e', `display notification ${appleScriptLiteral(message)} with title ${appleScriptLiteral(title)}`], 3000];
  }
  if (platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$n = New-Object System.Windows.Forms.NotifyIcon',
      '$n.Icon = [System.Drawing.SystemIcons]::Information',
      '$n.Visible = $true',
      `$n.ShowBalloonTip(4000, ${powerShellLiteral(title)}, ${powerShellLiteral(message)}, [System.Windows.Forms.ToolTipIcon]::Info)`,
      'Start-Sleep -Milliseconds 4500',
      '$n.Dispose()',
    ].join('; ');
    return ['powershell', ['-NoProfile', '-NonInteractive', '-Command', script], 6000];
  }
  return ['notify-send', [`--urgency=${NOTIFY_URGENCIES.has(urgency) ? urgency : 'normal'}`, '--', title, message], 3000];
}

// ── notify ────────────────────────────────────────────────────────────────────
export const notifyTool = {
  name: 'notify',
  description: 'Send a desktop system notification. Use to alert the user when a long task finishes, an error occurs, or something needs attention.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      title:   { type: 'string', description: 'Notification title' },
      message: { type: 'string', description: 'Notification body text' },
      urgency: { type: 'string', enum: ['low', 'normal', 'critical'], description: 'Urgency level (default: normal)' },
    },
    required: ['title', 'message'],
  },
  execute: async (args) => {
    const title   = String(args.title ?? '').slice(0, 100);
    const message = String(args.message ?? '').slice(0, 300);
    const urgency = NOTIFY_URGENCIES.has(args.urgency) ? args.urgency : 'normal';

    try {
      // The title and message come from the model, which may be repeating a
      // web page or file. They are passed as arguments, never through a
      // shell, so $(...) or quotes in them are shown, not run.
      const [file, argv, timeout] = notificationCommand({ title, message, urgency });
      if (PLATFORM === 'linux') {
        // No notification daemon is not an error worth reporting.
        await execFileAsync(file, argv, { timeout }).catch(() => {});
      } else {
        await execFileAsync(file, argv, { timeout });
      }
      return { success: true, title, message, platform: PLATFORM };
    } catch (err) {
      return { success: false, error: err.message, note: 'On macOS grant Notifications permission to your terminal in System Settings > Privacy & Security.' };
    }
  },
};

export const systemTools = [
  sysInfoTool,
  psListTool,
  envGetTool,
  notifyTool,
];
export default systemTools;
