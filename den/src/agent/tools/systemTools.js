// den/src/agent/tools/systemTools.js
// ─── System & OS Tools ───────────────────────────────────────────────────────
// Gives the agent visibility into the running system.
// Zero new packages — uses Node.js built-ins only (os, child_process, fs).

import os from 'os';
import { execSync, spawn } from 'child_process';
import { PermissionLevel } from './toolRegistry.js';

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
      const limit = args.limit   || 20;

      // ps output: pid, %cpu, %mem, command
      const raw = execSync(
        `ps aux --no-headers 2>/dev/null | awk '{printf "%s\\t%s\\t%s\\t%s\\n", $2, $3, $4, $11}' | sort -k${sort === 'mem' ? 3 : 2} -rn | head -${limit + 5}`,
        { encoding: 'utf8', timeout: 5000 }
      );

      let procs = raw.trim().split('\n').map(line => {
        const [pid, cpu, mem, cmd] = line.split('\t');
        return { pid: parseInt(pid), cpu: parseFloat(cpu), mem: parseFloat(mem), command: cmd };
      }).filter(p => !isNaN(p.pid));

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

// ── notify ────────────────────────────────────────────────────────────────────
export const notifyTool = {
  name: 'notify',
  description: 'Send a desktop system notification. Use to alert the user when a long task finishes, an error occurs, or something needs attention — especially useful when the TUI is backgrounded.',
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
    const title   = args.title.slice(0, 100);
    const message = args.message.slice(0, 300);
    const urgency = args.urgency || 'normal';
    const platform = os.platform();

    try {
      if (platform === 'linux') {
        // notify-send is available on most Linux desktops
        execSync(
          `notify-send --urgency=${urgency} ${JSON.stringify(title)} ${JSON.stringify(message)} 2>/dev/null || true`,
          { timeout: 3000 }
        );
      } else if (platform === 'darwin') {
        execSync(
          `osascript -e 'display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}'`,
          { timeout: 3000 }
        );
      } else if (platform === 'win32') {
        // PowerShell toast notification
        execSync(
          `powershell -command "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; $t = [Windows.UI.Notifications.ToastTemplateType]::ToastText02; $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($t); $xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${title}')); $xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode('${message}')); $toast = [Windows.UI.Notifications.ToastNotification]::new($xml); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Asyncat').Show($toast)"`,
          { timeout: 5000 }
        );
      }
      return { success: true, title, message, platform };
    } catch (err) {
      return { success: false, error: err.message, note: 'Notification may not be supported in this environment.' };
    }
  },
};

// ── test_runner ───────────────────────────────────────────────────────────────
export const testRunnerTool = {
  name: 'run_tests',
  description: 'Run the test suite for a project directory. Auto-detects the test framework (Jest, Vitest, Mocha, npm test). Returns pass/fail counts and error details. Use to validate code changes.',
  category: 'system',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      cwd:     { type: 'string',  description: 'Directory to run tests in (default: current working dir)' },
      filter:  { type: 'string',  description: 'Optional: run only tests matching this pattern/filename' },
      timeout: { type: 'number',  description: 'Timeout in seconds (default: 60)' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd     = args.cwd ? args.cwd : context.workingDir;
    const timeout = (args.timeout || 60) * 1000;

    // Detect framework from package.json
    let framework = 'npm';
    let cmd       = 'npm test -- --passWithNoTests';
    try {
      const pkg = JSON.parse(
        require('fs').readFileSync(require('path').join(cwd, 'package.json'), 'utf8')
      );
      const devDeps = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
      const scripts = pkg.scripts || {};

      if (devDeps['vitest'] || scripts.test?.includes('vitest')) {
        framework = 'vitest';
        cmd = `npx vitest run ${args.filter ? `--reporter=verbose "${args.filter}"` : '--reporter=verbose'} 2>&1`;
      } else if (devDeps['jest'] || scripts.test?.includes('jest')) {
        framework = 'jest';
        cmd = `npx jest ${args.filter ? `"${args.filter}"` : ''} --passWithNoTests 2>&1`;
      } else if (devDeps['mocha'] || scripts.test?.includes('mocha')) {
        framework = 'mocha';
        cmd = `npx mocha ${args.filter ? `"${args.filter}"` : ''} 2>&1`;
      } else if (scripts.test) {
        framework = 'npm';
        cmd = `npm test 2>&1`;
      }
    } catch {}

    return new Promise((resolve) => {
      let output = '';
      const proc = spawn('/bin/sh', ['-c', cmd], { cwd, shell: false });
      const timer = setTimeout(() => {
        proc.kill();
        resolve({ success: false, error: `Tests timed out after ${args.timeout || 60}s`, output });
      }, timeout);

      proc.stdout?.on('data', d => { output += d.toString(); });
      proc.stderr?.on('data', d => { output += d.toString(); });
      proc.on('close', code => {
        clearTimeout(timer);
        if (output.length > 8000) output = output.slice(0, 8000) + '\n... [truncated]';

        // Parse pass/fail from output
        const passMatch = output.match(/(\d+)\s+(?:passing|passed|tests? passed)/i);
        const failMatch = output.match(/(\d+)\s+(?:failing|failed|tests? failed)/i);

        resolve({
          success: code === 0,
          exit_code: code,
          framework,
          passed: passMatch ? parseInt(passMatch[1]) : null,
          failed: failMatch ? parseInt(failMatch[1]) : null,
          output,
        });
      });
    });
  },
};

// ── clipboard ────────────────────────────────────────────────────────────────
export const clipboardReadTool = {
  name: 'clipboard_read',
  description: 'Read the current clipboard contents. Useful to grab text the user has copied.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => {
    try {
      let content = '';
      const platform = os.platform();
      if (platform === 'linux') {
        content = execSync('xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null || wl-paste 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 3000 });
      } else if (platform === 'darwin') {
        content = execSync('pbpaste', { encoding: 'utf8', timeout: 3000 });
      } else if (platform === 'win32') {
        content = execSync('powershell Get-Clipboard', { encoding: 'utf8', timeout: 3000 });
      }
      return { success: true, content: content.trim().slice(0, 4000) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const clipboardWriteTool = {
  name: 'clipboard_write',
  description: 'Write text to the clipboard. Use to put results, code, or output directly into the user\'s clipboard so they can paste it.',
  category: 'system',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to copy to clipboard' },
    },
    required: ['text'],
  },
  execute: async (args) => {
    try {
      const text     = args.text.slice(0, 10000);
      const platform = os.platform();
      if (platform === 'linux') {
        const proc = spawn('sh', ['-c', 'xclip -selection clipboard 2>/dev/null || xsel --clipboard --input 2>/dev/null || wl-copy 2>/dev/null']);
        proc.stdin.write(text);
        proc.stdin.end();
        await new Promise(r => proc.on('close', r));
      } else if (platform === 'darwin') {
        const proc = spawn('pbcopy');
        proc.stdin.write(text);
        proc.stdin.end();
        await new Promise(r => proc.on('close', r));
      } else if (platform === 'win32') {
        execSync(`echo ${JSON.stringify(text)} | clip`, { timeout: 3000 });
      }
      return { success: true, length: text.length };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const systemTools = [
  sysInfoTool,
  psListTool,
  envGetTool,
  notifyTool,
  testRunnerTool,
  clipboardReadTool,
  clipboardWriteTool,
];
export default systemTools;
