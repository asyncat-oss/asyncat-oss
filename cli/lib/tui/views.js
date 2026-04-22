// Asyncat v2 — Views: Zen screen, chat, palette, input, status bar
import { ansi, strip, vis, w, h, write, at, clearRow, center } from './ansi.js';
import { getTheme, getThemeName } from '../theme.js';
import { getLiveLogsEnabled } from '../colors.js';
import { execSync } from 'child_process';

// ── Cat personality ─────────────────────────────────────────────────────────
const CAT_FACE = [
  '   /\\___/\\   ',
  '  ( ●   ● )  ',
  '   \\  ▾  /   ',
  '    \\___/    ',
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

// ── Zen Home Screen — OpenCode-inspired minimal layout ──────────────────────
export function renderZen(inputBuf, cursorPos, modelInfo, providerInfo, catMsg, logs = []) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  const liveLogs = getLiveLogsEnabled();
  const mainW = liveLogs ? Math.floor(W * 0.65) : W;
  const logW = W - mainW - 1;

  // Clear full screen
  for (let r = 1; r <= H - 1; r++) clearRow(r);

  // ── Logs sidebar ───────────────────────────────────────────────────────
  if (liveLogs) {
    for (let r = 1; r <= H - 1; r++) {
      at(r, mainW + 1, `${t.dimBorder}│${R}`);
    }
    const logH = H - 2;
    const maxLogLen = logW - 2;
    const logLines = [];
    for (const l of logs) logLines.push(...wrapText(l, maxLogLen));
    const startIdx = Math.max(0, logLines.length - logH);
    at(1, mainW + 3, `${ansi.bold}Live Logs${R}`);
    logLines.slice(startIdx).forEach((l, i) => at(i + 3, mainW + 3, `${ansi.dim}${l}${R}`));
  }

  // ── Vertical centering — block is: 4 (cat) + 1 (brand) + 1 (msg) + 2 (gap) + 1 (input) + 1 (model) + 2 (gap) + 1 (hints) = 13
  const blockH = 13;
  const startY = Math.max(2, Math.floor((H - blockH) / 2));
  let y = startY;

  // Cat logo
  for (const line of CAT_FACE) {
    at(y++, 1, center(`${t.logoDim}${line}${R}`, mainW));
  }

  // Brand: "async" dim + "cat" bright
  const brand = `${t.logoDim}async${R}${t.logoBright}cat${R}`;
  at(y++, 1, center(brand, mainW));

  // Cat message
  const msg = catMsg || CAT_MSGS[_catMsgIdx];
  at(y++, 1, center(`${ansi.dim}${ansi.italic}${msg}${R}`, mainW));
  y += 2; // breathing room

  // ── Input area: OpenCode-style left accent bar, no box ─────────────────
  const inputW = Math.floor(mainW * 0.5);
  const inputL = Math.floor((mainW - inputW) / 2);

  const displayBuf = inputBuf || '';
  // For display wrap within the available width (inputW - 2 for "│ ")
  const innerW = inputW - 2;
  const wrappedInput = displayBuf ? wrapInputLine(displayBuf, innerW) : [];
  const maxInputLines = 4;
  const showLines = wrappedInput.slice(0, maxInputLines);

  const inputStartY = y;

  if (!displayBuf) {
    // Single placeholder line
    at(y, inputL, `${t.accent}│${R} ${ansi.dim}Ask the agent anything...${R}`);
    y++;
  } else {
    for (let li = 0; li < showLines.length; li++) {
      at(y, inputL, `${t.accent}│${R} ${t.inputFg}${showLines[li]}${R}`);
      y++;
    }
  }

  // Model info line (same left indent, no bar — just spacing)
  const hasModel = modelInfo && modelInfo !== 'no model' && modelInfo.trim();
  const mLine = hasModel
    ? (providerInfo
        ? `${t.accent2}${modelInfo}${R}  ${ansi.dim}· ${providerInfo}${R}`
        : `${t.accent2}${modelInfo}${R}`)
    : `${ansi.dim}no model${R}  ${t.accent}→${R}  ${ansi.dim}/models to pick one${R}`;
  at(y, inputL, `${ansi.dim}  ${mLine}`);
  y += 2;

  // Shortcuts — subtle, centered
  const sc = `${ansi.dim}/${R}${ansi.dim} commands    ${R}${ansi.bold}/open${R}${ansi.dim} web UI    ${R}${ansi.bold}/tools${R}${ansi.dim} skills    ${R}${ansi.bold}esc${R}${ansi.dim} exit${R}`;
  at(y, 1, center(sc, mainW));

  // ── Cursor: placed on the current wrapped input line ──────────────────
  const { col: cursorCol, line: cursorLine } = calcCursorPosInWrapped(displayBuf, cursorPos, innerW);
  const cursorRow = inputStartY + cursorLine;
  // "│ " = 2 visible chars before input content
  const cursorColAbs = inputL + 2 + cursorCol;
  write(ansi.to(cursorRow, cursorColAbs));
}

// ── Chat View (messages + centered input at bottom) ─────────────────────────
export function renderChat(messages, scrollOffset, inputBuf, cursorPos, modelInfo, providerInfo, logs = []) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  const liveLogs = getLiveLogsEnabled();
  const mainW = liveLogs ? Math.floor(W * 0.65) : W;
  const logW = W - mainW - 1;

  // Clear full screen to ensure clean layout
  for (let r = 1; r <= H - 1; r++) clearRow(r);

  // ── Render logs sidebar if enabled ─────────────────────────────────────
  if (liveLogs) {
    for (let r = 1; r <= H - 1; r++) {
      at(r, mainW + 1, `${t.dimBorder}│${R}`);
    }
    const logStartRow = 1;
    const logH = H - 2;
    const maxLogLen = logW - 2;
    const logLines = [];
    for (const l of logs) {
      logLines.push(...wrapText(l, maxLogLen));
    }
    const startIdx = Math.max(0, logLines.length - logH);
    const visibleLogs = logLines.slice(startIdx);
    
    at(1, mainW + 3, `${ansi.bold}Live Logs${R}`);
    for (let i = 0; i < visibleLogs.length; i++) {
      at(i + 3, mainW + 3, `${ansi.dim}${visibleLogs[i]}${R}`);
    }
  }

  // Layout: content takes most space, input area at bottom (minimal height)
  const maxInputLines = 4;
  const inputAreaH = maxInputLines + 3; // input lines + model line + top separator + gap
  const statusH = 1;
  const contentH = H - inputAreaH - statusH - 1;

  // ── Render messages ────────────────────────────────────────────────────
  const allLines = [];
  for (const msg of messages) {
    allLines.push(...formatMessage(msg, mainW - 6, t));
  }

  const totalLines = allLines.length;
  const start = Math.max(0, totalLines - contentH - scrollOffset);
  const end = Math.min(totalLines, start + contentH);
  const visible = allLines.slice(start, end);

  for (let i = 0; i < contentH; i++) {
    if (i < visible.length) {
      at(i + 1, 3, visible[i]);
    }
  }

  // Scroll indicator
  if (totalLines > contentH && scrollOffset > 0) {
    const pct = Math.round(((totalLines - scrollOffset) / totalLines) * 100);
    at(1, mainW - 6, `${ansi.dim}${pct}%${R}`);
  }

  // ── Input area: OpenCode-style left accent bar ─────────────────────────
  const inputW = Math.floor(mainW * 0.8);
  const inputL = Math.floor((mainW - inputW) / 2);
  const innerW = inputW - 2; // space after "│ "

  // Thin separator line above input area
  const sepRow = H - inputAreaH;
  at(sepRow, inputL, `${t.dimBorder}${'─'.repeat(inputW)}${R}`);

  const inputStartRow = sepRow + 1;
  const displayBuf = inputBuf || '';
  const wrappedInput = displayBuf ? wrapInputLine(displayBuf, innerW) : [];
  const showLines = wrappedInput.slice(0, maxInputLines);

  if (!displayBuf) {
    at(inputStartRow, inputL, `${t.accent}│${R} ${ansi.dim}Type a message...${R}`);
  } else {
    for (let li = 0; li < showLines.length; li++) {
      at(inputStartRow + li, inputL, `${t.accent}│${R} ${t.inputFg}${showLines[li]}${R}`);
    }
  }

  // Model info row
  const mName = modelInfo || 'no model';
  const pName = providerInfo || '';
  const mLine = pName
    ? `${t.accent2}${mName}${R}  ${ansi.dim}· ${pName}${R}`
    : `${ansi.dim}${mName}${R}`;
  at(inputStartRow + maxInputLines, inputL, `  ${mLine}`);

  // Cursor
  const { col: cursorCol, line: cursorLine } = calcCursorPosInWrapped(displayBuf, cursorPos, innerW);
  const cursorRow = inputStartRow + cursorLine;
  const cursorColAbs = inputL + 2 + cursorCol;
  write(ansi.to(cursorRow, cursorColAbs));
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

function wrapInputLine(text, maxW) {
  if (!text) return [''];
  const result = [];
  for (const line of text.split('\n')) {
    if (vis(line) <= maxW) { result.push(line); continue; }
    let rem = line;
    while (vis(rem) > maxW) {
      let cut = maxW;
      for (let i = maxW - 1; i > 0; i--) {
        if (rem[i] === ' ') { cut = i + 1; break; }
      }
      result.push(rem.slice(0, cut));
      rem = rem.slice(cut);
    }
    if (rem) result.push(rem);
  }
  return result;
}

function calcCursorPosInWrapped(buf, pos, maxW) {
  // Must use the same word-aware wrap logic as wrapInputLine, not simple division
  if (!buf || pos === 0) return { col: 0, line: 0 };
  const lines = wrapInputLine(buf, maxW);
  let rem = pos;
  for (let li = 0; li < lines.length; li++) {
    if (rem <= lines[li].length) {
      return { col: vis(lines[li].slice(0, rem)), line: li };
    }
    rem -= lines[li].length;
  }
  const last = lines[lines.length - 1] || '';
  return { col: vis(last), line: lines.length - 1 };
}

// ── Command palette (renders over content area) ─────────────────────────────
export const PALETTE_CMDS = [
  { cmd: '/models',   desc: 'Switch model / serve / pull',         group: '🤖 AI' },
  { cmd: '/provider', desc: 'Configure AI provider',            group: '🤖 AI' },
  { cmd: '/skills',   desc: 'Browse 45 brain skills',             group: '🤖 AI' },
  { cmd: '/tools',    desc: 'View agent tools & capabilities',    group: '🤖 AI' },
  { cmd: '/memory',   desc: 'Search agent memories',            group: '🤖 AI' },
  { cmd: '/sessions', desc: 'Browse past conversations',          group: '🤖 AI' },
  { cmd: '/cron',     desc: 'Schedule recurring tasks',            group: '⚡ Automation' },
  { cmd: '/mcp',      desc: 'Manage MCP servers',               group: '🔌 Integrations' },
  { cmd: '/open',     desc: 'Open web UI',                     group: '🌐 Web' },
  { cmd: '/git',      desc: 'Git status, branches, commits',  group: '📝 Dev' },
  { cmd: '/code',     desc: 'Browse project files',            group: '📝 Dev' },
  { cmd: '/context',  desc: 'Show workspace context',           group: '📝 Dev' },
  { cmd: '/snippets', desc: 'Save and reuse code',              group: '📝 Dev' },
  { cmd: '/status',   desc: 'Running services',                 group: '🛠 Services' },
  { cmd: '/logs',     desc: 'View service logs',                group: '🛠 Services' },
  { cmd: '/doctor',   desc: 'System health check',               group: '🛠 Services' },
  { cmd: '/theme',    desc: 'Switch color theme',                group: '⚙️ Settings' },
  { cmd: '/config',   desc: 'Get or set configuration',         group: '⚙️ Settings' },
  { cmd: '/install',  desc: 'Install dependencies',             group: '⚙️ Settings' },
  { cmd: '/new',      desc: 'Start new session',               group: '🧹 Tools' },
  { cmd: '/stash',    desc: 'Save or view notes',             group: '🧹 Tools' },
  { cmd: '/live-logs',desc: 'Toggle streaming logs',          group: '🧹 Tools' },
  { cmd: '/clear',    desc: 'Clear screen',                   group: '❓ Help' },
  { cmd: '/help',     desc: 'Command reference',            group: '❓ Help' },
  { cmd: '/exit',     desc: 'Exit asyncat',                 group: '❓ Help' },
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
  const liveLogs = getLiveLogsEnabled();
  const mainW = liveLogs ? Math.floor(W * 0.65) : W;

  // ── Flat overlay panel — no emoji group headers, clean and compact ──────────
  const panelBg  = ansi.bgRgb(20, 22, 30);
  const selBg    = ansi.bgRgb(22, 42, 50); // muted teal, works across all themes
  const panelW   = Math.min(Math.floor(mainW * 0.55), 68);
  const panelL   = Math.floor((mainW - panelW) / 2) + 1;
  const panelTop = 2;

  const maxShow = Math.min(items.length, H - 10);
  let scrollOff = 0;
  if (selIdx >= maxShow) scrollOff = selIdx - maxShow + 1;
  const visible = items.slice(scrollOff, scrollOff + maxShow);
  const colW = items.length > 0 ? Math.max(...items.map(c => c.cmd.length)) + 2 : 10;

  // Paint panel rows
  const totalRows = maxShow + 2;
  for (let r = panelTop; r <= panelTop + totalRows; r++) {
    at(r, panelL - 1, `${panelBg}${' '.repeat(panelW + 2)}${R}`);
  }

  // Title + esc hint
  const escPad = Math.max(0, panelW - 8 - 3);
  at(panelTop,     panelL, `${panelBg}${ansi.bold}Commands${R}${panelBg}${' '.repeat(escPad)}${ansi.dim}esc${R}`);

  if (items.length === 0) {
    at(panelTop + 2, panelL, `${panelBg}  ${ansi.dim}No matching commands${R}`);
  } else {
    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      const realIdx = i + scrollOff;
      const sel = realIdx === selIdx;
      const bg = sel ? selBg : panelBg;
      const cmdStyle = sel ? `${ansi.bold}${t.paletteCmd}` : t.paletteCmd;
      const padded = item.cmd.padEnd(colW);
      const desc = (item.desc || '').slice(0, panelW - colW - 4);
      const pad = Math.max(0, panelW - vis(padded) - vis(desc) - 2);
      at(panelTop + 2 + i, panelL, `${bg}  ${cmdStyle}${padded}${R}${bg}${ansi.dim}${desc}${' '.repeat(pad)}${R}`);
    }
    if (items.length > scrollOff + maxShow) {
      at(panelTop + 2 + maxShow, panelL, `${panelBg}  ${ansi.dim}↓ ${items.length - scrollOff - maxShow} more${R}`);
    }
  }

  // Cursor at zen input position (renderZen already drew it, we re-anchor)
  const inputW = Math.floor(mainW * 0.5);
  const inputL = Math.floor((mainW - inputW) / 2);
  const innerW = inputW - 2;
  const buf = inputBuf || '';
  const { col: cc, line: cl } = calcCursorPosInWrapped(buf, cursorPos, innerW);
  const startY = Math.max(2, Math.floor((H - 13) / 2));
  write(ansi.to(startY + 8 + cl, inputL + 2 + cc));
}

// ── Selector — floating panel overlay with search ───────────────────────────
export function renderSelector(title, items, selIdx, inputBuf, cursorPos) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  const panelBg = ansi.bgRgb(18, 18, 24);
  const panelW = Math.min(Math.floor(W * 0.5), 62);
  const panelL = Math.floor((W - panelW) / 2) + 1;

  // Filter items by search query
  const query = (inputBuf || '').toLowerCase();
  const filtered = query
    ? items.filter(it => (it.name || it).toLowerCase().includes(query) || (it.desc || '').toLowerCase().includes(query))
    : items;

  const maxShow = Math.min(filtered.length, H - 14);
  let scrollOff = 0;
  if (selIdx >= maxShow) scrollOff = selIdx - maxShow + 1;
  const visible = filtered.slice(scrollOff, scrollOff + maxShow);

  // Panel height: title + search + divider + items + divider + hint = maxShow + 5
  const panelH = maxShow + 5;
  const panelTop = Math.max(2, Math.floor((H - panelH) / 2));

  for (let r = panelTop; r <= panelTop + panelH; r++) {
    at(r, panelL - 1, `${panelBg}${' '.repeat(panelW + 2)}${R}`);
  }

  // Title row + esc hint
  const escPad = Math.max(0, panelW - vis(title) - 3);
  at(panelTop, panelL, `${panelBg}${ansi.bold}${title}${R}${panelBg}${' '.repeat(escPad)}${ansi.dim}esc${R}`);

  // Search input row
  const searchStr = inputBuf || '';
  const searchPad = Math.max(0, panelW - vis(searchStr) - 1);
  at(panelTop + 1, panelL, `${panelBg}${ansi.dim}${t.paletteCmd}${searchStr || ''}${ansi.dim}${searchStr ? '' : 'Search...'}${R}${panelBg}${' '.repeat(searchPad)}${R}`);

  if (filtered.length === 0) {
    at(panelTop + 3, panelL, `${panelBg}  ${ansi.dim}No matches${R}`);
  } else {
    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      const realIdx = i + scrollOff;
      const sel = realIdx === selIdx;
      const bg = sel ? t.paletteSel : panelBg;
      const nameStyle = sel ? `${ansi.bold}${t.paletteCmd}` : '';
      const name = item.name || item;
      const desc = item.desc || '';
      const pad = Math.max(0, panelW - vis(name) - vis(desc) - 4);
      at(panelTop + 3 + i, panelL, `${bg}  ${nameStyle}${name}${R}${bg}${desc ? `  ${ansi.dim}${desc}${R}${bg}` : ''}${' '.repeat(pad)}${R}`);
    }
  }

  at(panelTop + 3 + maxShow, panelL, `${panelBg}${ansi.dim}  ↑↓ navigate  ·  enter confirm  ·  esc cancel${R}`);

  // Cursor in search input
  write(ansi.to(panelTop + 1, panelL + cursorPos));
}

// ── Model Setup Wizard ────────────────────────────────────────────────────────
export function renderModelSetup(model, ctxBuf, cursorPos, isFocused) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  // Clear full screen
  for (let r = 1; r <= H - 1; r++) clearRow(r);

  const boxW = Math.min(60, W - 6);
  const boxL = Math.floor((W - boxW) / 2);
  const inner = boxW - 4;

  const blockH = 16;
  const startY = Math.max(2, Math.floor((H - blockH) / 2));
  let y = startY;

  // Title
  at(y++, boxL, `${t.accentBold}Model Setup${R}`);
  at(y++, boxL, `${t.dimBorder}${'─'.repeat(boxW)}${R}`);
  y++;

  // Model Info
  at(y++, boxL, ` ${ansi.bold}Name:${R} ${model.name}`);
  at(y++, boxL, ` ${ansi.bold}Size:${R} ${model.sizeFormatted || 'Unknown'}`);
  if (model.architecture && model.architecture !== 'unknown') {
    at(y++, boxL, ` ${ansi.bold}Arch:${R} ${model.architecture} ${model.parameterCount ? `(${model.parameterCount})` : ''}`);
  }

  // Guess capabilities from name
  const nameL = (model.name || '').toLowerCase();
  let tools = 'Unknown';
  if (nameL.includes('qwen') || nameL.includes('hermes') || nameL.includes('llama-3') || nameL.includes('tool')) {
    tools = `${t.success}Supported${R}`;
  } else {
    tools = `${ansi.dim}Not explicitly supported${R}`;
  }
  at(y++, boxL, ` ${ansi.bold}Tools:${R} ${tools}`);
  y++;

  at(y++, boxL, `${t.dimBorder}${'─'.repeat(boxW)}${R}`);
  y++;

  // Config fields
  at(y++, boxL, ` ${ansi.bold}Hyperparameters${R}`);

  // Context Size Input
  const label = " Context Size: ";
  const ctxStr = ctxBuf || '';
  const bufPad = Math.max(0, 10 - vis(ctxStr));

  const bg = isFocused ? t.paletteSel : '';
  at(y, boxL, `${bg}${label}${isFocused ? t.inputFg : ''}${ctxStr}${R}${bg}${' '.repeat(bufPad)}${R}`);

  const cursorRow = y;
  const cursorCol = boxL + vis(label) + cursorPos;
  y += 2;

  at(y++, boxL, center(`${ansi.dim}enter start model  ·  esc cancel${R}`, boxW));

  if (isFocused) {
    write(ansi.to(cursorRow, cursorCol));
  }
}

// ── Status bar ──────────────────────────────────────────────────────────────
let _statusCache = { backend: false, frontend: false, ts: 0 };

export function setServiceStatus(backend, frontend) {
  _statusCache = { backend, frontend, ts: Date.now() };
}

export function renderStatusBar(version, streamingMsg, modelInfo) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  clearRow(H);

  // ── Streaming mode: OpenCode-style animated bottom bar ────────────────
  if (streamingMsg) {
    const spin = spinnerFrame();
    const modelStr = modelInfo ? `${t.accent2}${modelInfo}${R}  ` : '';
    const right = `${ansi.dim}esc stop${R}  ${modelStr}${ansi.dim}${version || ''}${R} `;
    const left = ` ${t.accent}${spin}${R}`;
    const leftVis = vis(` ${spin}`);
    const rightVis = vis(`esc stop  ${modelInfo ? modelInfo + '  ' : ''}${version || ''} `);
    const gap = Math.max(1, W - leftVis - rightVis);
    at(H, 1, `${t.statusFg}${left}${' '.repeat(gap)}${right}${R}`);
    return;
  }

  // ── Normal status bar ─────────────────────────────────────────────────
  let branch = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {}

  const cwd = process.cwd().replace(process.env.HOME || '', '~');
  const loc = branch ? `${cwd}:${branch}` : cwd;

  const be = _statusCache.backend
    ? `${t.success}●${R}${ansi.dim} api :8716${R}`
    : `${ansi.dim}○ api${R}`;
  const fe = _statusCache.frontend
    ? `${t.success}●${R}${ansi.dim} web :8717${R}`
    : `${ansi.dim}○ web${R}`;

  const left = ` ${loc}`;
  const mid = `${be}  ${fe}`;
  const right = `${version || 'unknown'} `;

  const leftVis = vis(left);
  const midVis = vis(mid);
  const rightVis = vis(right);
  const gap1 = Math.max(1, Math.floor((W - leftVis - midVis - rightVis) / 2));
  const gap2 = Math.max(1, W - leftVis - gap1 - midVis - rightVis);

  at(H, 1, `${t.statusFg}${left}${' '.repeat(gap1)}${mid}${' '.repeat(gap2)}${right}${R}`);
}

// ── Result popup — scrollable command output overlay ───────────────────────
export function renderResult(title, lines, scrollOff = 0) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  const panelBg = ansi.bgRgb(20, 22, 30);
  const panelW  = Math.min(Math.floor(W * 0.72), 90);
  const panelL  = Math.floor((W - panelW) / 2) + 1;
  const contentH = Math.min(lines.length, H - 10);
  const panelH   = contentH + 3;
  const panelTop = Math.max(2, Math.floor((H - panelH) / 2));

  for (let r = panelTop; r <= panelTop + panelH; r++) {
    at(r, panelL - 1, `${panelBg}${' '.repeat(panelW + 2)}${R}`);
  }

  const escPad = Math.max(0, panelW - vis(title) - 3);
  at(panelTop,     panelL, `${panelBg}${ansi.bold}${title}${R}${panelBg}${' '.repeat(escPad)}${ansi.dim}esc${R}`);

  const visLines = lines.slice(scrollOff, scrollOff + contentH);
  for (let i = 0; i < contentH; i++) {
    const line = i < visLines.length ? visLines[i] : '';
    const pad = Math.max(0, panelW - vis(line) - 2);
    at(panelTop + 2 + i, panelL, `${panelBg}  ${line}${' '.repeat(pad)}${R}`);
  }

  at(panelTop + 2 + contentH, panelL, `${panelBg}${ansi.dim}  ↑↓ scroll  ·  esc close${R}`);
}

// ── Models Page — 3-tab floating panel (Downloaded / Recommended / Search) ───
export function renderModelsPage(tab, searchBuf, items, selectedIdx, activeDownloads, loading) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  // Clear full screen so old content never bleeds through when panel size changes
  for (let r = 1; r <= H - 1; r++) clearRow(r);

  const TAB_NAMES = ['Downloaded', 'Recommended', 'Search'];
  const panelBg = ansi.bgRgb(18, 18, 24);
  const panelW = Math.min(Math.floor(W * 0.72), 88);
  const panelL = Math.floor((W - panelW) / 2) + 1;

  const maxShow = Math.min(items.length, H - 14);
  const panelH = maxShow + 8; // title + tabs + divider + items + dl_section + hint
  const panelTop = Math.max(2, Math.floor((H - panelH) / 2));

  // Draw panel background
  for (let r = panelTop; r <= panelTop + panelH; r++) {
    at(r, panelL - 1, `${panelBg}${' '.repeat(panelW + 2)}${R}`);
  }

  // Title row + esc hint
  const titleStr = 'Models';
  const escPad = Math.max(0, panelW - vis(titleStr) - 3);
  at(panelTop, panelL, `${panelBg}${ansi.bold}${t.accent}${titleStr}${R}${panelBg}${' '.repeat(escPad)}${ansi.dim}esc${R}`);

  // Tabs row
  const tabsStr = TAB_NAMES.map((name, i) => {
    const sel = i === tab;
    return sel ? `${ansi.bold}${t.accent}${name}${R}` : `${ansi.dim}${name}`;
  }).join(`  `);
  at(panelTop + 1, panelL, `${panelBg}${tabsStr}${R}`);

  // Item list
  if (items.length === 0) {
    if (loading) {
      at(panelTop + 3, panelL, `${panelBg}  ${ansi.dim}Loading...${R}`);
    } else {
      const emptyMsg = tab === 0
        ? 'No models downloaded yet.'
        : tab === 1
          ? 'Select a recommended model below to download.'
          : 'Type to search HuggingFace GGUF models';
      at(panelTop + 3, panelL, `${panelBg}  ${ansi.dim}${emptyMsg}${R}`);
    }
  } else {
    const scrollOff = selectedIdx >= maxShow ? selectedIdx - maxShow + 1 : 0;
    const visible = items.slice(scrollOff, scrollOff + maxShow);

    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      const realIdx = i + scrollOff;
      const sel = realIdx === selectedIdx;
      const row = panelTop + 3 + i;
      const bg = sel ? t.paletteSel : panelBg;
      const nameStyle = sel ? `${ansi.bold}${t.paletteCmd}` : '';
      const name = item.name || item.id || item.repoId || '';
      const desc = item.description
        ? item.description.slice(0, panelW - vis(name) - 6)
        : item.vram ? item.vram : (item.params || '');

      const namePad = Math.max(0, panelW - vis(name) - vis(desc) - 4);
      at(row, panelL, `${bg}  ${nameStyle}${name}${R}${bg}${desc ? `  ${ansi.dim}${desc}${R}${bg}` : ''}${' '.repeat(namePad)}${R}`);
    }
  }

  // Active downloads section
  const dlTop = panelTop + 2 + maxShow;

  if (activeDownloads && activeDownloads.length > 0) {
    at(dlTop, panelL, `${panelBg}${ansi.bold}  Downloading:${R}`);
    for (let di = 0; di < activeDownloads.length; di++) {
      const dl = activeDownloads[di];
      const dlRow = dlTop + 2 + di;
      if (dlRow >= panelTop + panelH - 1) break;

      const pct = dl.progress || 0;
      const barW = Math.min(20, panelW - 30);
      const filled = Math.round((pct / 100) * barW);
      const bar = `${t.accent}${'█'.repeat(filled)}${ansi.dim}${'░'.repeat(barW - filled)}`;
      const pctStr = `${String(pct).padStart(3)}%`;
      const dlStr = dl.downloadedFormatted || '?';
      const totStr = dl.totalFormatted || '?';
      const filename = dl.filename || '…';
      const dlLine = `  ${ansi.dim}⟳${R} ${bar} ${pctStr}  ${ansi.dim}${dlStr}/${totStr}${R}  ${ansi.dim}${filename}${R}`;
      at(dlRow, panelL, dlLine);
    }
  }

  // Hint row
  const hintRow = panelTop + panelH - 1;
  at(hintRow, panelL, `${panelBg}${ansi.dim}  ↑↓ navigate  · Enter select/download  · Tab switch tabs  · Esc close${R}`);

  // Cursor at search buf position for search tab
  if (tab === 2) {
    write(ansi.to(panelTop + 1, panelL + vis(searchBuf || '') + 2));
  }
}

// ── Provider Setup Wizard ────────────────────────────────────────────────────
// state: { step, providerType, apiKey, model, baseUrl, fieldIdx }
// step 0 = provider type selection
// step 1 = config fields (api key / model / url)

export const PROVIDER_TYPES = [
  { name: 'Claude (Anthropic)', type: 'anthropic', desc: 'Claude Opus/Sonnet/Haiku',            local: false },
  { name: 'OpenAI',             type: 'openai',    desc: 'OpenAI API key (platform.openai.com)', local: false },
  { name: 'ChatGPT Plus/Pro',   type: 'chatgpt',   desc: 'Use existing subscription via OAuth',  local: false, oauth: true },
  { name: 'GitHub Copilot',     type: 'copilot',   desc: 'Use Copilot subscription (local proxy)', local: true },
  { name: 'MiniMax',            type: 'minimax',   desc: 'MiniMax API',                          local: false },
  { name: 'Groq',               type: 'groq',      desc: 'Groq (free tier, fast)',               local: false },
  { name: 'Ollama',             type: 'ollama',    desc: 'Local GGUF via Ollama',                local: true  },
  { name: 'LM Studio',         type: 'lmstudio',  desc: 'Local GGUF via LM Studio',             local: true  },
  { name: 'Custom',             type: 'custom',    desc: 'Any OpenAI-compatible API',            local: false },
];

export const PROVIDER_DEFAULTS = {
  anthropic: { model: 'claude-sonnet-4-6',          baseUrl: 'https://api.anthropic.com/v1' },
  openai:    { model: 'gpt-4o',                     baseUrl: 'https://api.openai.com/v1' },
  chatgpt:   { model: 'gpt-4o',                     baseUrl: 'https://api.openai.com/v1' },
  copilot:   { model: 'gpt-4o',                     baseUrl: 'http://localhost:4141/v1' },
  minimax:   { model: 'MiniMax-Text-01',             baseUrl: 'https://api.minimax.io/v1' },
  groq:      { model: 'llama-3.3-70b-versatile',    baseUrl: 'https://api.groq.com/openai/v1' },
  custom:    { model: '',                           baseUrl: '' },
};

export function renderProviderSetup(state, cursorPos) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  for (let r = 1; r <= H; r++) clearRow(r);

  const boxW = Math.min(64, W - 4);
  const boxL = Math.floor((W - boxW) / 2);
  const inner = boxW - 4;

  const blockH = state.step === 0 ? 18 : 20;
  const startY = Math.max(2, Math.floor((H - blockH) / 2));
  let y = startY;

  const title = state.step === 0 ? 'Provider Setup' : `Provider: ${PROVIDER_TYPES.find(p => p.type === state.providerType)?.name || state.providerType}`;
  at(y++, boxL, `${t.accentBold}${title}${R}`);
  at(y++, boxL, `${t.dimBorder}${'─'.repeat(boxW)}${R}`);
  y++;

  if (state.step === 0) {
    const items = PROVIDER_TYPES;
    const maxShow = Math.min(items.length, H - startY - 8);
    const topIdx = Math.max(0, Math.min(state._selIdx ?? 0, items.length - maxShow));
    const selIdx = state._selIdx ?? 0;

    for (let i = 0; i < maxShow; i++) {
      const item = items[i + topIdx];
      if (!item) break;
      const sel = (i + topIdx) === selIdx;
      const bg = sel ? t.paletteSel : '';
      const nameStyle = sel ? `${ansi.bold}${t.paletteCmd}` : t.paletteCmd;
      const icon = item.local ? `${t.success}●${R}` : `${t.accent}●${R}`;
      const namePad = 14;
      const desc = item.desc || '';
      const pad = Math.max(0, inner - vis(namePad + desc) - 4);
      at(y + i, boxL, `${bg}  ${icon} ${nameStyle}${item.name.padEnd(namePad)}${R}${bg}${ansi.dim}${desc}${R}${bg}${' '.repeat(pad)}${R}`);
    }

    const hint = items.length > maxShow ? `${ansi.dim}  ↑↓ scroll · enter select · esc cancel${R}` : `${ansi.dim}  ↑↓ navigate · enter select · esc cancel${R}`;
    at(y + maxShow, boxL, hint);

    const visIdx = selIdx - topIdx;
    if (visIdx >= 0 && visIdx < maxShow) {
      write(ansi.to(startY + 3 + visIdx, boxL + 2));
    }
    return;
  }

  // Step 1: config fields
  const fields = [
    { label: 'API Key',  key: 'apiKey',  masked: false, hint: 'sk-...' },
    { label: 'Model',    key: 'model',   masked: false, hint: PROVIDER_DEFAULTS[state.providerType]?.model || 'model-name' },
    { label: 'Base URL', key: 'baseUrl', masked: false, hint: PROVIDER_DEFAULTS[state.providerType]?.baseUrl || 'https://...' },
  ];

  const isLocal = state.providerType === 'ollama' || state.providerType === 'lmstudio';

  if (isLocal) {
    const port = state.providerType === 'ollama' ? '11434' : '1234';
    at(y++, boxL, `  ${ansi.dim}Local provider — no API key needed.${R}`);
    at(y++, boxL, `  ${ansi.dim}Server should be running at localhost:${port}${R}`);
    at(y++, boxL, `  ${ansi.dim}Use /models to serve a GGUF file.${R}`);
    y++;
    at(y++, boxL, `${t.dimBorder}${'─'.repeat(boxW)}${R}`);
    y++;
  } else {
    at(y++, boxL, `  ${ansi.bold}Enter your credentials:${R}  ${ansi.dim}(tab to move, enter to confirm)${R}`);
    y++;

    let cursorRow = -1, cursorCol = -1;
    for (let fi = 0; fi < fields.length; fi++) {
      const field = fields[fi];
      const active = state.fieldIdx === fi;
      const val = state[field.key] || '';
      const label = ` ${field.label.padEnd(9)}`;
      const labelW = vis(label);
      const availW = inner - labelW - 1;

      if (active) {
        let displayVal = val;
        // scroll view: if value is too wide, show the tail so cursor stays visible
        if (vis(displayVal) > availW) displayVal = displayVal.slice(-(availW));
        const hint = !val ? `${ansi.dim}${field.hint}${R}` : '';
        const valStyle = t.inputFg;
        const display = displayVal || hint;
        const fillW = Math.max(0, availW - vis(display));
        at(y, boxL, `${t.paletteSel}${label}${valStyle}${display}${R}${t.paletteSel}${' '.repeat(fillW)} ${R}`);
        cursorRow = y;
        cursorCol = boxL + labelW + vis(displayVal);
      } else {
        let displayVal = val || `${ansi.dim}${field.hint}${R}`;
        // truncate non-active fields too so they don't overflow
        if (val && vis(val) > availW) displayVal = val.slice(0, availW - 1) + '…';
        const pad = Math.max(0, availW - vis(val ? displayVal : field.hint));
        at(y, boxL, ` ${label}${displayVal}${R}${' '.repeat(pad)}`);
      }
      y++;
    }
    y++;

    at(y++, boxL, `${t.dimBorder}${'─'.repeat(boxW)}${R}`);
    const confirmLabel = isLocal ? 'Save & Connect' : 'Save Provider';
    at(y++, boxL, center(`${ansi.dim}tab next field · enter ${confirmLabel} · esc back${R}`, boxW));

    if (cursorRow >= 0) write(ansi.to(cursorRow, cursorCol));
    return;
  }

  at(y++, boxL, `${t.dimBorder}${'─'.repeat(boxW)}${R}`);

  const confirmLabel = isLocal ? 'Save & Connect' : 'Save Provider';
  const hints = state.step === 0
    ? `${ansi.dim}enter confirm · esc cancel${R}`
    : `${ansi.dim}tab next field · enter ${confirmLabel} · esc back${R}`;
  at(y++, boxL, center(hints, boxW));
}

// ── Streaming indicator ─────────────────────────────────────────────────────
const PROGRESS_FRAMES = [
  "[████████░░░░░░░░░░░░░░░░░] thinking... (it's not)",
  "[░░████████░░░░░░░░░░░░░░░░] calculating nothing...",
  "[░░░░████████░░░░░░░░░░░░░░] existential processing...",
  "[░░░░░░░████████░░░░░░░░░░] pretending to work...",
  "[░░░░░░░░░░████████░░░░░░░] consulting the void...",
  "[░░░░░░░░░░░░████████░░░░░░] lying about progress...",
  "[░░░░░░░░░░░░░░████████░░░░] questioning my choices...",
  "[░░░░░░░░░░░░░░░░████████░░] this is all your fault...",
  "[░░░░░░░░░░░░░░░░░░████████] almost there... (lying)",
];
let _barIdx = 0;
export function spinnerFrame() { return PROGRESS_FRAMES[_barIdx++ % PROGRESS_FRAMES.length]; }

export function renderStreamingIndicator(row, msg) {
  const t = getTheme();
  clearRow(row);
  at(row, 3, `${t.accent}${spinnerFrame()}${ansi.reset}`);
}
