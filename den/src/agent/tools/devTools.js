// den/src/agent/tools/devTools.js
// ─── Development Workflow Tools ───────────────────────────────────────────────
// Linters, build runners, package managers, code fixers, log readers.

import path from 'path';
import fs from 'fs';
import { PermissionLevel } from './toolRegistry.js';
import { IS_WIN, clampInt, runProcess, safePath } from './shared.js';
import { splitShellWords } from '../shellSafety.js';

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

// npm, npx, pnpm and yarn are .cmd files on Windows.
function nodeTool(name) {
  return IS_WIN ? `${name}.cmd` : name;
}

/**
 * The programs to run for a package manager command, as [file, argv, cwd?]
 * steps. Words come from splitShellWords, so nothing is ever given to a shell.
 */
export function packageManagerSteps(pm, words, { dev = false, cwd } = {}) {
  const [subcmd = '', ...rest] = words;
  const pkgs = rest;
  if (pm === 'npm' || pm === 'pnpm' || pm === 'yarn') {
    const bin = nodeTool(pm);
    if (subcmd === 'install' || subcmd === 'add') {
      if (!pkgs.length) return [[bin, ['install']]];
      if (pm === 'yarn') return [[bin, ['add', ...(dev ? ['-D'] : []), ...pkgs]]];
      return [[bin, ['install', ...(dev ? ['--save-dev'] : []), ...pkgs]]];
    }
    return [[bin, words]];
  }
  if (pm === 'pip (poetry)') {
    if (subcmd === 'install') return [['poetry', pkgs.length ? ['add', ...pkgs] : ['install']]];
    return [['poetry', words]];
  }
  if (pm === 'pip') {
    if (subcmd === 'install') return [['pip', pkgs.length ? ['install', ...pkgs] : ['install', '-r', 'requirements.txt']]];
    if (subcmd === 'update') return [['pip', ['install', '--upgrade', ...(pkgs.length ? pkgs : ['pip'])]]];
    return [['pip', words]];
  }
  if (pm === 'cargo') {
    if (subcmd === 'install') return [['cargo', pkgs.length ? ['install', ...pkgs] : ['build']]];
    return [['cargo', words]];
  }
  if (pm === 'go') return [['go', words]];
  if (pm === 'make') return [['make', subcmd === 'make' ? rest : words]];
  if (pm === 'cmake') {
    if (subcmd === 'build') {
      const buildDir = path.join(cwd, 'build');
      if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
      return [['cmake', ['..'], buildDir], ['make', [], buildDir]];
    }
    return [['cmake', words]];
  }
  throw new Error(`Package manager "${pm}" not supported yet.`);
}

/** Run steps in order, stopping at the first failure. */
async function runSteps(steps, { cwd, timeout }) {
  let combined = { success: true, stdout: '', stderr: '' };
  for (const [file, argv, stepCwd] of steps) {
    const result = await runProcess(file, argv, { cwd: stepCwd || cwd, timeout });
    combined = {
      ...result,
      stdout: [combined.stdout, result.stdout].filter(Boolean).join('\n'),
      stderr: [combined.stderr, result.stderr].filter(Boolean).join('\n'),
    };
    if (!result.success) break;
  }
  return combined;
}

function describeSteps(steps) {
  return steps.map(([file, argv]) => [file, ...argv].join(' ')).join(' && ');
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

    const result = await runProcess(cmd, [], { cwd, timeout });
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

    const result = await runProcess(cmd, [], { cwd, timeout });
    return { ...result, action: 'code_fix', auto_fixed: result.success };
  },
};

export const packageManagerTool = {
  name: 'package_manager',
  description: 'Detect and run package manager commands. Auto-detects npm, pnpm, yarn, pip, poetry, or cargo.',
  category: 'dev',
  permission: PermissionLevel.MODERATE,
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
    const cwd = args.path ? safePath(args.path, context.workingDir) : context.workingDir;
    const timeout = clampInt(args.timeout, 120, 1, 3600) * 1000;
    const pm = detectPackageManager(cwd);

    if (!pm) {
      return { success: false, error: 'Could not detect package manager. No package.json, poetry.lock, requirements.txt, Cargo.lock, or go.mod found.' };
    }

    // One command, split into words like a shell would, but run without one.
    const parsed = splitShellWords(String(args.command ?? '').trim());
    if (!parsed || parsed.segments.length !== 1) {
      return { success: false, error: 'Pass a single package manager command, without ; | & $ or redirects.' };
    }

    let steps;
    try {
      steps = packageManagerSteps(pm, parsed.segments[0], { dev: args.dev === true, cwd });
    } catch (err) {
      return { success: false, error: err.message };
    }
    const result = await runSteps(steps, { cwd, timeout });
    return { ...result, package_manager: pm, command: describeSteps(steps) };
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
    const cwd = args.path ? safePath(args.path, context.workingDir) : context.workingDir;
    const timeout = clampInt(args.timeout, 120, 1, 3600) * 1000;
    let steps, builder;

    try {
      const files = fs.readdirSync(cwd);
      if (files.includes('Makefile')) {
        builder = 'make';
        steps = args.clean ? [['make', ['clean']], ['make', []]] : [['make', []]];
      } else if (files.includes('CMakeLists.txt')) {
        builder = 'cmake';
        const buildDir = path.join(cwd, 'build');
        if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
        if (args.target && !/^[\w-]+$/.test(String(args.target))) {
          return { success: false, error: 'target must be a build type name such as Debug or Release.' };
        }
        steps = [
          ['cmake', ['..', ...(args.target ? [`-DCMAKE_BUILD_TYPE=${args.target}`] : [])], buildDir],
          ['make', [], buildDir],
        ];
      } else if (files.includes('Cargo.toml')) {
        builder = 'cargo';
        steps = args.clean ? [['cargo', ['clean']], ['cargo', ['build']]] : [['cargo', ['build']]];
      } else if (files.includes('package.json')) {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
        const scripts = pkg.scripts || {};
        builder = 'npm';
        if (scripts['build']) steps = [[nodeTool('npm'), ['run', 'build']]];
        else if (scripts['compile']) steps = [[nodeTool('npm'), ['run', 'compile']]];
        else return { success: false, error: 'No build script found in package.json' };
      } else if (files.includes('build.gradle') || files.includes('build.gradle.kts')) {
        builder = 'gradle';
        const gradlew = IS_WIN ? path.join(cwd, 'gradlew.bat') : './gradlew';
        steps = [[gradlew, args.clean ? ['clean', 'build'] : ['build']]];
      } else if (files.includes('pom.xml')) {
        builder = 'maven';
        steps = [[IS_WIN ? 'mvn.cmd' : 'mvn', args.clean ? ['clean', 'install'] : ['install']]];
      } else if (files.includes('go.mod')) {
        builder = 'go';
        steps = [['go', ['build', './...']]];
      } else {
        return { success: false, error: 'No build system detected. Tried: Make, CMake, Cargo, npm, Gradle, Maven, Go' };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }

    const result = await runSteps(steps, { cwd, timeout });
    return { ...result, builder, path: cwd, command: describeSteps(steps) };
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
    const lines = clampInt(args.lines, 50, 1, 5000);
    let logPath;

    if (args.path) {
      logPath = safePath(args.path, cwd);
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

    try {
      // Read the end of the file directly instead of running tail and grep.
      const size = fs.statSync(logPath).size;
      const readBytes = Math.min(size, 2 * 1024 * 1024);
      const fd = fs.openSync(logPath, 'r');
      const buffer = Buffer.alloc(readBytes);
      fs.readSync(fd, buffer, 0, readBytes, size - readBytes);
      fs.closeSync(fd);
      let tail = buffer.toString('utf8').split('\n');
      if (tail.length && tail[tail.length - 1] === '') tail.pop();
      tail = tail.slice(-lines);
      if (args.filter) tail = tail.filter(l => l.includes(String(args.filter)));
      const output = tail.join('\n');
      return { success: true, path: args.path, lines_read: output.split('\n').length, content: output.slice(0, 8000) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const dependencyAuditTool = {
  name: 'dependency_audit',
  description: 'Run a security audit on project dependencies. Auto-detects npm/pnpm/yarn audit, cargo audit, or pip-audit. Returns severity counts, CVE IDs, and affected packages.',
  category: 'dev',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Project directory (default: working directory).' },
      min_severity: {
        type: 'string',
        enum: ['info', 'low', 'moderate', 'high', 'critical'],
        description: 'Minimum severity to include in results (default: low).',
      },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 60).' },
    },
  },
  execute: async (args, context) => {
    const cwd = args.path ? safePath(args.path, context.workingDir) : context.workingDir;
    const timeout = clampInt(args.timeout, 60, 1, 600) * 1000;
    const minSev = args.min_severity || 'low';
    const sevOrder = ['info', 'low', 'moderate', 'high', 'critical'];
    const minIdx = sevOrder.indexOf(minSev);

    const pm = detectPackageManager(cwd);
    if (!pm) return { success: false, error: 'No package manager detected.' };

    let result;

    // ── npm / pnpm ──
    if (pm === 'npm' || pm === 'pnpm') {
      result = await runProcess(`${pm} audit --json 2>&1`, [], { cwd, timeout });
      try {
        const json = JSON.parse(result.stdout.trim());
        const vulns = json.vulnerabilities || json.advisories || {};
        const findings = Object.values(vulns).map(v => ({
          name: v.name || v.module_name,
          severity: v.severity,
          title: v.title || v.overview || '',
          via: Array.isArray(v.via) ? v.via.filter(x => typeof x === 'string').join(', ') : '',
          range: v.range || v.vulnerable_versions || '',
          fixAvailable: Boolean(v.fixAvailable),
          url: v.url || (v.references?.split('\n')[0]) || '',
        })).filter(v => sevOrder.indexOf(v.severity) >= minIdx);
        const counts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
        findings.forEach(f => { if (counts[f.severity] !== undefined) counts[f.severity]++; });
        return { success: true, package_manager: pm, severity_counts: counts, total: findings.length, findings: findings.slice(0, 50), fixable: findings.filter(f => f.fixAvailable).length };
      } catch {
        return { success: result.success, package_manager: pm, raw_output: result.stdout.slice(0, 4000), error: 'Could not parse audit JSON — see raw_output.' };
      }
    }

    // ── yarn ──
    if (pm === 'yarn') {
      result = await runProcess('yarn audit --json 2>&1', [], { cwd, timeout });
      const findings = [];
      for (const line of result.stdout.split('\n')) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'auditAdvisory') {
            const a = obj.data?.advisory || {};
            if (sevOrder.indexOf(a.severity) >= minIdx) {
              findings.push({ name: a.module_name, severity: a.severity, title: a.title, url: a.url, range: a.vulnerable_versions });
            }
          }
        } catch { /* skip non-JSON lines */ }
      }
      const counts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
      findings.forEach(f => { if (counts[f.severity] !== undefined) counts[f.severity]++; });
      return { success: true, package_manager: 'yarn', severity_counts: counts, total: findings.length, findings: findings.slice(0, 50) };
    }

    // ── cargo ──
    if (pm === 'cargo') {
      result = await runProcess('cargo audit --json 2>&1', [], { cwd, timeout });
      try {
        const json = JSON.parse(result.stdout.trim());
        const vulns = (json.vulnerabilities?.list || []).filter(v => sevOrder.indexOf((v.advisory?.severity || 'low').toLowerCase()) >= minIdx);
        const findings = vulns.map(v => ({
          name: v.package?.name,
          version: v.package?.version,
          severity: (v.advisory?.severity || 'unknown').toLowerCase(),
          title: v.advisory?.title,
          id: v.advisory?.id,
          url: v.advisory?.url,
        }));
        const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
        findings.forEach(f => { if (counts[f.severity] !== undefined) counts[f.severity]++; });
        return { success: true, package_manager: 'cargo', severity_counts: counts, total: findings.length, findings: findings.slice(0, 50) };
      } catch {
        return { success: false, package_manager: 'cargo', raw_output: result.stdout.slice(0, 4000), error: 'cargo audit not installed or returned non-JSON. Run: cargo install cargo-audit' };
      }
    }

    // ── pip-audit ──
    if (pm === 'pip' || pm === 'pip (poetry)') {
      result = await runProcess('pip-audit --format=json 2>&1', [], { cwd, timeout });
      if (result.exit_code === 127 || result.stderr?.includes('not found')) {
        // Fallback: try safety
        result = await runProcess('safety check --json 2>&1', [], { cwd, timeout });
      }
      try {
        const json = JSON.parse(result.stdout.trim());
        const deps = Array.isArray(json) ? json : (json.dependencies || []);
        const findings = [];
        for (const dep of deps) {
          for (const vuln of (dep.vulns || [])) {
            findings.push({ name: dep.name, version: dep.version, severity: (vuln.fix_versions?.length ? 'moderate' : 'low'), id: vuln.id, description: vuln.description?.slice(0, 300) });
          }
        }
        const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
        findings.forEach(f => { if (counts[f.severity] !== undefined) counts[f.severity]++; });
        return { success: true, package_manager: pm, severity_counts: counts, total: findings.length, findings: findings.slice(0, 50) };
      } catch {
        return { success: false, package_manager: pm, raw_output: result.stdout.slice(0, 4000), error: 'pip-audit not installed. Run: pip install pip-audit' };
      }
    }

    return { success: false, error: `No audit support for package manager: ${pm}` };
  },
};

export const devTools = [
  linterRunTool, codeFixTool, packageManagerTool, buildRunnerTool, consoleReadTool, dependencyAuditTool,
];
export default devTools;
