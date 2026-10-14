// den/src/agent/tools/shellTools.js
// ─── Shell Execution Tools ───────────────────────────────────────────────────
// Execute commands, Python scripts, and Node.js code. On Linux and macOS they
// run in a sandbox that only lets them write inside the project folder (see
// commandSandbox.js). Also persistent shell sessions, and commands on another
// machine over SSH. All dangerous — the user approves each one.
// Supports streaming output via tool_progress events.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { IS_WIN, clampInt, hasBin, isPathInside, missingDepError } from './shared.js';
import { PermissionLevel } from './toolRegistry.js';
import { getTmpDir } from '../workspacePaths.js';
import { shellSessionManager } from '../ShellSessionManager.js';
import { sandboxedCommand, sandboxHint } from '../commandSandbox.js';
import { childEnv } from '../childEnv.js';
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

/** Run file+args in options.cwd, in the project sandbox (when available), and explain sandbox failures. */
async function runInProject(file, args, context, options) {
  let plan;
  try {
    plan = sandboxedCommand({ file, args, workspaceRoot: context.workspaceRoot || context.workingDir, cwd: options.cwd });
  } catch (err) {
    return { success: false, error: err.message };
  }
  const result = await runProcess(plan.file, plan.args, { ...options, env: { ...(plan.env || {}), ...(options.env || {}) } });
  const hint = plan.sandboxed ? sandboxHint(result, plan.network) : null;
  return { ...result, ...(plan.sandboxed ? { sandboxed: true } : {}), ...(hint ? { note: hint } : {}) };
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
      // Callers already pass `sh -c <command>` (or an interpreter and a file).
      // A second shell would re-split it and run only the first word, so
      // `npm test` ran plain `npm`. cmd.exe tolerates the extra layer and
      // relies on Node's quoting for it, so Windows keeps it, unless the
      // caller runs a program directly (ssh).
      shell: options.shell ?? IS_WIN,
      env: childEnv({ extra: options.env }),
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
            toolCallId: options.toolCallId || null,
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
            toolCallId: options.toolCallId || null,
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
      cwd: { type: 'string', description: 'Working directory relative to the active Project folder.' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
    },
    required: ['command'],
  },
  execute: async (args, context) => {
    const cwd = args.cwd ? path.resolve(context.workingDir, args.cwd) : context.workingDir;
    if (!isPathInside(cwd, context.workingDir)) {
      return { success: false, error: 'Working directory must be within the workspace.' };
    }
    const timeout = getSmartTimeout(args.command, args.timeout);
    const [sh, flag] = IS_WIN ? ['cmd.exe', '/c'] : ['/bin/sh', '-c'];
    return await runInProject(sh, [flag, args.command], context, {
      cwd,
      timeout,
      toolName: 'run_command',
      toolCallId: context.toolCallId || null,
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
      const result = await runInProject(python, [tmpFile], context, {
        cwd: context.workingDir,
        timeout,
        toolName: 'run_python',
        toolCallId: context.toolCallId || null,
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
      const result = await runInProject('node', [tmpFile], context, {
        cwd: context.workingDir,
        timeout,
        toolName: 'run_node',
        toolCallId: context.toolCallId || null,
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
      cwd: { type: 'string', description: 'Starting working directory inside the active Project folder.' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const agentSessionId = context.session?.id || 'anon';
    const name = args.name || 'default';
    const cwd = args.cwd ? path.resolve(context.workingDir, args.cwd) : context.workingDir;
    if (!isPathInside(cwd, context.workingDir)) {
      return { success: false, error: 'Working directory must be within the workspace.' };
    }
    const { id, reused } = shellSessionManager.create({ agentSessionId, name, cwd, workspaceRoot: context.workspaceRoot || context.workingDir });
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
      shellSessionManager.create({ agentSessionId, name, cwd: context.workingDir, workspaceRoot: context.workspaceRoot || context.workingDir });
      session = shellSessionManager.get(agentSessionId, name);
    }
    const timeout = (args.timeout || 120) * 1000;
    const result = await session.run(args.command, {
      timeout,
      emitEvent: context.emitEvent
        ? (event) => context.emitEvent({
            ...event,
            data: {
              ...(event.data || {}),
              toolCallId: context.toolCallId || null,
            },
          })
        : null,
    });
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

// ── ssh_exec ─────────────────────────────────────────────────────────────────
export const sshExecTool = {
  name: 'ssh_exec',
  description: 'Execute a command on a remote host over SSH. Requires ssh to be installed and the host to be accessible. Use key_path for key-based auth or ensure the key is already loaded in ssh-agent.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      host:       { type: 'string', description: 'Remote host (hostname or IP)' },
      user:       { type: 'string', description: 'SSH username (default: current user)' },
      port:       { type: 'number', description: 'SSH port (default: 22)' },
      command:    { type: 'string', description: 'Command to run on the remote host' },
      key_path:   { type: 'string', description: 'Path to SSH private key file (optional)' },
      timeout:    { type: 'number', description: 'Timeout in seconds (default: 30)' },
    },
    required: ['host', 'command'],
  },
  execute: async (args, context) => {
    if (!hasBin('ssh')) {
      return missingDepError('ssh', IS_WIN ? 'Enable OpenSSH Client in Windows Features or install Git for Windows' : 'sudo apt install openssh-client (Linux) / brew install openssh (macOS)');
    }

    const host    = String(args.host ?? '').trim();
    const user    = args.user ? String(args.user).trim() : '';
    // A host or user starting with - would be read as an ssh option (-oProxyCommand=...).
    if (!host || /^-|\s/.test(host) || /^-|[\s@]/.test(user)) {
      return { success: false, error: 'host and user must be plain names.' };
    }
    const port    = clampInt(args.port, 22, 1, 65535);
    const timeout = clampInt(args.timeout, 30, 1, 600);
    const argv = [
      '-o', 'StrictHostKeyChecking=accept-new', '-o', `ConnectTimeout=${timeout}`, '-p', port,
      ...(args.key_path ? ['-i', path.resolve(context.workingDir, args.key_path)] : []),
      '--', `${user ? `${user}@` : ''}${host}`, String(args.command ?? ''),
    ];

    const result = await runProcess('ssh', argv.map(String), {
      cwd: context.workingDir,
      timeout: (timeout + 5) * 1000,
      shell: false,
      toolName: 'ssh_exec',
      toolCallId: context.toolCallId || null,
      emitEvent: context.emitEvent || null,
    });
    return {
      success: result.success,
      host: args.host,
      command: args.command,
      stdout: result.stdout?.slice(0, 8000),
      stderr: result.stderr?.slice(0, 2000),
      exit_code: result.exit_code,
      ...(result.error ? { error: result.error } : {}),
    };
  },
};

export const shellTools = [
  runCommandTool, runPythonTool, runNodeTool,
  shellSessionStartTool, shellSessionRunTool, shellSessionCloseTool,
  sshExecTool,
];
export default shellTools;
