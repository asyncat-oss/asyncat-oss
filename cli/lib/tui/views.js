// Asyncat v2 — Views: Zen screen, chat, palette, input, status bar
import { ansi, strip, vis, w, h, write, at, clearRow, center } from './ansi.js';
import { getTheme, getThemeName } from '../theme.js';
import { execSync } from 'child_process';

// ── Cat personality ─────────────────────────────────────────────────────────
const CAT_FACE = [
  '  /\\_/\\  ',
  ' ( o.o ) ',
  '  > ^ <  ',
];

const CAT_MSGS = [
  'meow! ready to code ✨',
  'purr... what shall we build?',
  '*stretches* what\'s the task?',
  'nya~ let\'s hack something!',
  '*yawns* another adventure...',
  'mrow! I see you there 👀',
  '*blinks slowly* ...I trust you.',
  'purrfect day for shipping code.',
  '*tail swish* bring it on!',
  'mew~ focus mode activated.',
];

let _catMsgIdx = Math.floor(Math.random() * CAT_MSGS.length);
export function nextCatMsg() {
  _catMsgIdx = (_catMsgIdx + 1) % CAT_MSGS.length;
  return CAT_MSGS[_catMsgIdx];
}

// ── Zen Home Screen (single centered input — no bottom bar) ─────────────────
export function renderZen(inputBuf, cursorPos, modelInfo, providerInfo, catMsg) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  // Clear full screen
  for (let r = 1; r <= H - 1; r++) clearRow(r);

  const blockH = 14;
  const startY = Math.max(2, Math.floor((H - blockH) / 2));
  let y = startY;

  // Cat logo
  for (const line of CAT_FACE) {
    at(y++, 1, center(`${t.logoDim}${line}${R}`, W));
  }

  // Brand name: "async" dim + "cat" bright
  const brand = `${t.logoDim}async${R}${t.logoBright}cat${R}`;
  at(y++, 1, center(brand, W));

  // Cat message
  const msg = catMsg || CAT_MSGS[_catMsgIdx];
  at(y++, 1, center(`${ansi.dim}${ansi.italic}${msg}${R}`, W));
  y++;

  // ── Centered input box ──────────────────────────────────────────────────
  const boxW = Math.min(56, W - 6);
  const boxL = Math.floor((W - boxW) / 2);
  const inner = boxW - 4;

  // Top border
  at(y, boxL, `${t.dimBorder}╭${'─'.repeat(boxW - 2)}╮${R}`);
  y++;

  // Input line
  const displayBuf = inputBuf || '';
  const placeholder = displayBuf
    ? `${t.inputFg}${displayBuf}${R}`
    : `${ansi.dim}Ask anything... or press / for commands${R}`;
  const phVis = vis(placeholder);
  const pad = Math.max(0, inner - phVis);
  at(y, boxL, `${t.dimBorder}│${R} ${placeholder}${' '.repeat(pad)} ${t.dimBorder}│${R}`);

  // Place cursor inside the box
  const cursorCol = boxL + 2 + (displayBuf ? cursorPos : 0);
  write(ansi.to(y, cursorCol));
  y++;

  // Model info inside box
  const mName = modelInfo || 'no model';
  const pName = providerInfo || '';
  const mLine = pName
    ? `${t.accent2}${mName}${R} ${ansi.dim}· ${pName}${R}`
    : `${ansi.dim}${mName}${R}`;
  const mPad = Math.max(0, inner - vis(mLine));
  at(y, boxL, `${t.dimBorder}│${R} ${mLine}${' '.repeat(mPad)} ${t.dimBorder}│${R}`);
  y++;

  // Bottom border
  at(y, boxL, `${t.dimBorder}╰${'─'.repeat(boxW - 2)}╯${R}`);
  y += 2;

  // Shortcuts
  const sc = `${ansi.bold}/${R} ${ansi.dim}commands${R}    ${ansi.bold}@${R} ${ansi.dim}files${R}    ${ansi.bold}esc${R} ${ansi.dim}exit${R}`;
  at(y, 1, center(sc, W));
}

// ── Chat View (messages + centered input at bottom) ─────────────────────────
export function renderChat(messages, scrollOffset, inputBuf, cursorPos, modelInfo, providerInfo) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  // Layout: content takes most space, input box at bottom
  const inputAreaH = 5; // border + input + model + border + gap
  const statusH = 1;
  const contentH = H - inputAreaH - statusH - 1;

  // ── Render messages ────────────────────────────────────────────────────
  const allLines = [];
  for (const msg of messages) {
    allLines.push(...formatMessage(msg, W - 6, t));
  }

  const totalLines = allLines.length;
  const start = Math.max(0, totalLines - contentH - scrollOffset);
  const end = Math.min(totalLines, start + contentH);
  const visible = allLines.slice(start, end);

  for (let i = 0; i < contentH; i++) {
    clearRow(i + 1);
    if (i < visible.length) {
      at(i + 1, 3, visible[i]);
    }
  }

  // Scroll indicator
  if (totalLines > contentH && scrollOffset > 0) {
    const pct = Math.round(((totalLines - scrollOffset) / totalLines) * 100);
    at(1, W - 6, `${ansi.dim}${pct}%${R}`);
  }

  // ── Centered input box ─────────────────────────────────────────────────
  const boxW = Math.min(56, W - 6);
  const boxL = Math.floor((W - boxW) / 2);
  const inner = boxW - 4;
  const boxTop = H - inputAreaH;

  at(boxTop, boxL, `${t.dimBorder}╭${'─'.repeat(boxW - 2)}╮${R}`);

  const displayBuf = inputBuf || '';
  const placeholder = displayBuf
    ? `${t.inputFg}${displayBuf}${R}`
    : `${ansi.dim}Type a message...${R}`;
  const phVis = vis(placeholder);
  const pad = Math.max(0, inner - phVis);
  at(boxTop + 1, boxL, `${t.dimBorder}│${R} ${placeholder}${' '.repeat(pad)} ${t.dimBorder}│${R}`);

  // Model info
  const mName = modelInfo || 'no model';
  const pName = providerInfo || '';
  const mLine = pName
    ? `${t.accent2}${mName}${R} ${ansi.dim}· ${pName}${R}`
    : `${ansi.dim}${mName}${R}`;
  const mPad = Math.max(0, inner - vis(mLine));
  at(boxTop + 2, boxL, `${t.dimBorder}│${R} ${mLine}${' '.repeat(mPad)} ${t.dimBorder}│${R}`);

  at(boxTop + 3, boxL, `${t.dimBorder}╰${'─'.repeat(boxW - 2)}╯${R}`);

  // Position cursor
  const cursorCol = boxL + 2 + (displayBuf ? cursorPos : 0);
  write(ansi.to(boxTop + 1, cursorCol));
}

// ── Message formatting ──────────────────────────────────────────────────────
function formatMessage(msg, maxW, t) {
  const R = ansi.reset;
  const lines = [];

  if (msg.role === 'user') {
    lines.push('');
    lines.push(`${t.msgUser}${ansi.bold}You ${R}${ansi.dim}▸${R}`);
    for (const l of wrapText(msg.content, maxW)) lines.push(`  ${l}`);
  } else if (msg.role === 'assistant') {
    lines.push('');
    lines.push(`${t.msgAi}${ansi.bold}asyncat ${R}${ansi.dim}▸${R}`);
    for (const l of wrapText(msg.content, maxW)) lines.push(`  ${l}`);
  } else if (msg.role === 'system') {
    lines.push(`${t.msgSystem}${ansi.dim}  ${msg.content}${R}`);
  } else if (msg.role === 'tool') {
    const icon = msg.success === true ? `${t.success}✔${R}`
               : msg.success === false ? `${t.error}✘${R}`
               : `${ansi.dim}…${R}`;
    lines.push(`${ansi.dim}  ╭─ ${R}${t.paletteCmd}${msg.tool || 'tool'}${R} ${icon}`);
    if (msg.content) {
      const preview = msg.content.split('\n').slice(0, 3);
      for (const l of preview) lines.push(`${ansi.dim}  │${R}  ${ansi.dim}${l.slice(0, maxW - 6)}${R}`);
      if (msg.content.split('\n').length > 3) lines.push(`${ansi.dim}  │  …${R}`);
    }
    lines.push(`${ansi.dim}  ╰─${R}`);
  } else if (msg.role === 'thinking') {
    lines.push(`${ansi.dim}  ╭─ 🧠 Thinking${msg.round ? ` (${msg.round})` : ''}${R}`);
    if (msg.content) {
      for (const l of msg.content.split('\n').slice(0, 4)) {
        lines.push(`${ansi.dim}  │  ${l.slice(0, maxW - 6)}${R}`);
      }
    }
    lines.push(`${ansi.dim}  ╰─${R}`);
  }

  return lines;
}

function wrapText(text, maxW) {
  if (!text) return [''];
  const result = [];
  for (const line of text.split('\n')) {
    if (vis(line) <= maxW) { result.push(line); continue; }
    let rem = line;
    while (vis(rem) > maxW) {
      result.push(rem.slice(0, maxW));
      rem = rem.slice(maxW);
    }
    if (rem) result.push(rem);
  }
  return result;
}

// ── Command palette (renders over content area) ─────────────────────────────
export const PALETTE_CMDS = [
  { cmd: '/models',   desc: 'Switch model / serve / pull',         group: 'AI' },
  { cmd: '/provider', desc: 'Connect provider (local/cloud)',      group: 'AI' },
  { cmd: '/sessions', desc: 'Browse saved conversations',          group: 'AI' },
  { cmd: '/new',      desc: 'New session',                         group: 'AI' },
  { cmd: '/mcp',      desc: 'Manage MCP servers',                  group: 'AI' },
  { cmd: '/git',      desc: 'Git status, log, diff, branch',      group: 'Dev' },
  { cmd: '/code',     desc: 'Show file tree',                      group: 'Dev' },
  { cmd: '/context',  desc: 'Show workspace state',                group: 'Dev' },
  { cmd: '/snippets', desc: 'Save and reuse code blocks',          group: 'Dev' },
  { cmd: '/start',    desc: 'Start backend & frontend',            group: 'Services' },
  { cmd: '/stop',     desc: 'Stop all services',                   group: 'Services' },
  { cmd: '/restart',  desc: 'Restart all services',                group: 'Services' },
  { cmd: '/status',   desc: 'Show running processes',              group: 'Services' },
  { cmd: '/logs',     desc: 'View service logs',                   group: 'Services' },
  { cmd: '/doctor',   desc: 'System health check',                 group: 'Services' },
  { cmd: '/theme',    desc: 'Switch color theme',                  group: 'Settings' },
  { cmd: '/config',   desc: 'Get or set configuration',            group: 'Settings' },
  { cmd: '/install',  desc: 'Install dependencies',                group: 'Settings' },
  { cmd: '/stash',    desc: 'Save or view notes',                  group: 'Tools' },
  { cmd: '/live-logs',desc: 'Toggle streaming logs',               group: 'Tools' },
  { cmd: '/alias',    desc: 'Create command shortcuts',            group: 'Tools' },
  { cmd: '/history',  desc: 'Search command history',              group: 'Tools' },
  { cmd: '/clear',    desc: 'Clear screen',                        group: 'Help' },
  { cmd: '/help',     desc: 'Command reference',                   group: 'Help' },
  { cmd: '/exit',     desc: 'Exit asyncat',                        group: 'Help' },
];

export function filterPalette(query) {
  if (!query || query === '/') return PALETTE_CMDS;
  const q = query.toLowerCase().replace(/^\//, '');
  return PALETTE_CMDS.filter(c =>
    c.cmd.slice(1).includes(q) || c.desc.toLowerCase().includes(q)
  );
}

export function renderPalette(items, selIdx, inputBuf, cursorPos) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  // Clear everything
  for (let r = 1; r <= H - 1; r++) clearRow(r);

  // Title
  at(1, 4, `${t.accentBold}Commands${R}  ${ansi.dim}(↑↓ select · enter confirm · esc back)${R}`);
  at(2, 4, `${t.dimBorder}${'─'.repeat(W - 8)}${R}`);

  const maxShow = Math.min(items.length, H - 8);
  let scrollOff = 0;
  if (selIdx >= maxShow) scrollOff = selIdx - maxShow + 1;

  if (items.length === 0) {
    at(4, 6, `${ansi.dim}No matching commands${R}`);
  } else {
    const colW = Math.max(...items.map(c => c.cmd.length)) + 3;
    const visible = items.slice(scrollOff, scrollOff + maxShow);

    let lastGroup = '';
    let row = 3;
    for (let i = 0; i < visible.length && row < H - 5; i++) {
      const item = visible[i];
      const realIdx = i + scrollOff;

      // Group header
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        at(row++, 4, `${ansi.dim}${item.group}${R}`);
      }

      const sel = realIdx === selIdx;
      const bg = sel ? t.paletteSel : '';
      const cmdStyle = sel ? `${ansi.bold}${t.paletteCmd}` : t.paletteCmd;
      const descStyle = sel ? `${R}${bg}` : ansi.dim;
      const padded = item.cmd.padEnd(colW);
      at(row++, 4, `${bg}  ${cmdStyle}${padded}${R}${bg}${descStyle}${item.desc}${' '.repeat(Math.max(0, W - colW - vis(item.desc) - 10))}${R}`);
    }

    if (items.length > scrollOff + maxShow) {
      at(row, 6, `${ansi.dim}↓ ${items.length - scrollOff - maxShow} more${R}`);
    }
  }

  // Input at bottom center
  const boxW = Math.min(56, W - 6);
  const boxL = Math.floor((W - boxW) / 2);
  const inner = boxW - 4;
  const boxTop = H - 4;

  at(boxTop, boxL, `${t.dimBorder}╭${'─'.repeat(boxW - 2)}╮${R}`);
  const buf = inputBuf || '/';
  const bufPad = Math.max(0, inner - vis(buf));
  at(boxTop + 1, boxL, `${t.dimBorder}│${R} ${t.paletteCmd}${buf}${R}${' '.repeat(bufPad)} ${t.dimBorder}│${R}`);
  at(boxTop + 2, boxL, `${t.dimBorder}╰${'─'.repeat(boxW - 2)}╯${R}`);

  write(ansi.to(boxTop + 1, boxL + 2 + cursorPos));
}

// ── Inline selector (for models, themes, etc.) ──────────────────────────────
export function renderSelector(title, items, selIdx, contentStartRow) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  for (let r = contentStartRow; r <= H - 2; r++) clearRow(r);

  const boxW = Math.min(50, W - 10);
  const boxL = Math.floor((W - boxW) / 2);
  const inner = boxW - 4;
  let y = contentStartRow + 1;

  at(y++, boxL, `${t.accentBold}${title}${R}`);
  at(y++, boxL, `${t.dimBorder}${'─'.repeat(boxW)}${R}`);

  const maxShow = Math.min(items.length, H - contentStartRow - 6);
  let scrollOff = 0;
  if (selIdx >= maxShow) scrollOff = selIdx - maxShow + 1;
  const visible = items.slice(scrollOff, scrollOff + maxShow);

  for (let i = 0; i < visible.length; i++) {
    const item = visible[i];
    const realIdx = i + scrollOff;
    const sel = realIdx === selIdx;
    const icon = sel ? `${t.accent}▸${R}` : ' ';
    const bg = sel ? t.paletteSel : '';
    const nameStyle = sel ? `${ansi.bold}${t.accent}` : '';
    const descStyle = ansi.dim;
    const name = item.name || item;
    const desc = item.desc || '';

    at(y + i, boxL, `${bg} ${icon} ${nameStyle}${name}${R}${bg}${desc ? `  ${descStyle}${desc}${R}${bg}` : ''}${' '.repeat(Math.max(0, inner - vis(name) - vis(desc) - 4))}${R}`);
  }

  y += visible.length + 1;
  at(y, boxL, `${ansi.dim}↑↓ select  ·  enter confirm  ·  esc cancel${R}`);

  if (items.length > scrollOff + maxShow) {
    at(y + 1, boxL, `${ansi.dim}↓ ${items.length - scrollOff - maxShow} more${R}`);
  }
}

// ── Status bar ──────────────────────────────────────────────────────────────
export function renderStatusBar(version) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  let branch = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {}

  const cwd = process.cwd().replace(process.env.HOME || '', '~');
  const left = branch ? `${cwd}:${branch}` : cwd;
  const right = version || '0.3.2';

  clearRow(H);
  at(H, 1, `${t.statusBg}${t.statusFg} ${left}${' '.repeat(Math.max(0, W - vis(left) - vis(right) - 2))}${right} ${R}`);
}

// ── Streaming indicator ─────────────────────────────────────────────────────
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let _spinIdx = 0;
export function spinnerFrame() { return SPINNER[_spinIdx++ % SPINNER.length]; }

export function renderStreamingIndicator(row, msg) {
  const t = getTheme();
  clearRow(row);
  at(row, 3, `${t.accent}${spinnerFrame()}${ansi.reset} ${ansi.dim}${msg || 'Thinking...'}${ansi.reset}`);
}
