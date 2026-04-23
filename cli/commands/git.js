// asyncat git [status|log [n]|diff|branch]
// Developer shortcut: git context for the asyncat workspace.

import { execSync } from 'child_process';
import { log, warn, info, col } from '../lib/colors.js';
import { ROOT } from '../lib/env.js';

function exec(cmd) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch { return null; }
}

function showStatus() {
  const branch = exec('git rev-parse --abbrev-ref HEAD');
  if (!branch) {
    warn('Not a git repository (or git not installed)');
    return;
  }

  const commit     = exec('git rev-parse --short HEAD');
  const lastMsg    = exec('git log -1 --pretty=format:"%s"');
  const lastAuthor = exec('git log -1 --pretty=format:"%an"');
  const lastDate   = exec('git log -1 --pretty=format:"%cr"');
  const aheadRaw   = exec('git rev-list --count @{u}..HEAD 2>/dev/null');
  const behindRaw  = exec('git rev-list --count HEAD..@{u} 2>/dev/null');
  const statusRaw  = exec('git status --porcelain');

  log('');
  log(`  ${col('bold', 'Git')}  ${col('green', branch)}  ${col('dim', commit || '')}`);
  log(col('dim', '  ' + '─'.repeat(60)));

  // Sync state
  const ahead  = parseInt(aheadRaw  || '0', 10);
  const behind = parseInt(behindRaw || '0', 10);
  if (ahead > 0 || behind > 0) {
    const parts = [];
    if (ahead  > 0) parts.push(col('green',  `↑${ahead} to push`));
    if (behind > 0) parts.push(col('yellow', `↓${behind} to pull`));
    log(`  ${col('cyan', 'sync  ')}   ${parts.join('  ')}`);
  }

  // Last commit
  if (lastMsg) {
    log('');
    log(`  ${col('dim', 'last commit')}`);
    log(`  ${lastMsg}`);
    log(`  ${col('dim', (lastAuthor || '') + ' · ' + (lastDate || ''))}`);
  }

  log('');

  // Working tree
  if (!statusRaw) {
    log(`  ${col('green', '✔')}  Working tree clean`);
  } else {
    const lines    = statusRaw.split('\n').filter(Boolean);
    const staged   = lines.filter(l => l[0] && l[0] !== ' ' && l[0] !== '?');
    const unstaged = lines.filter(l => l[1] && l[1] !== ' ' || l.startsWith('??'));

    if (staged.length > 0) {
      log(`  ${col('green', 'Staged')}  ${col('dim', `(${staged.length})`)}`);
      for (const l of staged.slice(0, 6)) {
        log(`    ${col('green', l[0])}  ${col('dim', l.slice(3))}`);
      }
      if (staged.length > 6) log(`    ${col('dim', `…${staged.length - 6} more`)}`);
      log('');
    }

    if (unstaged.length > 0) {
      log(`  ${col('yellow', 'Changed')}  ${col('dim', `(${unstaged.length})`)}`);
      for (const l of unstaged.slice(0, 6)) {
        const code = l.startsWith('??') ? '?' : l[1] || '?';
        log(`    ${col('yellow', code)}  ${col('dim', l.slice(3))}`);
      }
      if (unstaged.length > 6) log(`    ${col('dim', `…${unstaged.length - 6} more`)}`);
      log('');
    }
  }

  log(`  ${col('dim', 'git log · git log <n> · git diff · git branch')}`);
  log('');
}

function showLog(n = 10) {
  const branch  = exec('git rev-parse --abbrev-ref HEAD');
  if (!branch) { warn('Not a git repository'); return; }

  const logOut = exec(`git log --oneline -${n} --color=never`);
  log('');
  log(`  ${col('bold', 'Recent commits')}  ${col('dim', branch)}`);
  log(col('dim', '  ' + '─'.repeat(60)));

  if (!logOut) { log(`  ${col('dim', 'No commits')}`); log(''); return; }

  for (const line of logOut.split('\n')) {
    const spIdx = line.indexOf(' ');
    const hash  = spIdx > -1 ? line.slice(0, spIdx) : line;
    const msg   = spIdx > -1 ? line.slice(spIdx + 1) : '';
    log(`  ${col('dim', hash)}  ${msg}`);
  }
  log('');
}

function showDiff() {
  const diff = exec('git diff --stat');
  const staged = exec('git diff --cached --stat');

  log('');
  log(`  ${col('bold', 'Diff summary')}`);
  log(col('dim', '  ' + '─'.repeat(60)));

  if (staged) {
    log(`  ${col('green', 'Staged')}`);
    for (const l of staged.split('\n')) log(`  ${col('dim', l)}`);
    log('');
  }

  if (diff) {
    log(`  ${col('yellow', 'Unstaged')}`);
    for (const l of diff.split('\n')) log(`  ${col('dim', l)}`);
    log('');
  }

  if (!staged && !diff) {
    log(`  ${col('dim', 'Nothing to diff — working tree clean')}`);
    log('');
  }
}

function showBranches() {
  const out = exec('git branch -a --color=never');
  if (!out) { warn('Not a git repository'); return; }

  log('');
  log(`  ${col('bold', 'Branches')}`);
  log(col('dim', '  ' + '─'.repeat(60)));

  for (const l of out.split('\n').filter(Boolean)) {
    const current = l.startsWith('*');
    const name    = l.replace(/^\*?\s+/, '');
    if (current) {
      log(`  ${col('green', '▸')} ${col('bold', name)}`);
    } else {
      log(`    ${col('dim', name)}`);
    }
  }
  log('');
}

export function run(args = []) {
  const sub = (args[0] || 'status').toLowerCase();
  switch (sub) {
    case 'status':
    case 'st':      showStatus();              break;
    case 'log':
    case 'l':       showLog(parseInt(args[1] || '10', 10)); break;
    case 'diff':
    case 'd':       showDiff();                break;
    case 'branch':
    case 'br':      showBranches();            break;
    default:
      warn(`Unknown git subcommand: ${col('white', sub)}`);
      log(`  Usage: ${col('cyan', 'git')} ${col('dim', '[status|log [n]|diff|branch]')}`);
  }
}
