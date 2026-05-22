// den/src/agent/tools/devTools.js
// ─── Development Workflow Tools ───────────────────────────────────────────────
// Linters, build runners, package managers, code fixers, log readers.

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PermissionLevel } from './toolRegistry.js';
import { runProcess } from './shared.js';

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

    const result = await runProcess(cmd, [], { cwd, timeout });
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

    const result = await runProcess(cmd, [], { cwd, timeout });
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
    const cwd = args.path ? path.join(context.workingDir, args.path) : context.workingDir;
    const timeout = (args.timeout || 60) * 1000;
    const minSev = args.min_severity || 'low';
    const sevOrder = ['info', 'low', 'moderate', 'high', 'critical'];
    const minIdx = sevOrder.indexOf(minSev);

    const pm = detectPackageManager(cwd);
    if (!pm) return { success: false, error: 'No package manager detected.' };

    let result, parsed;

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
