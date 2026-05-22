// den/src/agent/tools/codebaseMetricsTools.js
// Codebase metrics: LOC by language, file counts, largest files, most-changed
// files (from git log), dependency count, tech stack detection.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PermissionLevel } from './toolRegistry.js';

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  '.svelte-kit', '.turbo', '.cache', '.asyncat', '.agent_tmp', 'vendor',
  '__pycache__', '.venv', 'venv', 'target', '.gradle', '.idea', '.vscode',
]);

const LANG_MAP = {
  '.js': 'JavaScript',  '.mjs': 'JavaScript',  '.cjs': 'JavaScript',
  '.jsx': 'JSX',        '.ts': 'TypeScript',    '.tsx': 'TSX',
  '.py': 'Python',      '.go': 'Go',             '.rs': 'Rust',
  '.java': 'Java',      '.kt': 'Kotlin',         '.swift': 'Swift',
  '.c': 'C',            '.h': 'C',               '.cpp': 'C++',
  '.cc': 'C++',         '.cs': 'C#',             '.rb': 'Ruby',
  '.php': 'PHP',        '.ex': 'Elixir',         '.exs': 'Elixir',
  '.lua': 'Lua',        '.r': 'R',               '.scala': 'Scala',
  '.sh': 'Shell',       '.bash': 'Shell',        '.zsh': 'Shell',
  '.css': 'CSS',        '.scss': 'SCSS',         '.sass': 'SASS',
  '.less': 'Less',      '.html': 'HTML',         '.htm': 'HTML',
  '.vue': 'Vue',        '.svelte': 'Svelte',
  '.sql': 'SQL',        '.graphql': 'GraphQL',   '.gql': 'GraphQL',
  '.json': 'JSON',      '.yaml': 'YAML',         '.yml': 'YAML',
  '.toml': 'TOML',      '.md': 'Markdown',       '.mdx': 'MDX',
  '.tf': 'Terraform',   '.proto': 'Protobuf',
};

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB — skip giant generated files

function walkFiles(root, maxFiles = 10000) {
  const results = [];
  const stack = [root];
  while (stack.length && results.length < maxFiles) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        results.push(full);
        if (results.length >= maxFiles) break;
      }
    }
  }
  return results;
}

function countLines(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return { lines: 0, bytes: stat.size, skipped: true };
    const content = fs.readFileSync(filePath, 'utf8');
    return { lines: content.split('\n').length, bytes: stat.size, skipped: false };
  } catch {
    return { lines: 0, bytes: 0, skipped: true };
  }
}

function detectTechStack(cwd, files) {
  const stack = new Set();
  const fileNames = files.map(f => path.basename(f));
  const check = (name) => fileNames.includes(name) || fs.existsSync(path.join(cwd, name));

  // Languages / runtimes
  if (check('package.json')) {
    stack.add('Node.js');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps['react'] || deps['react-dom']) stack.add('React');
      if (deps['next']) stack.add('Next.js');
      if (deps['vue']) stack.add('Vue');
      if (deps['svelte']) stack.add('@sveltejs/kit') && stack.add('Svelte');
      if (deps['express']) stack.add('Express');
      if (deps['fastify']) stack.add('Fastify');
      if (deps['vite']) stack.add('Vite');
      if (deps['typescript'] || check('tsconfig.json')) stack.add('TypeScript');
      if (deps['tailwindcss']) stack.add('Tailwind CSS');
      if (deps['prisma'] || deps['@prisma/client']) stack.add('Prisma');
      if (deps['drizzle-orm']) stack.add('Drizzle ORM');
      if (deps['better-sqlite3']) stack.add('SQLite');
      if (deps['pg'] || deps['postgres']) stack.add('PostgreSQL');
      if (deps['mongoose'] || deps['mongodb']) stack.add('MongoDB');
    } catch { /* ignore */ }
  }
  if (check('go.mod')) stack.add('Go');
  if (check('Cargo.toml')) stack.add('Rust');
  if (check('requirements.txt') || check('pyproject.toml') || check('setup.py')) stack.add('Python');
  if (check('pom.xml')) stack.add('Java / Maven');
  if (check('build.gradle') || check('build.gradle.kts')) stack.add('Java / Gradle');
  if (check('Gemfile')) stack.add('Ruby');
  if (check('composer.json')) stack.add('PHP');
  if (check('mix.exs')) stack.add('Elixir');
  if (check('pubspec.yaml')) stack.add('Dart / Flutter');

  // Infra / tooling
  if (check('Dockerfile') || check('docker-compose.yml') || check('docker-compose.yaml')) stack.add('Docker');
  if (check('terraform.tf') || files.some(f => f.endsWith('.tf'))) stack.add('Terraform');
  if (check('.github')) stack.add('GitHub Actions');
  if (check('netlify.toml')) stack.add('Netlify');
  if (check('vercel.json') || check('.vercel')) stack.add('Vercel');
  if (check('supabase') || files.some(f => f.includes('supabase'))) stack.add('Supabase');

  return [...stack];
}

function parseDependencyCounts(cwd) {
  const counts = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    counts.npm_dependencies = Object.keys(pkg.dependencies || {}).length;
    counts.npm_dev_dependencies = Object.keys(pkg.devDependencies || {}).length;
  } catch { /* ignore */ }
  try {
    const req = fs.readFileSync(path.join(cwd, 'requirements.txt'), 'utf8');
    counts.python_dependencies = req.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
  } catch { /* ignore */ }
  try {
    const cargo = fs.readFileSync(path.join(cwd, 'Cargo.toml'), 'utf8');
    const deps = cargo.match(/^\[dependencies\]/m) ? cargo.split('[dependencies]')[1]?.split('[')[0] : '';
    counts.cargo_dependencies = (deps?.match(/^\s*\w+\s*=/gm) || []).length;
  } catch { /* ignore */ }
  try {
    const gomod = fs.readFileSync(path.join(cwd, 'go.mod'), 'utf8');
    counts.go_dependencies = (gomod.match(/^\s*require\s/gm) || []).length
      || (gomod.split('require (')[1]?.split(')')[0]?.split('\n').filter(l => l.trim()).length || 0);
  } catch { /* ignore */ }
  return counts;
}

function gitMetrics(cwd) {
  const run = (cmd) => {
    try { return execSync(cmd, { cwd, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return null; }
  };

  const totalCommits = parseInt(run('git rev-list --count HEAD') || '0');
  const firstCommitDate = run("git log --reverse --format='%ci' | head -1")?.trim().replace(/'/g, '');
  const lastCommitDate = run("git log -1 --format='%ci'")?.trim();
  const authors = parseInt(run('git shortlog -sn | wc -l') || '0');

  // Most-changed files (top 15)
  const changedRaw = run("git log --format='' --name-only | sort | uniq -c | sort -rn | head -15");
  const mostChanged = (changedRaw || '').split('\n')
    .map(l => { const m = l.trim().match(/^(\d+)\s+(.+)$/); return m ? { changes: parseInt(m[1]), file: m[2] } : null; })
    .filter(Boolean);

  // Active branch
  const branch = run('git rev-parse --abbrev-ref HEAD') || 'unknown';

  return { totalCommits, firstCommitDate, lastCommitDate, authors, mostChanged, branch };
}

export const codebaseMetricsTool = {
  name: 'codebase_metrics',
  description: 'Analyze a codebase and return metrics: lines of code by language, file counts, largest files, most-changed files (from git log), dependency counts, and tech stack detection.',
  category: 'code',
  permission: PermissionLevel.SAFE,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Root directory to analyze (default: working directory).' },
      include_git: { type: 'boolean', description: 'Include git history metrics (default: true).' },
      top_files: { type: 'number', description: 'Number of largest/most-changed files to return (default: 10).' },
    },
  },
  execute: async (args, context) => {
    try {
      const root = args.path
        ? path.resolve(context.workingDir, args.path)
        : context.workingDir;

      if (!fs.existsSync(root)) return { success: false, error: `Directory not found: ${root}` };

      const topN = Math.max(5, Math.min(30, Number(args.top_files) || 10));
      const files = walkFiles(root);

      // LOC and file count by language
      const byLang = {};
      const fileSizes = [];

      for (const filePath of files) {
        const ext = path.extname(filePath).toLowerCase();
        const lang = LANG_MAP[ext];
        if (!lang) continue;

        const { lines, bytes, skipped } = countLines(filePath);
        if (skipped) continue;

        if (!byLang[lang]) byLang[lang] = { files: 0, lines: 0 };
        byLang[lang].files++;
        byLang[lang].lines += lines;
        fileSizes.push({ file: path.relative(root, filePath), lines, bytes });
      }

      // Sorted language summary
      const languages = Object.entries(byLang)
        .sort((a, b) => b[1].lines - a[1].lines)
        .map(([lang, stats]) => ({ language: lang, files: stats.files, lines: stats.lines }));

      const totalLines = languages.reduce((s, l) => s + l.lines, 0);
      const totalFiles = files.length;

      // Largest files
      const largestFiles = [...fileSizes]
        .sort((a, b) => b.lines - a.lines)
        .slice(0, topN)
        .map(({ file, lines, bytes }) => ({ file, lines, size_kb: Math.round(bytes / 1024) }));

      // Tech stack + dependency counts
      const techStack = detectTechStack(root, files);
      const dependencies = parseDependencyCounts(root);

      // Git metrics
      const includeGit = args.include_git !== false;
      const git = includeGit ? gitMetrics(root) : null;

      const summary = [
        `${totalLines.toLocaleString()} total lines across ${totalFiles.toLocaleString()} files`,
        languages.slice(0, 3).map(l => `${l.language} (${l.lines.toLocaleString()} lines)`).join(', '),
        techStack.length ? `Stack: ${techStack.slice(0, 6).join(', ')}` : null,
        git ? `${git.totalCommits.toLocaleString()} commits by ${git.authors} author${git.authors !== 1 ? 's' : ''}` : null,
      ].filter(Boolean).join(' · ');

      return {
        success: true,
        summary,
        totals: { files: totalFiles, lines: totalLines },
        languages,
        tech_stack: techStack,
        dependencies,
        largest_files: largestFiles,
        git: git ? {
          branch: git.branch,
          total_commits: git.totalCommits,
          authors: git.authors,
          first_commit: git.firstCommitDate,
          last_commit: git.lastCommitDate,
          most_changed: git.mostChanged.slice(0, topN),
        } : null,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export const codebaseMetricsTools = [codebaseMetricsTool];
export default codebaseMetricsTools;
