// asyncat code [path] [--depth=N] [--filter=pattern]
// Show a filtered file tree of the given path (default: cwd).
// Useful for understanding project structure during coding sessions.

import fs from 'fs';
import path from 'path';
import { log, info, warn, col } from '../lib/colors.js';

const IGNORE = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', '__pycache__',
  '.cache', 'coverage', '.nyc_output', '.turbo', '.svelte-kit',
]);

const EXT_COLOR = {
  '.js':    'cyan',   '.mjs': 'cyan',   '.cjs': 'cyan',
  '.ts':    'cyan',   '.tsx': 'cyan',   '.jsx': 'cyan',
  '.json':  'yellow', '.yaml': 'yellow', '.yml': 'yellow', '.toml': 'yellow',
  '.md':    'white',  '.txt': 'white',
  '.py':    'green',  '.rb': 'green',  '.go': 'green',  '.rs': 'green',
  '.sh':    'magenta', '.bash': 'magenta', '.zsh': 'magenta',
  '.html':  'red',    '.css': 'red',   '.scss': 'red',
  '.env':   'dim',    '.gitignore': 'dim',
};

function colorFile(name) {
  const ext = path.extname(name).toLowerCase();
  const color = EXT_COLOR[ext];
  return color ? col(color, name) : name;
}

function walkTree(dir, prefix, depth, maxDepth, filter, lines) {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch { return; }

  // Dirs first, then files; skip ignored
  const dirs  = entries.filter(e => e.isDirectory() && !IGNORE.has(e.name) && !e.name.startsWith('.'));
  const files = entries.filter(e => !e.isDirectory());

  const all = [...dirs, ...files];
  for (let i = 0; i < all.length; i++) {
    const entry  = all[i];
    const isLast = i === all.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPfx  = isLast ? '    ' : '│   ';

    // Apply filter
    if (filter && !entry.name.toLowerCase().includes(filter.toLowerCase())) {
      if (entry.isDirectory()) {
        // Still recurse into dirs to find matches
        walkTree(path.join(dir, entry.name), prefix + childPfx, depth + 1, maxDepth, filter, lines);
      }
      continue;
    }

    if (entry.isDirectory()) {
      lines.push(`${col('dim', prefix + connector)}${col('bold', entry.name + '/')}`);
      walkTree(path.join(dir, entry.name), prefix + childPfx, depth + 1, maxDepth, filter, lines);
    } else {
      // Show file size for larger files
      let sizeHint = '';
      try {
        const stat = fs.statSync(path.join(dir, entry.name));
        if (stat.size >= 100 * 1024) {
          sizeHint = col('dim', `  ${(stat.size / 1024).toFixed(0)}K`);
        }
      } catch {}
      lines.push(`${col('dim', prefix + connector)}${colorFile(entry.name)}${sizeHint}`);
    }
  }
}

export function run(args = []) {
  let targetArg  = '.';
  let maxDepth   = 3;
  let filter     = '';

  for (const a of args) {
    if (a.startsWith('--depth='))  { maxDepth = parseInt(a.split('=')[1], 10) || 3; continue; }
    if (a.startsWith('--filter=')) { filter   = a.split('=')[1]; continue; }
    if (!a.startsWith('--'))       { targetArg = a; }
  }

  const target = path.resolve(targetArg);

  if (!fs.existsSync(target)) {
    warn(`Path not found: ${col('white', target)}`);
    return;
  }

  const stat = fs.statSync(target);
  if (!stat.isDirectory()) {
    // Just show the file contents hint
    warn(`Not a directory: ${col('white', target)}`);
    info(`Use ${col('cyan', 'snippets show')} to view saved snippets`);
    return;
  }

  const lines = [];
  const displayName = path.basename(target) || target;

  log('');
  log(`  ${col('bold', displayName + '/')}  ${col('dim', target)}`);
  log(col('dim', '  ' + '─'.repeat(60)));

  walkTree(target, '  ', 0, maxDepth, filter, lines);

  if (lines.length === 0) {
    log(`  ${col('dim', filter ? `No files matching "${filter}"` : 'Empty directory')}`);
  } else {
    for (const l of lines) log(l);
  }

  log('');
  log(`  ${col('dim', `code <path> · code --depth=5 · code --filter=.ts`)}`);
  log('');
}
