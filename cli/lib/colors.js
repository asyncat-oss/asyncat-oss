import readline from 'readline';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getTheme, getThemeName } from './theme.js';

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

export const setRl  = (iface) => { _rl = iface; };
export const getRl  = () => _rl;
export const rlOpen = () => _rl && !_rl.closed;
export const setLl  = (ll)    => { _ll = ll; };
export const getLl  = () => _ll;

// ── Logging ────────────────────────────────────────────────────────────────────
export function log(msg) {
  if (_ll) { _ll.printAbove(msg); return; }
  if (!rlOpen()) { console.log(msg); return; }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(msg);
  _rl.prompt(true);
}

export const ok   = (msg) => log(`  ${col('green',  '✔')}  ${msg}`);
export const err  = (msg) => log(`  ${col('red',    '✖')}  ${msg}`);
export const warn = (msg) => log(`  ${col('yellow', '⚠')}  ${msg}`);
export const info = (msg) => log(`  ${col('cyan',   '→')}  ${msg}`);

export function line(tag, text, color) {
  if (_ll) {
    _ll.printAbove(`${col(color, '[' + tag + ']')} ${text}`);
    return;
  }
  if (!rlOpen()) { process.stdout.write(`${col(color, '[' + tag + ']')} ${text}\n`); return; }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`${col(color, '[' + tag + ']')} ${text}\n`);
  _rl.prompt(true);
}

// ── Banner ─────────────────────────────────────────────────────────────────────
export function banner() {
  const t   = getTheme();
  const W   = Math.min(Math.max(process.stdout.columns || 80, 66), 90);
  const L   = 42;        // left column content width (between outer │ and sep │)
  const R   = W - 3 - L; // right column content width

  const bord  = s => `${t.border}${s}${c.reset}`;
  const acc   = s => `${t.accent}${s}${c.reset}`;
  const acc2  = s => `${t.accent2}${s}${c.reset}`;
  const dim   = s => `${c.dim}${s}${c.reset}`;
  const bold  = s => `${c.bold}${s}${c.reset}`;
  const pad   = (s, n) => s + ' '.repeat(Math.max(0, n - vis(s)));

  // Normal content row
  const row = (left, right = '') =>
    console.log(bord('│') + pad(left, L) + bord('│') + pad(right, R) + bord('│'));

  // Horizontal rule spanning only the right column (section divider)
  const sepRow = (left) =>
    console.log(bord('│') + pad(left, L) + bord('├') + bord('─'.repeat(R)) + bord('┤'));

  const themeName = getThemeName();

  // Recent history (last 3 unique commands for the right panel)
  let recent = [];
  try {
    recent = fs.readFileSync(path.join(os.homedir(), '.asyncat_history'), 'utf8')
      .split('\n').filter(Boolean)
      .map(l => l.split(/\s+/)[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 2);
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
    ` ${acc2(bold('Getting started'))}`
  );
  row(
    `  ${acc('  /  o   o  \\ ')}  open-source AI`,
    ` ${dim('type / for commands')}`
  );
  row(
    `  ${acc(' ( ==  ^  == )')}  workspace for teams`,
    ` ${dim('/help  for reference')}`
  );
  sepRow(
    `  ${acc('  )         ( ')}  ${dim('─'.repeat(17))}`
  );
  row(
    `  ${acc(' (           )')}  theme · ${dim(themeName)}`,
    ` ${dim('/chat  AI session')}`
  );
  row(
    `  ${acc('( (  )   (  ) )')}`,
    ` ${dim('/theme change colors')}`
  );
  row(
    `  ${acc('(__(__)___(__)__)')}`,
    ` ${dim('/stash save notes')}`
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
