// den/src/agent/tools/dockerTools.js
// ─── Docker + Sandbox Tools ────────────────────────────────────────────────────
// Run commands in Docker containers, build images, manage containers.

import path from 'path';
import { PermissionLevel } from './toolRegistry.js';
import { clampInt, hasBin, runFile, runProcess, missingDepError, safePath } from './shared.js';

function hasDocker() { return hasBin('docker'); }

/** An image or tag name; anything starting with - would be read as an option. */
function dockerImageName(value) {
  const name = String(value ?? '').trim();
  if (!name || name.startsWith('-') || /\s/.test(name)) throw new Error(`Not a Docker image name: "${name}"`);
  return name;
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
      return { success: false, error: missingDepError('docker', 'https://docs.docker.com/get-docker/') };
    }

    const image = dockerImageName(args.image);
    const workDir = String(args.cwd || '/workspace');
    const timeout = clampInt(args.timeout, 60, 1, 3600) * 1000;
    const dockerArgs = ['run', '--rm'];
    if (args.volumes) {
      for (const vol of String(args.volumes).split(',').map(v => v.trim()).filter(Boolean)) dockerArgs.push('-v', vol);
    }
    for (const [k, v] of Object.entries(args.env_vars || {})) dockerArgs.push('-e', `${k}=${v}`);
    dockerArgs.push('-w', workDir, '--', image, 'sh', '-c', String(args.command ?? ''));

    const result = await runProcess('docker', dockerArgs, { cwd: context.workingDir, timeout });
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
      return { success: false, error: missingDepError('docker', 'https://docs.docker.com/get-docker/') };
    }

    const dockerfilePath = args.path ? safePath(args.path, context.workingDir) : context.workingDir;
    const tag = dockerImageName(args.tag);
    const timeout = clampInt(args.timeout, 300, 1, 7200) * 1000;
    const buildArgs = ['build', ...(args.no_cache ? ['--no-cache'] : []), '-t', tag];
    if (args.path) buildArgs.push('-f', path.join(dockerfilePath, 'Dockerfile'));
    buildArgs.push(dockerfilePath);

    const result = await runProcess('docker', buildArgs, { cwd: context.workingDir, timeout });
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
      return { success: false, error: missingDepError('docker', 'https://docs.docker.com/get-docker/') };
    }

    const format = 'table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}\t{{.Names}}';
    try {
      const res = runFile('docker', ['ps', ...(args.all ? ['-a'] : []), '--format', format], { timeout: 10000 });
      if (!res.ok) throw new Error(res.error);
      const output = res.stdout;
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
      return { success: false, error: missingDepError('docker', 'https://docs.docker.com/get-docker/') };
    }

    const timeout = clampInt(args.timeout, 10, 0, 600);
    try {
      const res = runFile('docker', ['stop', '-t', timeout, '--', dockerImageName(args.container)], { timeout: (timeout + 5) * 1000 });
      if (!res.ok) throw new Error(res.error);
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

    const image = dockerImageName(args.image || 'ubuntu:22.04');
    const timeout = clampInt(args.timeout, 30, 1, 600) * 1000;
    const result = await runProcess('docker', [
      'run', '--rm', '--memory=256m', '--cpus=0.5', '--pids-limit=50', '--network=none', '--read-only',
      '-w', '/tmp', '--', image, 'sh', '-c', String(args.command ?? ''),
    ], { cwd: context.workingDir, timeout });
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
