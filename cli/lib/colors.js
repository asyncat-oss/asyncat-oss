'use strict';

// ── ANSI color constants ──────────────────────────────────────────────────────
const c = {
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

const col = (color, str) => `${c[color] || ''}${str}${c.reset}`;

// ── readline interface reference ──────────────────────────────────────────────
let _rl = null;
const setRl = (iface) => { _rl = iface; };
const rlOpen = () => _rl && !_rl.closed;

// ── rl-aware print ────────────────────────────────────────────────────────────
const readline = require('readline');

function log(msg) {
  if (!rlOpen()) { console.log(msg); return; }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(msg);
  _rl.prompt(true);
}

const ok   = (msg) => log(`  ${col('green',  '✔')}  ${msg}`);
const err  = (msg) => log(`  ${col('red',    '✖')}  ${msg}`);
const warn = (msg) => log(`  ${col('yellow', '⚠')}  ${msg}`);
const info = (msg) => log(`  ${col('cyan',   '→')}  ${msg}`);

// ── labeled streaming line ─────────────────────────────────────────────────────
function line(tag, text, color) {
  if (!rlOpen()) {
    process.stdout.write(`${col(color, '[' + tag + ']')} ${text}\n`);
    return;
  }
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  process.stdout.write(`${col(color, '[' + tag + ']')} ${text}\n`);
  _rl.prompt(true);
}

// ── banner ─────────────────────────────────────────────────────────────────────
function banner() {
  console.log('');
  console.log(col('magenta', '    /\\_____/\\ '));
  console.log(col('magenta', '   /  o   o  \\ ') + `   ${col('white', col('bold', 'asyncat'))}  ${col('dim', 'open-source AI workspace')}`);
  console.log(col('magenta', '  ( ==  ^  == )') + `   ${col('dim', '────────────────────────────')}`);
  console.log(col('magenta', '   )         ( ') + `   type ${col('cyan', 'help')} for commands`);
  console.log(col('magenta', '  (           )'));
  console.log(col('magenta', ' ( (  )   (  ) )'));
  console.log(col('magenta', '(__(__)___(__)__)'));
  console.log('');
}

module.exports = { c, col, setRl, rlOpen, log, ok, err, warn, info, line, banner };
