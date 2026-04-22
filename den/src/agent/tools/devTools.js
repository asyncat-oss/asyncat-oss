// den/src/agent/tools/devTools.js
// ─── Development Workflow Tools ───────────────────────────────────────────────
// Linters, build runners, package managers, code fixers, log readers.

import { spawn } from 'child_process';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PermissionLevel } from './toolRegistry.js';

function runProc(cmd, cwd, timeout = 60000) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '';
    const proc = spawn('/bin/sh', ['-c', cmd], { cwd, shell: false });
    const timer = setTimeout(() => { proc.kill(); resolve({ success: false, error: `Timed out after ${timeout / 1000}s`, stdout, stderr }); }, timeout);
    proc.stdout?.on('data', d => { stdout += d.toString(); });
    proc.stderr?.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ success: code === 0, exit_code: code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    proc.on('error', err => resolve({ success: false, error: err.message }));
  });
}

function detectPackageManager(cwd) {
  try {
    const files = fs.readdirSync(cwd);
    if (files.includes('pnpm-lock.yaml')) return 'pnpm';
    if (files.includes('yarn.lock')) return 'yarn';
    if (files.includes('package-lock.json')) return 'npm';
    if (files.includes('package.json')) return 'npm';
    if (files.includes('poetry.lock')) return 'pip (poetry)';
    if (files.includes('requirements.txt')) return 'pip';
    if (files.includes('Cargo.lock')) return 'cargo';
    if (files.includes('go.mod')) return 'go';
    if (files.includes('Makefile')) return 'make';
    if (files.includes('CMakeLists.txt')) return 'cmake';
  } catch {}
  return null;
}

export const linterRunTool = {
  name: 'linter_run',
  description: 'Run a linter on files or the whole project. Auto-detects the linter (ESLint, Prettier, Ruff, Black, etc.) from the project.',
  category: 'dev',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to lint (file or directory, default: working directory)' },
      fix: { type: 'boolean', description: 'Auto-fix issues where possible (default: false)' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 60)' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    const timeout = (args.timeout || 60) * 1000;
    let cmd, linter;

    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      const devDeps = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
      const scripts = pkg.scripts || {};

      if (devDeps['eslint'] || scripts['lint']?.includes('eslint')) {
        linter = 'eslint';
        cmd = `npx eslint${args.fix ? ' --fix' : ''} . 2>&1`;
      } else if (devDeps['prettier'] || scripts['format']?.includes('prettier')) {
        linter = 'prettier';
        cmd = args.fix ? `npx prettier --write .` : `npx prettier --check .`;
      } else if (devDeps['ruff']) {
        linter = 'ruff';
        cmd = args.fix ? `npx ruff check --fix .` : `npx ruff check .`;
      } else if (devDeps['black'] || devDeps['black[c]']) {
        linter = 'black';
        cmd = args.fix ? `npx black .` : `npx black --check .`;
      } else if (devDeps['flake8']) {
        linter = 'flake8';
        cmd = `npx flake8 .`;
      } else {
        return { success: false, error: 'No linter found. Tried: eslint, prettier, ruff, black, flake8' };
      }
    } catch {
      return { success: false, error: 'Could not detect package manager or linter.' };
    }

    const result = await runProc(cmd, cwd, timeout);
    return { ...result, linter, auto_fix: args.fix || false };
  },
};

export const codeFixTool = {
  name: 'code_fix',
  description: 'Auto-fix lint issues and common code problems. Detects the project linter and runs with --fix flag.',
  category: 'dev',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to fix (default: working directory)' },
      linter: { type: 'string', description: 'Force a specific linter: eslint, prettier, ruff, black' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    const timeout = 120000;
    let cmd;

    if (args.linter === 'eslint') cmd = 'npx eslint --fix . 2>&1';
    else if (args.linter === 'prettier') cmd = 'npx prettier --write . 2>&1';
    else if (args.linter === 'ruff') cmd = 'npx ruff check --fix . 2>&1';
    else if (args.linter === 'black') cmd = 'npx black . 2>&1';
    else {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
        const devDeps = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
        if (devDeps['eslint']) { cmd = 'npx eslint --fix . 2>&1'; }
        else if (devDeps['ruff']) { cmd = 'npx ruff check --fix . 2>&1'; }
        else if (devDeps['prettier']) { cmd = 'npx prettier --write . 2>&1'; }
        else if (devDeps['black']) { cmd = 'npx black . 2>&1'; }
        else { return { success: false, error: 'No auto-fixable linter found.' }; }
      } catch { return { success: false, error: 'Could not detect project linter.' }; }
    }

    const result = await runProc(cmd, cwd, timeout);
    return { ...result, action: 'code_fix', auto_fixed: result.success };
  },
};

export const packageManagerTool = {
  name: 'package_manager',
  description: 'Detect and run package manager commands. Auto-detects npm, pnpm, yarn, pip, poetry, or cargo.',
  category: 'dev',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Package manager command to run (e.g. "install", "update", "add <pkg>")' },
      path: { type: 'string', description: 'Path to project (default: working directory)' },
      dev: { type: 'boolean', description: 'Install as dev dependency (for npm/pnpm/yarn)' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 120)' },
    },
    required: ['command'],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    const timeout = (args.timeout || 120) * 1000;
    const pm = detectPackageManager(cwd);

    if (!pm) {
      return { success: false, error: 'Could not detect package manager. No package.json, poetry.lock, requirements.txt, Cargo.lock, or go.mod found.' };
    }

    let cmd;
    const parts = args.command.split(' ');
    const subcmd = parts[0];
    const pkg = parts.slice(1).join(' ');

    if (pm === 'npm' || pm === 'pnpm' || pm === 'yarn') {
      const devFlag = args.dev ? '--save-dev' : '';
      switch (subcmd) {
        case 'install': cmd = pkg ? `${pm} install ${devFlag} ${pkg}` : `${pm} install`; break;
        case 'update': cmd = pkg ? `${pm} update ${pkg}` : `${pm} update`; break;
        case 'remove': cmd = `${pm} remove ${pkg}`; break;
        case 'audit': cmd = `${pm} audit`; break;
        case 'outdated': cmd = `${pm} outdated`; break;
        default: cmd = `${pm} ${args.command}`;
      }
    } else if (pm === 'pip (poetry)') {
      switch (subcmd) {
        case 'install': cmd = pkg ? `poetry add ${pkg}` : `poetry install`; break;
        case 'update': cmd = pkg ? `poetry update ${pkg}` : `poetry update`; break;
        case 'remove': cmd = `poetry remove ${pkg}`; break;
        default: cmd = `poetry ${args.command}`;
      }
    } else if (pm === 'pip') {
      switch (subcmd) {
        case 'install': cmd = pkg ? `pip install ${pkg}` : `pip install -r requirements.txt`; break;
        case 'update': cmd = `pip install --upgrade ${pkg || 'pip'}`; break;
        case 'freeze': cmd = 'pip freeze'; break;
        default: cmd = `pip ${args.command}`;
      }
    } else if (pm === 'cargo') {
      switch (subcmd) {
        case 'install': cmd = pkg ? `cargo install ${pkg}` : `cargo build`; break;
        case 'update': cmd = 'cargo update'; break;
        case 'build': cmd = 'cargo build'; break;
        case 'test': cmd = 'cargo test'; break;
        case 'check': cmd = 'cargo check'; break;
        default: cmd = `cargo ${args.command}`;
      }
    } else if (pm === 'go') {
      switch (subcmd) {
        case 'install': cmd = `go install ${pkg}`; break;
        case 'get': cmd = `go get ${pkg}`; break;
        case 'mod': cmd = `go mod ${parts.slice(1).join(' ')}`; break;
        default: cmd = `go ${args.command}`;
      }
    } else if (pm === 'make') {
      cmd = `make ${parts.slice(1).join(' ')}`;
    } else if (pm === 'cmake') {
      if (subcmd === 'build') {
        const buildDir = path.join(cwd, 'build');
        if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
        cmd = `cd "${buildDir}" && cmake .. && make`;
      } else {
        cmd = `cmake ${args.command}`;
      }
    } else {
      return { success: false, error: `Package manager "${pm}" not supported yet.` };
    }

    const result = await runProc(cmd, cwd, timeout);
    return { ...result, package_manager: pm, command: cmd };
  },
};

export const buildRunnerTool = {
  name: 'build_runner',
  description: 'Detect and run the build command for a project. Supports Make, CMake, Cargo, npm build, Gradle, Maven, etc.',
  category: 'dev',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to project (default: working directory)' },
      target: { type: 'string', description: 'Build target (e.g. "debug", "release")' },
      clean: { type: 'boolean', description: 'Clean before building (default: false)' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 120)' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = args.path || context.workingDir;
    const timeout = (args.timeout || 120) * 1000;
    let cmd, builder;

    try {
      const files = fs.readdirSync(cwd);
      if (files.includes('Makefile')) { builder = 'make'; cmd = args.clean ? 'make clean && make' : 'make'; }
      else if (files.includes('CMakeLists.txt')) {
        builder = 'cmake';
        const buildDir = path.join(cwd, 'build');
        if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
        const targetFlag = args.target ? `-DCMAKE_BUILD_TYPE=${args.target}` : '';
        cmd = `cd "${buildDir}" && cmake .. ${targetFlag} && make`;
      }
      else if (files.includes('Cargo.toml')) { builder = 'cargo'; cmd = args.clean ? 'cargo clean && cargo build' : 'cargo build'; }
      else if (files.includes('package.json')) {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
        const scripts = pkg.scripts || {};
        builder = 'npm';
        if (scripts['build']) cmd = 'npm run build';
        else if (scripts['compile']) cmd = 'npm run compile';
        else return { success: false, error: 'No build script found in package.json' };
      }
      else if (files.includes('build.gradle') || files.includes('build.gradle.kts')) { builder = 'gradle'; cmd = args.clean ? './gradlew clean build' : './gradlew build'; }
      else if (files.includes('pom.xml')) { builder = 'maven'; cmd = args.clean ? 'mvn clean install' : 'mvn install'; }
      else if (files.includes('go.mod')) { builder = 'go'; cmd = 'go build ./...'; }
      else return { success: false, error: 'No build system detected. Tried: Make, CMake, Cargo, npm, Gradle, Maven, Go' };
    } catch (err) {
      return { success: false, error: err.message };
    }

    const result = await runProc(cmd, cwd, timeout);
    return { ...result, builder, path: cwd };
  },
};

export const consoleReadTool = {
  name: 'console_read',
  description: 'Read application logs from a file or stdout/stderr of a running process. Useful for debugging.',
  category: 'dev',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to log file (e.g. "logs/app.log") or process name' },
      lines: { type: 'number', description: 'Number of lines to read from end (default: 50)' },
      filter: { type: 'string', description: 'Filter lines containing this text' },
      follow: { type: 'boolean', description: 'Follow tail -f style (default: false, only returns current)' },
    },
    required: [],
  },
  execute: async (args, context) => {
    const cwd = context.workingDir;
    const lines = args.lines || 50;
    let cmd, logPath;

    if (args.path) {
      logPath = path.join(cwd, args.path);
    } else {
      const commonPaths = ['logs/app.log', 'logs/server.log', 'app.log', 'server.log', '.logs/app.log'];
      for (const p of commonPaths) {
        if (fs.existsSync(path.join(cwd, p))) { logPath = path.join(cwd, p); break; }
      }
      if (!logPath) return { success: false, error: 'No log file specified and could not find common log paths.' };
    }

    if (!fs.existsSync(logPath)) {
      return { success: false, error: `Log file not found: ${args.path}` };
    }

    cmd = `tail -n ${lines} "${logPath}"`;
    if (args.filter) cmd += ` | grep "${args.filter.replace(/"/g, '\\"')}" || true`;

    try {
      let output = execSync(cmd, { encoding: 'utf8', timeout: 5000 });
      if (args.filter) output = output.trim().split('\n').filter(l => l.includes(args.filter)).join('\n');
      return { success: true, path: args.path, lines_read: output.split('\n').length, content: output.slice(0, 8000) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const devTools = [
  linterRunTool, codeFixTool, packageManagerTool, buildRunnerTool, consoleReadTool,
];
export default devTools;
