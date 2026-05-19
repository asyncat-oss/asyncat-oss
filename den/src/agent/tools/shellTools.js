// den/src/agent/tools/shellTools.js
// ─── Shell Execution Tools ───────────────────────────────────────────────────
// Execute commands, Python scripts, and Node.js code in a sandboxed process.
// All dangerous — always require user permission.
// Supports streaming output via tool_progress events.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { IS_WIN } from './shared.js';
import { PermissionLevel } from './toolRegistry.js';
import { getTmpDir } from '../workspacePaths.js';
import { shellSessionManager } from '../ShellSessionManager.js';
const DEFAULT_TIMEOUT = parseInt(process.env.AGENT_CMD_TIMEOUT ?? '120000', 10); // 120s (was 30s — too short for npm install/build)
const MAX_OUTPUT = 32000; // chars (was 16000 — too small for test/build output)
const STREAM_INTERVAL_MS = 250; // how often to flush streaming progress

// Smart timeout defaults based on command content
function getSmartTimeout(command, userTimeout) {
  if (userTimeout) return userTimeout * 1000;
  const cmd = String(command || '').toLowerCase();
  // Install/build commands need more time
  if (/\b(npm\s+install|yarn\s+(install|add)|pip\s+install|cargo\s+build|make\b|cmake|gradle|mvn)/.test(cmd)) return 180000;
  if (/\b(npm\s+run\s+build|npm\s+run\s+dev|next\s+build|tsc|webpack|vite\s+build)/.test(cmd)) return 180000;
  // Test commands get moderate time
  if (/\b(npm\s+test|jest|pytest|cargo\s+test|go\s+test|mocha|vitest)/.test(cmd)) return 120000;
  return DEFAULT_TIMEOUT;
}

/** Run a command and capture output — cross-platform, with optional streaming. */
function runProcess(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    const emitEvent = options.emitEvent || null;
    let stdout = '';
    let stderr = '';
    let killed = false;
    let lastStreamedLength = 0;
    let streamTimer = null;

    const proc = spawn(cmd, args, {
      cwd: options.cwd || process.cwd(),
      shell: true,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const killTimer = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, timeout);

    // Stream progress to the frontend in real-time
    const flushProgress = () => {
      if (!emitEvent) return;
      const currentOutput = stdout + (stderr ? `\n[stderr] ${stderr.slice(-500)}` : '');
      if (currentOutput.length > lastStreamedLength) {
        const newContent = currentOutput.slice(lastStreamedLength, lastStreamedLength + 2000);
        lastStreamedLength = Math.min(currentOutput.length, lastStreamedLength + 2000);
        emitEvent({
          type: 'tool_progress',
          data: {
            tool: options.toolName || 'run_command',
            chunk: newContent,
            totalLength: currentOutput.length,
          },
        });
      }
    };

    // Set up periodic streaming
    if (emitEvent) {
      streamTimer = setInterval(flushProgress, STREAM_INTERVAL_MS);
    }

    proc.stdout?.on('data', d => { stdout += d.toString(); });
    proc.stderr?.on('data', d => { stderr += d.toString(); });

    proc.on('error', err => {
      clearTimeout(killTimer);
      if (streamTimer) clearInterval(streamTimer);
      resolve({ success: false, exit_code: -1, stdout: '', stderr: err.message, killed: false, error: err.message });
    });

    proc.on('close', code => {
      clearTimeout(killTimer);
      if (streamTimer) clearInterval(streamTimer);

      // Final flush
      if (emitEvent) {
        flushProgress();
        emitEvent({
          type: 'tool_progress',
          data: {
            tool: options.toolName || 'run_command',
            chunk: null,
            done: true,
            exitCode: code,
            totalLength: stdout.length + stderr.length,
          },
        });
      }

      // Truncate output
      if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT) + '\n... [output truncated]';
      if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT) + '\n... [output truncated]';

      resolve({
        success: code === 0,
        exit_code: code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        killed,
        ...(killed ? { error: `Command timed out after ${timeout / 1000}s and was killed.` } : {}),
      });
    });
  });
}

export const runCommandTool = {
  name: 'run_command',
  description: 'Execute a shell command. Use for installing packages, running scripts, git operations, etc. Output (stdout + stderr) is captured and returned.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      cwd: { type: 'string', description: 'Working directory (relative to workspace root, default: workspace root)' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
    },
    required: ['command'],
  },
  execute: async (args, context) => {
    const cwd = args.cwd ? path.resolve(context.workingDir, args.cwd) : context.workingDir;
    if (!cwd.startsWith(path.resolve(context.workingDir))) {
      return { success: false, error: 'Working directory must be within the workspace.' };
    }
    const timeout = getSmartTimeout(args.command, args.timeout);
    const [sh, flag] = IS_WIN ? ['cmd.exe', '/c'] : ['/bin/sh', '-c'];
    return await runProcess(sh, [flag, args.command], {
      cwd,
      timeout,
      toolName: 'run_command',
      emitEvent: context.emitEvent || null,
    });
  },
};

export const runPythonTool = {
  name: 'run_python',
  description: 'Execute a Python script. The code is written to a temp file and run with python3. Use for data processing, calculations, or testing Python code.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Python code to execute' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
    },
    required: ['code'],
  },
  execute: async (args, context) => {
    const tmpDir = getTmpDir(context.workingDir);
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `script_${Date.now()}.py`);
    try {
      fs.writeFileSync(tmpFile, args.code, 'utf8');
      const timeout = (args.timeout || 30) * 1000;
      const python = IS_WIN ? 'python' : 'python3';
      const result = await runProcess(python, [tmpFile], {
        cwd: context.workingDir,
        timeout,
        toolName: 'run_python',
        emitEvent: context.emitEvent || null,
      });
      return result;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  },
};

export const runNodeTool = {
  name: 'run_node',
  description: 'Execute JavaScript/Node.js code. The code is written to a temp file and run with node. Use for testing JS code, running scripts, or data manipulation.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript/Node.js code to execute' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
    },
    required: ['code'],
  },
  execute: async (args, context) => {
    const tmpDir = getTmpDir(context.workingDir);
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `script_${Date.now()}.mjs`);
    try {
      fs.writeFileSync(tmpFile, args.code, 'utf8');
      const timeout = (args.timeout || 30) * 1000;
      const result = await runProcess('node', [tmpFile], {
        cwd: context.workingDir,
        timeout,
        toolName: 'run_node',
        emitEvent: context.emitEvent || null,
      });
      return result;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  },
};

// ─── Persistent Shell Session Tools ──────────────────────────────────────────

export const shellSessionStartTool = {
  name: 'shell_session_start',
  description: 'Start a persistent shell session that remembers working directory and environment across commands. Use this when you need to cd into a directory and run multiple commands there, run a long-lived process (dev server, REPL), or maintain state between commands. Returns a session name to use with shell_session_run.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Session name (default: "default"). Use different names for independent workflows.' },
      cwd: { type: 'string', description: 'Starting working directory (default: workspace root).' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const agentSessionId = context.session?.id || 'anon';
    const name = args.name || 'default';
    const cwd = args.cwd ? path.resolve(context.workingDir, args.cwd) : context.workingDir;
    const { id, reused } = shellSessionManager.create({ agentSessionId, name, cwd });
    return { success: true, session_name: name, reused, cwd, message: reused ? `Reused existing session "${name}".` : `Started shell session "${name}" in ${cwd}.` };
  },
};

export const shellSessionRunTool = {
  name: 'shell_session_run',
  description: 'Run a command in a persistent shell session. The session remembers cd, exports, and other state. Great for multi-step workflows in the same directory, REPL interaction, or long-running processes. Start a session first with shell_session_start.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run in the session.' },
      name: { type: 'string', description: 'Session name (default: "default").' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 120).' },
    },
    required: ['command'],
  },
  execute: async (args, context) => {
    const agentSessionId = context.session?.id || 'anon';
    const name = args.name || 'default';
    let session = shellSessionManager.get(agentSessionId, name);
    if (!session || !session.alive) {
      // Auto-create if not started
      shellSessionManager.create({ agentSessionId, name, cwd: context.workingDir });
      session = shellSessionManager.get(agentSessionId, name);
    }
    const timeout = (args.timeout || 120) * 1000;
    const result = await session.run(args.command, { timeout, emitEvent: context.emitEvent || null });
    return {
      success: result.success,
      output: result.output,
      exit_code: result.exitCode,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};

export const shellSessionCloseTool = {
  name: 'shell_session_close',
  description: 'Close a persistent shell session and free its resources. Call this when you are done with a dev server or REPL session.',
  category: 'shell',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Session name to close (default: "default").' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const agentSessionId = context.session?.id || 'anon';
    const name = args.name || 'default';
    shellSessionManager.close(agentSessionId, name);
    return { success: true, message: `Session "${name}" closed.` };
  },
};

export const shellTools = [
  runCommandTool, runPythonTool, runNodeTool,
  shellSessionStartTool, shellSessionRunTool, shellSessionCloseTool,
];
export default shellTools;
