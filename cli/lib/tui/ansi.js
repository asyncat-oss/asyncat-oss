// Pure ANSI escape sequence helpers — zero dependencies
const E = '\x1b';
const C = E + '[';

export const ansi = {
  altScreen:  `${C}?1049h`,
  mainScreen: `${C}?1049l`,
  clear:      `${C}2J`,
  clearLine:  `${C}2K`,
  clearDown:  `${C}J`,
  hide:       `${C}?25l`,
  show:       `${C}?25h`,
  home:       `${C}H`,
  to:   (r, c) => `${C}${r};${c}H`,
  up:   (n=1) => `${C}${n}A`,
  down: (n=1) => `${C}${n}B`,
  reset:      `${C}0m`,
  bold:       `${C}1m`,
  dim:        `${C}2m`,
  italic:     `${C}3m`,
  fg256:      n => `${C}38;5;${n}m`,
  bg256:      n => `${C}48;5;${n}m`,
  fgRgb:      (r,g,b) => `${C}38;2;${r};${g};${b}m`,
  bgRgb:      (r,g,b) => `${C}48;2;${r};${g};${b}m`,
};

export const strip = s => s.replace(/\x1b\[[^m]*m/g, '');
export const vis = s => strip(s).length;
export const w = () => process.stdout.columns || 80;
export const h = () => process.stdout.rows || 24;

export function write(s) { process.stdout.write(s); }
export function at(row, col, s) { write(`${ansi.to(row, col)}${s}`); }
export function clearRow(row) { write(`${ansi.to(row, 1)}${ansi.clearLine}`); }
export function hline(row, ch, len, style = '') {
  at(row, 1, `${style}${ch.repeat(len)}${ansi.reset}`);
}
export function center(text, width) {
  const tLen = vis(text);
  const pad = Math.max(0, Math.floor((width - tLen) / 2));
  return ' '.repeat(pad) + text;
}
