import readline from 'readline';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { getTheme, getThemeName } from './theme.js';
import { logger } from './logger.js';

// ── Base ANSI codes ────────────────────────────────────────────────────────────
export const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
};

export const col = (color, str) => `${c[color] || ''}${str}${c.reset}`;

// ── Strip ANSI for visual-width measurement ────────────────────────────────────
const vis = s => s.replace(/\x1b\[[^m]*m/g, '').length;

// ── RL / LL state ──────────────────────────────────────────────────────────────
let _rl = null;
let _ll = null;
let _liveLogsEnabled = false;

export const setRl  = (iface) => { _rl = iface; };
export const getRl  = () => _rl;
export const rlOpen = () => _rl && !_rl.closed;
export const setLl  = (ll)    => { _ll = ll; };
export const getLl  = () => _ll;
export const setLiveLogsEnabled = (enabled) => { _liveLogsEnabled = enabled; };
export const getLiveLogsEnabled = () => _liveLogsEnabled;

// ── Logging ────────────────────────────────────────────────────────────────────
export function log(msg) {
  if (_ll) { _ll.printAbove(msg); return; }
  if (!rlOpen()) { console.log(msg); return; }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(msg);
  _rl.prompt(true);
}

export const ok   = (msg) => { logger.commands.ok(msg); log(`  ${col('green',  '✔')}  ${msg}`); };
export const err  = (msg) => { logger.error.err(msg); log(`  ${col('red',    '✖')}  ${msg}`); };
export const warn = (msg) => { logger.commands.warn2(msg); log(`  ${col('yellow', '⚠')}  ${msg}`); };
export const info = (msg) => { logger.commands.info2(msg); log(`  ${col('cyan',   '→')}  ${msg}`); };

export function line(tag, text, color) {
  const formatted = `${col(color, '[' + tag + ']')} ${text}`;
  logger.ui.info(`[${tag}] ${text}`);
  if (!_liveLogsEnabled) return;
  if (_ll) {
    _ll.printAbove(formatted);
    return;
  }
  if (!rlOpen()) { process.stdout.write(formatted + '\n'); return; }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(formatted + '\n');
  _rl.prompt(true);
}

// ── Banner ─────────────────────────────────────────────────────────────────────
export function banner() {
  const t   = getTheme();
  const W   = Math.min(Math.max(process.stdout.columns || 80, 66), 90);
  const L   = 42;
  const R   = W - 3 - L;

  const bord  = s => `${t.border}${s}${c.reset}`;
  const acc   = s => `${t.accent}${s}${c.reset}`;
  const acc2  = s => `${t.accent2}${s}${c.reset}`;
  const dim   = s => `${c.dim}${s}${c.reset}`;
  const bold  = s => `${c.bold}${s}${c.reset}`;
  const pad   = (s, n) => s + ' '.repeat(Math.max(0, n - vis(s)));

  const row = (left, right = '') =>
    console.log(bord('│') + pad(left, L) + bord('│') + pad(right, R) + bord('│'));

  const sepRow = (left) =>
    console.log(bord('│') + pad(left, L) + bord('├') + bord('─'.repeat(R)) + bord('┤'));

  const themeName = getThemeName();

  // Recent history
  let recent = [];
  try {
    recent = fs.readFileSync(path.join(os.homedir(), '.asyncat_history'), 'utf8')
      .split('\n').filter(Boolean)
      .map(l => l.split(/\s+/)[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 2);
  } catch {}

  // Git branch (best-effort)
  let gitBranch = '';
  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {}

  // ── Top border ────────────────────────────────────────────────────────────
  const titleInner = ' asyncat ';
  const topDashes  = W - 2 - titleInner.length - 1;
  console.log('');
  console.log(bord('┌─') + `${c.bold}${titleInner}${c.reset}` + bord('─'.repeat(topDashes)) + bord('┐'));

  // ── Content ───────────────────────────────────────────────────────────────
  row('', '');
  row(
    `  ${acc('   /\\_____/\\ ')}   ${bold(acc('asyncat'))}`,
    ` ${acc2(bold('Quick start'))}`
  );
  row(
    `  ${acc('  /  o   o  \\ ')}  open-source AI workspace`,
    ` ${dim('press / for menu')}`
  );
  row(
    `  ${acc(' ( ==  ^  == )')}  `,
    ` ${dim('chat  start an AI session')}`
  );
  sepRow(
    `  ${acc('  )         ( ')}  ${dim('─'.repeat(17))}`
  );
  row(
    `  ${acc(' (           )')}  theme  ${dim(themeName)}`,
    ` ${dim('git   project status')}`
  );
  row(
    `  ${acc('( (  )   (  ) )')}  ` + (gitBranch ? `branch ${dim(gitBranch)}` : ''),
    ` ${dim('help  command reference')}`
  );
  row(
    `  ${acc('(__(__)___(__)__)')}`,
    ` ${dim('exit  quit asyncat')}`
  );
  row('', recent.length > 0 ? ` ${dim('recent: ' + recent.join(', '))}` : '');

  // ── Bottom border ─────────────────────────────────────────────────────────
  console.log(bord('└') + bord('─'.repeat(W - 2)) + bord('┘'));
  console.log('');
}

// ── Spinner ────────────────────────────────────────────────────────────────────
export function spinner(msg) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const id = setInterval(() => {
    if (_ll) {
      _ll.printAbove(`  ${col('cyan', frames[i++ % frames.length])}  ${msg}`);
    } else {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`  ${col('cyan', frames[i++ % frames.length])}  ${msg}`);
    }
  }, 80);
  return {
    stop(successMsg) {
      clearInterval(id);
      if (!_ll) { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); }
      if (successMsg !== undefined) ok(successMsg);
    },
    fail(failMsg) {
      clearInterval(id);
      if (!_ll) { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); }
      if (failMsg !== undefined) err(failMsg);
    },
  };
}
