// den/src/agent/tools/testRunnerTools.js
// Structured test runner — detects jest, vitest, mocha, pytest, cargo test, go test.
// Returns structured pass/fail/skip counts, failing test names, durations, excerpts.

import fs from 'fs';
import path from 'path';
import { PermissionLevel } from './toolRegistry.js';
import { runProcess } from './shared.js';

// ── Framework detection ───────────────────────────────────────────────────────

function detectTestFramework(cwd) {
  const files = (() => { try { return fs.readdirSync(cwd); } catch { return []; } })();

  // Go
  if (files.includes('go.mod')) return 'go';

  // Rust / Cargo
  if (files.includes('Cargo.toml')) return 'cargo';

  // Python
  if (
    files.includes('pytest.ini') ||
    files.includes('conftest.py') ||
    files.some(f => f === 'pyproject.toml' || f === 'setup.cfg')
  ) {
    try {
      const pyproject = files.includes('pyproject.toml')
        ? fs.readFileSync(path.join(cwd, 'pyproject.toml'), 'utf8')
        : '';
      const setupcfg = files.includes('setup.cfg')
        ? fs.readFileSync(path.join(cwd, 'setup.cfg'), 'utf8')
        : '';
      if (pyproject.includes('[tool.pytest') || setupcfg.includes('[tool:pytest') || files.includes('pytest.ini') || files.includes('conftest.py')) {
        return 'pytest';
      }
    } catch { /* fall through */ }
  }
  if (files.includes('requirements.txt') || files.some(f => f.endsWith('.py'))) return 'pytest';

  // JavaScript / TypeScript — read package.json
  if (files.includes('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const scripts = pkg.scripts || {};
      if (deps['vitest'] || scripts.test?.includes('vitest')) return 'vitest';
      if (deps['jest'] || scripts.test?.includes('jest') || files.some(f => f.startsWith('jest.config'))) return 'jest';
      if (deps['mocha'] || scripts.test?.includes('mocha') || files.some(f => f.startsWith('.mocharc'))) return 'mocha';
      if (deps['ava'] || scripts.test?.includes('ava')) return 'ava';
      if (scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1') return 'npm-script';
    } catch { /* fall through */ }
  }

  return null;
}

// ── Output parsers ────────────────────────────────────────────────────────────

function parseJestJson(raw) {
  try {
    const json = JSON.parse(raw);
    const failures = [];
    for (const suite of (json.testResults || [])) {
      for (const r of (suite.testResults || [])) {
        if (r.status === 'failed') {
          failures.push({
            name: r.fullName || r.title,
            file: path.relative(process.cwd(), suite.testFilePath || ''),
            error: r.failureMessages?.join('\n').slice(0, 600) || '',
            duration_ms: r.duration || null,
          });
        }
      }
    }
    return {
      framework: 'jest',
      passed: json.numPassedTests ?? 0,
      failed: json.numFailedTests ?? 0,
      skipped: json.numPendingTests ?? 0,
      total: json.numTotalTests ?? 0,
      duration_ms: json.testResults?.reduce((s, r) => s + (r.perfStats?.end - r.perfStats?.start || 0), 0) || null,
      suites_passed: json.numPassedTestSuites ?? 0,
      suites_failed: json.numFailedTestSuites ?? 0,
      failures: failures.slice(0, 20),
    };
  } catch {
    return null;
  }
}

function parseVitestJson(raw) {
  // vitest --reporter=json outputs a JSON blob
  try {
    // vitest wraps output — find first { in stdout
    const start = raw.indexOf('{');
    if (start < 0) return null;
    const json = JSON.parse(raw.slice(start));
    let passed = 0, failed = 0, skipped = 0;
    const failures = [];
    for (const file of (json.testResults || [])) {
      for (const suite of (file.assertionResults || [])) {
        if (suite.status === 'passed') passed++;
        else if (suite.status === 'failed') { failed++; failures.push({ name: suite.fullName || suite.title, file: file.testFilePath || '', error: suite.failureMessages?.join('\n').slice(0, 600) || '', duration_ms: suite.duration || null }); }
        else skipped++;
      }
    }
    return { framework: 'vitest', passed, failed, skipped, total: passed + failed + skipped, failures: failures.slice(0, 20) };
  } catch {
    return null;
  }
}

function parsePytestText(stdout, stderr) {
  const combined = stdout + '\n' + stderr;
  const lines = combined.split('\n');
  const failures = [];

  // Collect FAILED lines: "FAILED tests/test_foo.py::test_bar - AssertionError"
  for (const line of lines) {
    const m = line.match(/^FAILED\s+(.+?)(?:\s+-\s+(.*))?$/);
    if (m) failures.push({ name: m[1].trim(), error: (m[2] || '').trim().slice(0, 400) });
  }

  // Final summary: "3 passed, 1 failed, 2 warnings in 0.45s"
  let passed = 0, failed = 0, skipped = 0, duration_ms = null;
  const summaryLine = lines.slice().reverse().find(l => /\d+\s+passed|\d+\s+failed|\d+\s+error/.test(l));
  if (summaryLine) {
    passed  = parseInt(summaryLine.match(/(\d+)\s+passed/)?.[1]  || '0');
    failed  = parseInt(summaryLine.match(/(\d+)\s+failed/)?.[1]  || '0');
    const errors = parseInt(summaryLine.match(/(\d+)\s+error/)?.[1] || '0');
    skipped = parseInt(summaryLine.match(/(\d+)\s+(?:skipped|warning)/)?.[1] || '0');
    failed += errors;
    const durM = summaryLine.match(/([\d.]+)s/);
    if (durM) duration_ms = Math.round(parseFloat(durM[1]) * 1000);
  }
  return { framework: 'pytest', passed, failed, skipped, total: passed + failed + skipped, duration_ms, failures: failures.slice(0, 20) };
}

function parseCargoText(stdout, stderr) {
  const combined = stdout + '\n' + stderr;
  const lines = combined.split('\n');
  const failures = [];

  for (const line of lines) {
    const m = line.match(/^test\s+(.+?)\s+\.\.\.\s+FAILED/);
    if (m) failures.push({ name: m[1].trim() });
  }

  let passed = 0, failed = 0, skipped = 0, duration_ms = null;
  const summaryLine = lines.slice().reverse().find(l => /test result:/.test(l));
  if (summaryLine) {
    passed  = parseInt(summaryLine.match(/(\d+)\s+passed/)?.[1]  || '0');
    failed  = parseInt(summaryLine.match(/(\d+)\s+failed/)?.[1]  || '0');
    skipped = parseInt(summaryLine.match(/(\d+)\s+ignored/)?.[1] || '0');
    const durM = summaryLine.match(/([\d.]+)s/);
    if (durM) duration_ms = Math.round(parseFloat(durM[1]) * 1000);
  }
  return { framework: 'cargo', passed, failed, skipped, total: passed + failed + skipped, duration_ms, failures: failures.slice(0, 20) };
}

function parseGoText(stdout, stderr) {
  const combined = stdout + '\n' + stderr;
  const lines = combined.split('\n');
  let passed = 0, failed = 0, skipped = 0, duration_ms = null;
  const failures = [];

  for (const line of lines) {
    if (/^--- PASS/.test(line)) passed++;
    else if (/^--- FAIL/.test(line)) {
      failed++;
      const m = line.match(/^--- FAIL:\s+(.+?)\s+\(/);
      if (m) {
        const durM = line.match(/\(([\d.]+)s\)/);
        failures.push({ name: m[1].trim(), duration_ms: durM ? Math.round(parseFloat(durM[1]) * 1000) : null });
      }
    } else if (/^--- SKIP/.test(line)) skipped++;
  }

  // "ok  	github.com/foo/bar	0.123s" or "FAIL github.com/foo/bar 0.456s"
  const durLine = lines.slice().reverse().find(l => /^(?:ok|FAIL)\s+\S/.test(l));
  if (durLine) {
    const m = durLine.match(/([\d.]+)s$/);
    if (m) duration_ms = Math.round(parseFloat(m[1]) * 1000);
  }

  return { framework: 'go', passed, failed, skipped, total: passed + failed + skipped, duration_ms, failures: failures.slice(0, 20) };
}

function parseMochaJson(raw) {
  try {
    const json = JSON.parse(raw);
    const failures = (json.failures || []).map(f => ({
      name: f.fullTitle || f.title,
      error: f.err?.message?.slice(0, 400) || '',
      duration_ms: f.duration || null,
    }));
    return {
      framework: 'mocha',
      passed: json.stats?.passes ?? 0,
      failed: json.stats?.failures ?? 0,
      skipped: json.stats?.pending ?? 0,
      total: json.stats?.tests ?? 0,
      duration_ms: json.stats?.duration ?? null,
      failures: failures.slice(0, 20),
    };
  } catch { return null; }
}

// ── Command builders ──────────────────────────────────────────────────────────

function buildCommand(framework, args) {
  const filter = args.filter ? `"${args.filter.replace(/"/g, '\\"')}"` : '';

  switch (framework) {
    case 'jest':
      return { cmd: `npx jest --json --no-coverage --forceExit${filter ? ` -t ${filter}` : ''} 2>/dev/null`, parse: 'jest-json' };
    case 'vitest':
      return { cmd: `npx vitest run --reporter=json${filter ? ` -t ${filter}` : ''} 2>/dev/null`, parse: 'vitest-json' };
    case 'mocha':
      return { cmd: `npx mocha --reporter json${filter ? ` --grep ${filter}` : ''} 2>/dev/null`, parse: 'mocha-json' };
    case 'ava':
      return { cmd: `npx ava --tap${filter ? ` --match ${filter}` : ''} 2>&1`, parse: 'text' };
    case 'npm-script':
      return { cmd: 'npm test 2>&1', parse: 'text' };
    case 'pytest':
      return { cmd: `python -m pytest -v --tb=short${filter ? ` -k ${filter}` : ''} 2>&1`, parse: 'pytest' };
    case 'cargo':
      return { cmd: `cargo test${filter ? ` ${filter}` : ''} 2>&1`, parse: 'cargo' };
    case 'go':
      return { cmd: `go test ./... -v${filter ? ` -run ${filter}` : ''} 2>&1`, parse: 'go' };
    default:
      return null;
  }
}

// ── Tool export ───────────────────────────────────────────────────────────────

export const runTestsTool = {
  name: 'run_tests',
  description: 'Run the project test suite and return structured results: pass/fail/skip counts, failing test names, durations, and error excerpts. Auto-detects jest, vitest, mocha, pytest, cargo test, and go test.',
  category: 'dev',
  permission: PermissionLevel.MODERATE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Project directory (default: working directory).' },
      framework: {
        type: 'string',
        enum: ['jest', 'vitest', 'mocha', 'pytest', 'cargo', 'go', 'npm-script'],
        description: 'Force a specific test framework instead of auto-detecting.',
      },
      filter: { type: 'string', description: 'Run only tests matching this pattern/name (passed to -t / -k / -run).' },
      timeout: { type: 'number', description: 'Timeout in seconds (default: 120).' },
    },
  },
  execute: async (args, context) => {
    const cwd = args.path
      ? path.resolve(context.workingDir, args.path)
      : context.workingDir;

    if (!fs.existsSync(cwd)) {
      return { success: false, error: `Directory not found: ${cwd}` };
    }

    const framework = args.framework || detectTestFramework(cwd);
    if (!framework) {
      return {
        success: false,
        error: 'No test framework detected. Looked for: jest, vitest, mocha, pytest, cargo, go test. Add a test script to package.json or install a test framework.',
      };
    }

    const built = buildCommand(framework, args);
    if (!built) {
      return { success: false, error: `Cannot build command for framework: ${framework}` };
    }

    const timeout = (args.timeout || 120) * 1000;
    const result = await runProcess(built.cmd, [], { cwd, timeout });

    // Parse structured output
    let parsed = null;
    const rawOutput = result.stdout + result.stderr;

    if (built.parse === 'jest-json')   parsed = parseJestJson(result.stdout);
    if (built.parse === 'vitest-json') parsed = parseVitestJson(result.stdout);
    if (built.parse === 'mocha-json')  parsed = parseMochaJson(result.stdout);
    if (built.parse === 'pytest')      parsed = parsePytestText(result.stdout, result.stderr);
    if (built.parse === 'cargo')       parsed = parseCargoText(result.stdout, result.stderr);
    if (built.parse === 'go')          parsed = parseGoText(result.stdout, result.stderr);

    if (parsed) {
      const allPassed = parsed.failed === 0 && !result.killed;
      return {
        success: allPassed,
        ...parsed,
        command: built.cmd,
        raw_output: rawOutput.slice(0, 6000),
        timed_out: result.killed || false,
      };
    }

    // Fallback: return raw output with basic success/fail from exit code
    return {
      success: result.success,
      framework,
      command: built.cmd,
      raw_output: rawOutput.slice(0, 6000),
      exit_code: result.exit_code,
      timed_out: result.killed || false,
      note: 'Structured parsing not available for this framework/output; see raw_output.',
    };
  },
};

export const testRunnerTools = [runTestsTool];
export default testRunnerTools;
