// Interactive arrow-key picker and confirm dialog for asyncat CLI
import readline from 'readline';
import { c } from './colors.js';
import { getTheme } from './theme.js';

const stripAnsi = s => s.replace(/\x1b\[[^m]*m/g, '');
const vis = s => stripAnsi(s).length;

// ── select ────────────────────────────────────────────────────────────────────
// items: [{ name, desc?, tag?, group? }]
// Returns the chosen item object, or null if ESC was pressed.
export async function select({ title = '', items = [], searchable = true } = {}) {
  if (!items.length) return null;

  return new Promise((resolve) => {
    const t = getTheme();
    let query = '';
    let idx = 0;
    let prevLines = 0;

    function getFiltered() {
      if (!query) return items;
      const q = query.toLowerCase();
      return items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.desc && i.desc.toLowerCase().includes(q))
      );
    }

    function draw() {
      const filtered = getFiltered();
      if (idx >= filtered.length && filtered.length > 0) idx = filtered.length - 1;
      if (idx < 0) idx = 0;

      const lines = [];
      lines.push('');

      if (title) {
        lines.push(`  ${c.bold}${title}${c.reset}`);
      }

      if (searchable) {
        const ph = query ? '' : `${c.dim}Type to filter...${c.reset}`;
        lines.push(`  ${c.dim}Search:${c.reset}  ${query}${ph}`);
      }

      lines.push('');

      if (filtered.length === 0) {
        lines.push(`  ${c.dim}No matches for "${query}"${c.reset}`);
      } else {
        let lastGroup = null;
        for (let i = 0; i < filtered.length; i++) {
          const item = filtered[i];
          const sel  = (i === idx);

          // Group header (only in unfiltered view)
          if (!query && item.group && item.group !== lastGroup) {
            lastGroup = item.group;
            if (i > 0) lines.push('');
            lines.push(`  ${c.dim}${item.group}${c.reset}`);
          }

          const marker = sel ? `${t.accent}▸${c.reset}` : ' ';
          const tag    = item.tag ? `  ${c.dim}${item.tag}${c.reset}` : '';

          if (sel) {
            lines.push(`  ${marker} ${c.bold}${t.accent}${item.name}${c.reset}${tag}`);
            if (item.desc) lines.push(`      ${item.desc}`);
          } else {
            lines.push(`  ${marker} ${c.dim}${item.name}${c.reset}${tag}`);
            if (item.desc) lines.push(`      ${c.dim}${item.desc}${c.reset}`);
          }
        }
      }

      lines.push('');
      lines.push(`  ${c.dim}↑/↓ navigate · enter select · esc back${c.reset}`);
      lines.push('');

      process.stdout.write('\x1b[?25l');
      if (prevLines > 0) process.stdout.write(`\x1b[${prevLines}A\r\x1b[J`);
      process.stdout.write(lines.join('\n') + '\n');
      prevLines = lines.length;
      process.stdout.write('\x1b[?25h');
    }

    // Capture and temporarily remove existing stdin keypress listeners
    const saved  = process.stdin.listeners('keypress').slice();
    process.stdin.removeAllListeners('keypress');
    readline.emitKeypressEvents(process.stdin);

    const wasRaw = process.stdin.isTTY && process.stdin.isRaw;
    if (process.stdin.isTTY && !wasRaw) process.stdin.setRawMode(true);

    function restore() {
      process.stdin.removeAllListeners('keypress');
      saved.forEach(fn => process.stdin.on('keypress', fn));
      if (process.stdin.isTTY && !wasRaw) process.stdin.setRawMode(false);
    }

    function done(result) {
      restore();
      if (prevLines > 0) process.stdout.write(`\x1b[${prevLines}A\r\x1b[J`);
      resolve(result);
    }

    function onKey(str, key) {
      if (!key) return;
      const { name, ctrl } = key;

      if (ctrl && name === 'c') { done(null); process.exit(0); }
      if (name === 'escape')    { done(null); return; }

      const filtered = getFiltered();

      if (name === 'return' || name === 'enter') {
        done(filtered[idx] ?? null);
        return;
      }

      if (name === 'up') {
        if (idx > 0) idx--;
        draw(); return;
      }

      if (name === 'down') {
        if (idx < filtered.length - 1) idx++;
        draw(); return;
      }

      if (name === 'backspace' && searchable) {
        query = query.slice(0, -1);
        idx = 0;
        draw(); return;
      }

      if (str && str.length === 1 && !ctrl && searchable) {
        query += str;
        idx = 0;
        draw(); return;
      }
    }

    process.stdin.on('keypress', onKey);
    draw();
  });
}

// ── confirm ───────────────────────────────────────────────────────────────────
// Single-key y/N prompt. Returns true if user presses y/Y.
export async function confirm(msg) {
  return new Promise((resolve) => {
    process.stdout.write(`\n  ${msg} ${c.dim}[y/N]${c.reset} `);

    const saved = process.stdin.listeners('keypress').slice();
    process.stdin.removeAllListeners('keypress');
    readline.emitKeypressEvents(process.stdin);

    const wasRaw = process.stdin.isTTY && process.stdin.isRaw;
    if (process.stdin.isTTY && !wasRaw) process.stdin.setRawMode(true);

    function restore() {
      process.stdin.removeAllListeners('keypress');
      saved.forEach(fn => process.stdin.on('keypress', fn));
      if (process.stdin.isTTY && !wasRaw) process.stdin.setRawMode(false);
    }

    function onKey(str, key) {
      if (!key) return;
      const { name, ctrl } = key;
      if (ctrl && name === 'c') { restore(); process.exit(0); }

      const ch = (str || '').toLowerCase();
      if (ch === 'y') {
        process.stdout.write(`${c.bold}y${c.reset}\n\n`);
        restore();
        resolve(true);
      } else {
        process.stdout.write(`${c.dim}n${c.reset}\n\n`);
        restore();
        resolve(false);
      }
    }

    process.stdin.on('keypress', onKey);
  });
}
