// den/src/agent/tools/dockerTools.js
// ─── Docker + Sandbox Tools ────────────────────────────────────────────────────
// Run commands in Docker containers, build images, manage containers.

import { spawn } from 'child_process';
import { execSync } from 'child_process';
import path from 'path';
import { PermissionLevel } from './toolRegistry.js';

const MAX_OUTPUT = 16000;

function runProcess(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const timeout = options.timeout || 30000;
    let stdout = '', stderr = '';
    let killed = false;
    const proc = spawn(cmd, args, {
      cwd: options.cwd || process.cwd(),
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => { killed = true; proc.kill('SIGKILL'); }, timeout);
    proc.stdout?.on('data', d => { stdout += d.toString(); });
    proc.stderr?.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      clearTimeout(timer);
      if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT) + '\n... [output truncated]';
      if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT) + '\n... [output truncated]';
      resolve({ success: code === 0, exit_code: code, stdout: stdout.trim(), stderr: stderr.trim(), killed });
    });
    proc.on('error', err => resolve({ success: false, exit_code: -1, stdout: '', stderr: err.message, killed: false }));
  });
}

function hasDocker() {
  try { execSync('which docker 2>/dev/null'); return true; } catch { return false; }
}

function hasDockerCompose() {
  try { execSync('which docker-compose 2>/dev/null'); return true; } catch { return false; }
}

export const dockerRunTool = {
  name: 'docker_run',
  description: 'Run a command inside an isolated Docker container. Use for sandboxed execution of untrusted code or to run tools in a specific environment.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      image: { type: 'string', description: 'Docker image to use (e.g. "node:20", "python:3.11", "ubuntu:22.04")' },
      command: { type: 'string', description: 'Command to run inside the container' },
      cwd: { type: 'string', description: 'Working directory inside the container (default: /workspace)' },
      volumes: { type: 'string', description: 'Volume mappings in Docker syntax, e.g. "/host/path:/container/path" (optional)' },
      env_vars: { type: 'object', description: 'Environment variables to set, e.g. {"KEY": "value"}' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 60)' },
      remove: { type: 'boolean', description: 'Remove container after run (default: true)' },
    },
    required: ['image', 'command'],
  },
  execute: async (args, context) => {
    if (!hasDocker()) {
      return { success: false, error: 'Docker is not installed or not in PATH. Install Docker to use this tool.' };
    }

    const workDir = args.cwd || '/workspace';
    const timeout = (args.timeout || 60) * 1000;
    let dockerCmd = `docker run --rm`;
    if (args.volumes) {
      const vols = args.volumes.split(',').map(v => v.trim()).filter(Boolean);
      for (const vol of vols) dockerCmd += ` -v ${vol}`;
    }
    if (args.env_vars) {
      for (const [k, v] of Object.entries(args.env_vars)) {
        dockerCmd += ` -e "${k}=${v}"`;
      }
    }
    dockerCmd += ` -w ${workDir} ${args.image} sh -c '${args.command.replace(/'/g, "'\\''")}'`;

    const result = await runProcess('/bin/sh', ['-c', dockerCmd], { cwd: context.workingDir, timeout });
    return {
      success: result.success,
      exit_code: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      image: args.image,
      killed: result.killed,
    };
  },
};

export const dockerBuildTool = {
  name: 'docker_build',
  description: 'Build a Docker image from a Dockerfile.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to Dockerfile context (default: working directory)' },
      tag: { type: 'string', description: 'Image tag/name, e.g. "myapp:latest"' },
      no_cache: { type: 'boolean', description: 'Build without cache (default: false)' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 300)' },
    },
    required: ['tag'],
  },
  execute: async (args, context) => {
    if (!hasDocker()) {
      return { success: false, error: 'Docker is not installed.' };
    }

    const dockerfilePath = args.path || context.workingDir;
    const tag = args.tag;
    const timeout = (args.timeout || 300) * 1000;
    let cmd = `docker build ${args.no_cache ? '--no-cache' : ''} -t "${tag}"`;
    if (args.path) cmd += ` -f "${path.join(dockerfilePath, 'Dockerfile')}" "${dockerfilePath}"`;
    else cmd += ` "${dockerfilePath}"`;

    const result = await runProcess('/bin/sh', ['-c', cmd], { cwd: context.workingDir, timeout });
    return {
      success: result.success,
      exit_code: result.exit_code,
      stdout: result.stdout.slice(-4000),
      stderr: result.stderr.slice(-2000),
      tag,
      image_built: result.success,
    };
  },
};

export const dockerPsTool = {
  name: 'docker_ps',
  description: 'List running Docker containers.',
  category: 'shell',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      all: { type: 'boolean', description: 'Show all containers (including stopped, default: false)' },
      format: { type: 'string', description: 'Output format: "table" (default) or "json"' },
    },
    required: [],
  },
  execute: async (args) => {
    if (!hasDocker()) {
      return { success: false, error: 'Docker is not installed.' };
    }

    const cmd = args.all ? 'docker ps -a --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}\t{{.Names}}"' : 'docker ps --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}\t{{.Names}}"';
    try {
      const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 });
      const lines = output.trim().split('\n').filter(Boolean);
      const headers = lines[0] ? lines[0].split('\t') : [];
      const rows = lines.slice(1).map(line => {
        const cols = line.split('\t');
        const obj = {};
        headers.forEach((h, i) => { obj[h.toLowerCase().replace(/ /g, '_')] = cols[i] || ''; });
        return obj;
      });
      return { success: true, count: rows.length, containers: rows };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const dockerStopTool = {
  name: 'docker_stop',
  description: 'Stop one or more running Docker containers.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      container: { type: 'string', description: 'Container ID or name to stop' },
      timeout: { type: 'number', description: 'Seconds to wait before SIGKILL (default: 10)' },
    },
    required: ['container'],
  },
  execute: async (args) => {
    if (!hasDocker()) {
      return { success: false, error: 'Docker is not installed.' };
    }

    const timeout = args.timeout || 10;
    try {
      execSync(`docker stop -t ${timeout} "${args.container}"`, { timeout: (timeout + 5) * 1000 });
      return { success: true, stopped: args.container };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const sandboxExecTool = {
  name: 'sandbox_exec',
  description: 'Execute untrusted or potentially dangerous code in a sandboxed Docker container with limited resources. Use this instead of run_command when executing code from unknown sources.',
  category: 'shell',
  permission: PermissionLevel.DANGEROUS,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to run' },
      image: { type: 'string', description: 'Docker image (default: "ubuntu:22.04")' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
    },
    required: ['command'],
  },
  execute: async (args, context) => {
    if (!hasDocker()) {
      return { success: false, error: 'Docker not available. Using host execution as fallback.' };
    }

    const image = args.image || 'ubuntu:22.04';
    const timeout = (args.timeout || 30) * 1000;
    const safeCmd = `docker run --rm \
      --memory="256m" \
      --cpus="0.5" \
      --pids-limit="50" \
      --network="none" \
      --read-only \
      -w /tmp \
      ${image} \
      sh -c '${args.command.replace(/'/g, "'\\''")}'`;

    const result = await runProcess('/bin/sh', ['-c', safeCmd], { cwd: context.workingDir, timeout });
    return {
      success: result.success,
      exit_code: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      sandboxed: true,
      memory_limit: '256m',
      cpu_limit: '0.5 cores',
      network: 'none (isolated)',
      killed: result.killed,
    };
  },
};

export const dockerTools = [
  dockerRunTool, dockerBuildTool, dockerPsTool, dockerStopTool, sandboxExecTool,
];
export default dockerTools;
