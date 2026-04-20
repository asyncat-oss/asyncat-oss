// den/src/agent/tools/shellTools.js
// ─── Shell Execution Tools ───────────────────────────────────────────────────
// Execute commands, Python scripts, and Node.js code in a sandboxed process.
// All dangerous — always require user permission.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PermissionLevel } from './toolRegistry.js';

const DEFAULT_TIMEOUT = parseInt(process.env.AGENT_CMD_TIMEOUT ?? '30000', 10); // 30s
const MAX_OUTPUT = 16000; // chars

/** Run a command and capture output. */
function runProcess(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const timeout = options.timeout || DEFAULT_TIMEOUT;
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn(cmd, args, {
      cwd: options.cwd || process.cwd(),
      shell: true,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, timeout);

    proc.stdout?.on('data', d => { stdout += d.toString(); });
    proc.stderr?.on('data', d => { stderr += d.toString(); });

    proc.on('error', err => {
      clearTimeout(timer);
      resolve({ success: false, exit_code: -1, stdout: '', stderr: err.message, killed: false, error: err.message });
    });

    proc.on('close', code => {
      clearTimeout(timer);
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
    // Verify cwd is within workspace
    if (!cwd.startsWith(path.resolve(context.workingDir))) {
      return { success: false, error: 'Working directory must be within the workspace.' };
    }
    const timeout = (args.timeout || 30) * 1000;
    return await runProcess('/bin/sh', ['-c', args.command], { cwd, timeout });
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
    const tmpDir = path.join(context.workingDir, '.agent_tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `script_${Date.now()}.py`);
    try {
      fs.writeFileSync(tmpFile, args.code, 'utf8');
      const timeout = (args.timeout || 30) * 1000;
      const result = await runProcess('python3', [tmpFile], { cwd: context.workingDir, timeout });
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
    const tmpDir = path.join(context.workingDir, '.agent_tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `script_${Date.now()}.mjs`);
    try {
      fs.writeFileSync(tmpFile, args.code, 'utf8');
      const timeout = (args.timeout || 30) * 1000;
      const result = await runProcess('node', [tmpFile], { cwd: context.workingDir, timeout });
      return result;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  },
};

export const shellTools = [runCommandTool, runPythonTool, runNodeTool];
export default shellTools;
