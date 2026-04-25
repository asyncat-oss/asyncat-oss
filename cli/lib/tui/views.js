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

const ASYNCAT_WORDMARK = [
  ' █████╗ ███████╗██╗   ██╗███╗   ██╗ ██████╗ █████╗ ████████╗',
  '██╔══██╗██╔════╝╚██╗ ██╔╝████╗  ██║██╔════╝██╔══██╗╚══██╔══╝',
  '███████║███████╗ ╚████╔╝ ██╔██╗ ██║██║     ███████║   ██║',
  '██╔══██║╚════██║  ╚██╔╝  ██║╚██╗██║██║     ██╔══██║   ██║',
  '██║  ██║███████║   ██║   ██║ ╚████║╚██████╗██║  ██║   ██║',
  '╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝   ╚═╝',
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
export function renderZen(inputBuf, cursorPos, modelInfo, providerInfo, catMsg, logs = [], contextInfo = {}, startupLog = []) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  const liveLogs = getLiveLogsEnabled();
  const mainW = liveLogs ? Math.floor(W * 0.65) : W;
  const logW = W - mainW - 1;

  clearThemedRows(t, 1, H - 1, W);

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

  // ── Startup log — top-right corner, dim, non-intrusive ────────────────
  if (startupLog.length > 0) {
    const iconColor = { '✔': t.success, '✖': t.error, '→': ansi.dim, '◐': t.warning };
    startupLog.forEach((entry, i) => {
      const ic = iconColor[entry.icon] || ansi.dim;
      const line = `${ic}${entry.icon}${R}${ansi.dim} ${entry.text}${R}`;
      const col = Math.max(2, mainW - vis(` ${entry.icon} ${entry.text}`) - 2);
      at(i + 1, col, line);
    });
  }

  const layout = getZenLayout(mainW, H);
  const startY = layout.startY;
  let y = startY;

  // Logo: big wordmark on roomy terminals, compact signature on tight ones.
  if (layout.bigBrand) {
    for (const line of ASYNCAT_WORDMARK) {
      atCentered(y++, `${t.logoDim}${line.slice(0, 40)}${t.logoBright}${line.slice(40)}${R}`, mainW, t);
    }
  } else {
    for (const line of CAT_FACE.slice(1)) {
      atCentered(y++, `${t.logoDim}${line}${R}`, mainW, t);
    }
    const brand = `${t.logoDim}ASYN${R}${t.logoBright}CAT${R}`;
    atCentered(y++, `${ansi.bold}${brand}${R}`, mainW, t);
  }

  // Cat message
  const msg = catMsg || CAT_MSGS[_catMsgIdx];
  atCentered(y++, `${ansi.dim}${ansi.italic}${msg}${R}`, mainW, t);
  y += 1; // gap

  const prompt = renderPromptPanel({
    row: y,
    left: layout.inputL,
    width: layout.inputW,
    inputBuf,
    cursorPos,
    placeholder: 'Ask the agent anything...',
    emptyModelText: 'no model  ->  /models',
    modelInfo,
    providerInfo,
    contextInfo,
    maxInputLines: 3,
    t,
  });
  y += prompt.height + 1;

  // Shortcuts — subtle, centered
  const sc = `${ansi.bold}/open${R}${ansi.dim} web UI    ${R}${ansi.bold}esc${R}${ansi.dim} exit${R}`;
  atCentered(y, sc, mainW, t);

  // ── Cursor ────────────────────────────────────────────────────────────
  write(ansi.to(prompt.cursorRow, prompt.cursorCol));
}

// ── Chat View (messages + centered input at bottom) ─────────────────────────
export function renderChat(messages, scrollOffset, inputBuf, cursorPos, modelInfo, providerInfo, logs = [], focusIdx = -1, expandedMsgs = new Set(), contextInfo = {}) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  const liveLogs = getLiveLogsEnabled();
  const mainW = liveLogs ? Math.floor(W * 0.65) : W;
  const logW = W - mainW - 1;

  clearThemedRows(t, 1, H - 1, W);

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
  const inputAreaH = maxInputLines + 2; // separator + borderless prompt (inputs + meta)
  const statusH = 1;
  const contentH = H - inputAreaH - statusH - 1;

  // ── Render messages ────────────────────────────────────────────────────
  const allLines = [];
  for (let i = 0; i < messages.length; i++) {
    allLines.push(...formatMessage(messages[i], mainW - 6, t, focusIdx === i, expandedMsgs.has(i)));
  }
  // Footer hint when a tool message is focused
  if (focusIdx !== -1 && messages[focusIdx]?.role === 'tool') {
    const isExpanded = expandedMsgs.has(focusIdx);
    allLines.push(`${ansi.dim}  ↵ ${isExpanded ? 'collapse' : 'expand'}  ·  tab next  ·  esc clear${ansi.reset}`);
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

  // ── Input area: compact framed prompt, kept readable on wide terminals ─
  const inputW = clamp(Math.floor(mainW * 0.62), Math.min(52, mainW - 4), Math.min(96, mainW - 4));
  const inputL = Math.floor((mainW - inputW) / 2);

  // Thin separator line above input area
  const sepRow = H - inputAreaH;
  const ruleW = Math.min(inputW, mainW - inputL - 1);
  at(sepRow, inputL, `${t.screenBg || ''}${ansi.dim}${'─'.repeat(ruleW)}${R}`);

  const prompt = renderPromptPanel({
    row: sepRow + 1,
    left: inputL,
    width: inputW,
    inputBuf,
    cursorPos,
    placeholder: 'Type a message...',
    emptyModelText: 'no model  ->  /models',
    modelInfo,
    providerInfo,
    contextInfo,
    maxInputLines,
    t,
  });

  write(ansi.to(prompt.cursorRow, prompt.cursorCol));
}

function getZenLayout(mainW, H) {
  const bigBrand = mainW >= 74 && H >= 24;
  const logoH = bigBrand ? ASYNCAT_WORDMARK.length : 4;
  const inputW = clamp(Math.floor(mainW * 0.46), Math.min(44, mainW - 4), Math.min(78, mainW - 4));
  const inputL = Math.floor((mainW - inputW) / 2);
  const promptH = 4; // 3 input rows + model row
  const blockH = logoH + 1 + 1 + promptH + 1;
  return {
    bigBrand,
    inputW,
    inputL,
    startY: Math.max(2, Math.floor((H - blockH) / 2)),
  };
}

function renderPromptPanel({
  row,
  left,
  width,
  inputBuf,
  cursorPos,
  placeholder,
  emptyModelText,
  modelInfo,
  providerInfo,
  contextInfo,
  maxInputLines,
  t,
}) {
  const R = ansi.reset;
  const screenBg = t.screenBg || '';
  const textW = Math.max(1, width - 3);
  const displayBuf = inputBuf || '';
  const wrappedInput = displayBuf ? wrapInputLine(displayBuf, textW) : [];
  const showLines = wrappedInput.slice(0, maxInputLines);

  for (let li = 0; li < maxInputLines; li++) {
    const hasText = li < showLines.length;
    const shown = hasText ? showLines[li] : (li === 0 && !displayBuf ? placeholder : '');
    const style = hasText ? (t.inputFg || '') : ansi.dim;
    // Left accent bar on first line only, plain screen background (no panel box)
    const accent = li === 0 ? `${t.accent}▏${R}${screenBg}` : `${ansi.dim} ${R}${screenBg}`;
    const pad = Math.max(0, textW - vis(shown));
    at(row + li, left, `${screenBg}${accent} ${style}${shown}${R}${screenBg}${' '.repeat(pad)}${R}`);
  }

  const meta = formatModelLine(modelInfo, providerInfo, contextInfo, emptyModelText, t);
  const metaShown = truncateVisible(meta, textW);
  const metaPad = Math.max(0, textW - vis(metaShown));
  at(row + maxInputLines, left, `${screenBg}  ${ansi.dim}${metaShown}${R}${screenBg}${' '.repeat(metaPad)}${R}`);

  const { col: cursorCol, line: cursorLine } = calcCursorPosInWrapped(displayBuf, cursorPos, textW);
  return {
    height: maxInputLines + 1,
    cursorRow: row + cursorLine,
    cursorCol: left + 3 + cursorCol,
  };
}

function formatModelLine(modelInfo, providerInfo, contextInfo, emptyModelText, t) {
  const hasModel = modelInfo && modelInfo !== 'no model' && modelInfo.trim();
  if (!hasModel) return `${ansi.dim}${emptyModelText}${ansi.reset}`;
  const ctxSuffix = formatContextSuffix(contextInfo);
  return providerInfo
    ? `${t.accent2}${modelInfo}${ansi.dim}  · ${providerInfo}${ctxSuffix}${ansi.reset}`
    : `${t.accent2}${modelInfo}${ansi.dim}${ctxSuffix}${ansi.reset}`;
}

function truncateVisible(text, maxW) {
  if (vis(text) <= maxW) return text;
  const plain = strip(text);
  return `${plain.slice(0, Math.max(0, maxW - 1))}…`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Parse RGB from a bgRgb escape string and return a slightly darker variant
function _dimBg(bgStr, amount) {
  if (!bgStr) return bgStr;
  const m = bgStr.match(/48;2;(\d+);(\d+);(\d+)/);
  if (!m) return bgStr;
  const r = Math.max(0, parseInt(m[1]) - amount);
  const g = Math.max(0, parseInt(m[2]) - amount);
  const b = Math.max(0, parseInt(m[3]) - amount);
  return `\x1b[48;2;${r};${g};${b}m`;
}

function clearThemedRows(t, from, to, width) {
  const bg = t.screenBg || '';
  const fg = t.screenFg || '';
  // Subtle vignette: top 10% and bottom 10% rows are slightly darker
  const edgeBg = _dimBg(bg, 9) || bg;
  const total = to - from + 1;
  for (let r = from; r <= to; r++) {
    const pos = (r - from) / total;
    const rowBg = (pos < 0.10 || pos > 0.90) ? edgeBg : bg;
    const blank = `${rowBg}${fg}${' '.repeat(Math.max(0, width))}${ansi.reset}`;
    at(r, 1, blank);
  }
}

function atCentered(row, text, width, t) {
  const col = Math.max(1, Math.floor((width - vis(text)) / 2) + 1);
  const bg = t.screenBg || '';
  at(row, col, `${bg}${text.split(ansi.reset).join(`${ansi.reset}${bg}`)}${ansi.reset}`);
}

function withBg(text, bg) {
  return `${bg}${text.split(ansi.reset).join(`${ansi.reset}${bg}`)}${ansi.reset}`;
}

function formatContextSuffix(info = {}) {
  if (!info.ctxSize) return '';
  const used = compactNumber(info.usedTokens || 0);
  const size = compactNumber(info.ctxSize);
  const metadata = info.ctxTrain ? ` meta ${compactNumber(info.ctxTrain)}` : '';
  const pct = info.percent != null ? ` ${info.percent}%` : '';
  return ` · ctx ${used}/${size}${pct}${metadata}`;
}

function compactNumber(n) {
  const value = Number(n) || 0;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

// ── Message formatting ──────────────────────────────────────────────────────
function formatMessage(msg, maxW, t, focused = false, expanded = false) {
  const R = ansi.reset;
  const lines = [];

  if (msg.role === 'user') {
    lines.push('');
    const userLines = wrapText(msg.content, maxW - 2);
    for (const l of userLines) lines.push(`${t.msgUser}▏${R} ${l}`);
  } else if (msg.role === 'assistant') {
    lines.push('');
    const cleaned = cleanResponse(msg.content);
    const aiLines = wrapText(cleaned, maxW);
    if (aiLines.length > 0) {
      // First line: name prefix inline with text
      lines.push(`${t.msgAi}${ansi.bold}asyncat${R}  ${aiLines[0]}`);
      // Continuation lines: indented to align under the text
      for (let i = 1; i < aiLines.length; i++) lines.push(`        ${aiLines[i]}`);
    }
  } else if (msg.role === 'system') {
    lines.push(`${t.msgSystem}${ansi.dim}  ${msg.content}${R}`);
  } else if (msg.role === 'tool') {
    const icon = msg.success === true ? `${t.success}✔${R}`
               : msg.success === false ? `${t.error}✘${R}`
               : `${ansi.dim}…${R}`;
    const gutter = focused ? `${t.accent}▶${R}` : `${ansi.dim} ${R}`;
    const headerBg = focused ? t.accent : ansi.dim;
    lines.push(`${gutter} ${headerBg}╭─ ${R}${t.paletteCmd}${msg.tool || 'tool'}${R} ${icon}${focused ? `  ${ansi.dim}[tab·↵]${R}` : ''}`);
    if (msg.content) {
      const allLines = msg.content.split('\n').filter(l => l.trim());
      const limit = expanded ? allLines.length : (msg.success === false ? 8 : 3);
      for (const l of allLines.slice(0, limit)) lines.push(`${ansi.dim}  │${R}  ${ansi.dim}${l.slice(0, maxW - 6)}${R}`);
      if (!expanded && allLines.length > limit) lines.push(`${ansi.dim}  │  … ${allLines.length - limit} more lines${R}`);
    }
    lines.push(`${ansi.dim}  ╰─${R}`);
  } else if (msg.role === 'thinking') {
    if (msg.content) {
      const firstLine = cleanResponse(msg.content).split('\n').find(l => l.trim()) || '';
      if (firstLine) {
        const truncated = firstLine.length > maxW - 14 ? firstLine.slice(0, maxW - 17) + '…' : firstLine;
        lines.push(`${ansi.dim}${ansi.italic}  Thinking: ${truncated}${R}`);
      }
    }
  } else if (msg.role === 'plan') {
    const plan = Array.isArray(msg.plan) ? msg.plan : [];
    lines.push(`${t.accent}  ╭─ 📋 Plan${R}`);
    if (plan.length === 0) {
      lines.push(`${ansi.dim}  │  (empty)${R}`);
    } else {
      for (const item of plan) {
        const mark = item.status === 'completed'
          ? `${t.success}✔${R}`
          : item.status === 'in_progress'
            ? `${t.accent}◉${R}`
            : `${ansi.dim}○${R}`;
        const label = (item.status === 'in_progress' && item.activeForm) ? item.activeForm : (item.content || '');
        lines.push(`${ansi.dim}  │  ${R}${mark} ${String(label).slice(0, maxW - 8)}`);
      }
    }
    lines.push(`${ansi.dim}  ╰─${R}`);
  }

  return lines;
}

// Strip model thinking markup and raw markdown before display.
// Handles: <think>...</think> blocks, lone </think> tags,
// **Thought:** / **thought:** lines that leak into the final answer,
// and converts **bold** to plain text.
function cleanResponse(text) {
  if (!text) return '';
  let s = text;
  // Remove complete <think>...</think> blocks (model self-reasoning)
  s = s.replace(/<think>[\s\S]*?<\/think>/g, '');
  // Remove partial/unclosed <think> block (still streaming — hide until closed)
  s = s.replace(/<think>[\s\S]*$/, '');
  // Remove any lone closing tags left over
  s = s.replace(/<\/think>/g, '');
  // Remove lines that are just a **Thought:** marker
  s = s.replace(/^\s*\*\*[Tt]hought:\*\*.*$/gm, '');
  // Convert **bold** → plain (avoids asterisk noise)
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  // Collapse runs of 3+ blank lines to two
  s = s.replace(/\n{3,}/g, '\n\n');
  const result = s.trim();
  if (!result) {
    // Model wrapped everything in <think>...</think> with nothing outside — extract inner content.
    const m = text.match(/<think>([\s\S]*?)<\/think>/i);
    if (m) return m[1].replace(/^\s*\*\*[Tt]hought:\*\*.*$/gm, '').replace(/\*\*([^*\n]+)\*\*/g, '$1').trim();
    // Text was only **Thought:** lines — strip the marker prefix and return bare content.
    const bare = text.replace(/^\s*\*\*[Tt]hought:\*\*\s*/gm, '').replace(/\*\*([^*\n]+)\*\*/g, '$1').trim();
    return bare;
  }
  return result;
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
  { cmd: '/ctx',      desc: 'Restart local model with context size', group: '🤖 AI' },
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
  { cmd: '/log',      desc: 'Tool call log — full output & errors', group: '🛠 Services' },
  { cmd: '/logs',     desc: 'View service logs',                group: '🛠 Services' },
  { cmd: '/doctor',   desc: 'System health check',               group: '🛠 Services' },
  { cmd: '/full-control', desc: 'Toggle permission auto-approval', group: '⚙️ Settings' },
  { cmd: '/theme',    desc: 'Switch color theme',                group: '⚙️ Settings' },
  { cmd: '/config',   desc: 'Get or set configuration',         group: '⚙️ Settings' },
  { cmd: '/install',  desc: 'Install dependencies',             group: '⚙️ Settings' },
  { cmd: '/new',      desc: 'Start new session',               group: '🧹 Tools' },
  { cmd: '/stash',    desc: 'Save or view notes',             group: '🧹 Tools' },
  { cmd: '/live-logs',desc: 'Toggle streaming logs',          group: '🧹 Tools' },
  { cmd: '/clear',    desc: 'Clear screen',                   group: '❓ Help' },
  { cmd: '/help',     desc: 'Full command & shortcut reference', group: '❓ Help' },
  { cmd: '/exit',     desc: 'Exit asyncat',                 group: '❓ Help' },
];

export function filterPalette(query) {
  if (!query || query === '/') return PALETTE_CMDS;
  const q = query.toLowerCase().replace(/^\//, '');
  return PALETTE_CMDS.filter(c =>
    c.cmd.slice(1).includes(q) || c.desc.toLowerCase().includes(q)
  );
}

export function renderPalette(items, selIdx, inputBuf, cursorPos, inChatMode = false) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;
  const liveLogs = getLiveLogsEnabled();
  const mainW = liveLogs ? Math.floor(W * 0.65) : W;

  // Subtle panel bg — just dark enough to distinguish from terminal default
  const panelBg = t.panelBg || ansi.bgRgb(20, 20, 26);
  // Use the theme's selection color so highlight matches the accent/palette
  const selBg = t.paletteSel;

  // Anchor palette just above the input, matching zen vs chat input position
  let inputRow, inputL, inputW;
  if (inChatMode) {
    const inputAreaH = 4 + 2; // separator + borderless prompt (inputs + meta)
    inputRow = H - inputAreaH + 1; // first input text row inside prompt panel
    inputW = clamp(Math.floor(mainW * 0.62), Math.min(52, mainW - 4), Math.min(96, mainW - 4));
    inputL = Math.floor((mainW - inputW) / 2);
  } else {
    const layout = getZenLayout(mainW, H);
    const logoH = layout.bigBrand ? ASYNCAT_WORDMARK.length : 4;
    inputRow = layout.startY + logoH + 2; // message + gap, then first text row inside panel
    inputW = layout.inputW;
    inputL = layout.inputL;
  }
  const innerW = inputW - 4;

  // Panel matches the input area width and left edge exactly
  const panelW = inputW;
  const panelL = inputL;

  // Show at most 10 items so the panel stays compact and close to the input
  const maxShow = Math.max(0, Math.min(items.length, Math.min(10, inputRow - 4)));
  let scrollOff = 0;
  if (maxShow > 0 && selIdx >= maxShow) scrollOff = selIdx - maxShow + 1;
  const visible = items.slice(scrollOff, scrollOff + maxShow);
  const colW = items.length > 0 ? Math.max(...items.map(c => c.cmd.length)) + 2 : 10;

  // panelH: title + separator + items + padding, placed just above input
  const panelH = maxShow + 3;
  const panelTop = Math.max(2, inputRow - panelH - 1);

  // Paint borderless panel background
  for (let r = panelTop; r <= panelTop + panelH; r++) {
    at(r, panelL, `${panelBg}${' '.repeat(panelW)}${R}`);
  }

  // Title row — accent pip + label, dim esc hint, no box chars
  const escPad = Math.max(0, panelW - 12);
  at(panelTop, panelL, `${panelBg}${t.accent}${ansi.bold} Commands${R}${panelBg}${' '.repeat(escPad)}${ansi.dim}esc ${R}`);

  // Thin separator under title
  at(panelTop + 1, panelL, `${panelBg}${t.dimBorder}${' '}${'─'.repeat(panelW - 1)}${R}`);

  const itemOffset = 2; // title + separator
  if (items.length === 0) {
    const emptyText = 'No matching commands';
    const emptyPad = Math.max(0, panelW - vis(emptyText) - 2);
    at(panelTop + itemOffset, panelL, `${panelBg}  ${ansi.dim}${emptyText}${R}${panelBg}${' '.repeat(emptyPad)}${R}`);
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
      at(panelTop + itemOffset + i, panelL, `${bg}  ${cmdStyle}${padded}${R}${bg}${ansi.dim}${desc}${' '.repeat(pad)}${R}`);
    }
    if (items.length > scrollOff + maxShow) {
      const moreText = `↓ ${items.length - scrollOff - maxShow} more`;
      at(panelTop + itemOffset + maxShow, panelL, `${panelBg}  ${ansi.dim}${moreText}${R}${panelBg}${' '.repeat(Math.max(0, panelW - vis(moreText) - 2))}${R}`);
    }
  }

  // Cursor at input row (below the palette, where the user is typing)
  const buf = inputBuf || '';
  const { col: cc, line: cl } = calcCursorPosInWrapped(buf, cursorPos, innerW);
  write(ansi.to(inputRow + cl, inputL + 3 + cc));
}

// ── Selector — floating panel overlay with search ───────────────────────────
export function renderSelector(title, items, selIdx, inputBuf, cursorPos) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  const panelBg = t.panelBg || ansi.bgRgb(18, 18, 24);
  const panelW = Math.min(Math.floor(W * 0.78), 96);
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

  at(panelTop + 3 + maxShow, panelL, `${panelBg}${ansi.dim}  ↑↓ navigate  ·  enter/click select  ·  esc cancel${R}`);

  // Cursor in search input
  write(ansi.to(panelTop + 1, panelL + cursorPos));
}

export function renderAskInput(question, inputBuf, cursorPos, defaultAnswer = '') {
  const W = w();
  const H = h();
  const R = ansi.reset;
  const t = getTheme();
  const panelBg = t.panelBg || ansi.bgRgb(18, 18, 24);
  const panelW = Math.min(Math.floor(W * 0.78), 96);
  const panelL = Math.floor((W - panelW) / 2) + 1;
  const wrappedQuestion = wrapText(question || 'The agent needs more information.', panelW - 4).slice(0, 6);
  const panelH = wrappedQuestion.length + (defaultAnswer ? 6 : 5);
  const panelTop = Math.max(2, Math.floor((H - panelH) / 2));

  for (let r = panelTop; r <= panelTop + panelH; r++) {
    at(r, panelL - 1, `${panelBg}${' '.repeat(panelW + 2)}${R}`);
  }

  at(panelTop, panelL, `${panelBg}${ansi.bold}Agent Question${R}${panelBg}${' '.repeat(Math.max(0, panelW - 20))}${ansi.dim}esc${R}`);
  wrappedQuestion.forEach((line, i) => {
    at(panelTop + 2 + i, panelL, `${panelBg}  ${line}${' '.repeat(Math.max(0, panelW - vis(line) - 2))}${R}`);
  });

  let y = panelTop + 2 + wrappedQuestion.length;
  if (defaultAnswer) {
    const d = `Default: ${defaultAnswer}`;
    at(y++, panelL, `${panelBg}  ${ansi.dim}${d.slice(0, panelW - 4)}${R}${panelBg}${' '.repeat(Math.max(0, panelW - vis(d) - 2))}${R}`);
  }

  const prompt = inputBuf || '';
  const shown = prompt || 'Type answer...';
  at(y + 1, panelL, `${panelBg}${ansi.dim}▸ ${R}${panelBg}${prompt ? shown : `${ansi.dim}${shown}${R}${panelBg}`}${' '.repeat(Math.max(0, panelW - vis(shown) - 3))}${R}`);
  at(y + 3, panelL, `${panelBg}${ansi.dim}  enter submit  ·  esc use default/cancel${R}`);
  write(ansi.to(y + 1, panelL + 2 + cursorPos));
}

// ── Model Setup Wizard ────────────────────────────────────────────────────────
export function renderModelSetup(model, ctxBuf, cursorPos, isFocused) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  clearThemedRows(t, 1, H - 1, W);

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
  const metadataCtx = model.contextLength
    ? `metadata ${Number(model.contextLength).toLocaleString()} tokens`
    : 'metadata unknown';

  const bg = isFocused ? t.paletteSel : '';
  at(y, boxL, `${bg}${label}${isFocused ? t.inputFg : ''}${ctxStr}${R}${bg}${' '.repeat(bufPad)}${R}`);

  const cursorRow = y;
  const cursorCol = boxL + vis(label) + cursorPos;
  y++;
  at(y++, boxL, ` ${ansi.dim}${metadataCtx}; requested context may be higher and uses more RAM/VRAM${R}`);
  y++;

  at(y++, boxL, center(`${ansi.dim}enter start model  ·  esc cancel${R}`, boxW));

  if (isFocused) {
    write(ansi.to(cursorRow, cursorCol));
  }
}

// ── Status bar ──────────────────────────────────────────────────────────────
let _statusCache = { backend: false, frontend: false, starting: false, ts: 0 };

export function setServiceStatus(backend, frontend, starting = false) {
  _statusCache = { backend, frontend, starting, ts: Date.now() };
}

export function renderStatusBar(version, streamingMsg, modelInfo, fullControl = false, usage = null) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  at(H, 1, `${t.statusBg || t.screenBg || ''}${t.statusFg || ''}${' '.repeat(Math.max(0, W))}${R}`);

  // ── Streaming mode: OpenCode-style animated bottom bar ────────────────
  if (streamingMsg) {
    const spin = spinnerFrame();
    const modelStr = modelInfo ? `${t.accent2}${modelInfo}${R}  ` : '';
    const usageStr = usage ? `${ansi.dim}${formatUsage(usage)}${R}  ` : '';
    const right = `${ansi.dim}esc stop${R}  ${usageStr}${modelStr}${ansi.dim}${version || ''}${R} `;
    const left = ` ${t.accent}${spin}${R}`;
    const leftVis = vis(` ${spin}`);
    const rightVis = vis(`esc stop  ${usage ? formatUsage(usage) + '  ' : ''}${modelInfo ? modelInfo + '  ' : ''}${version || ''} `);
    const gap = Math.max(1, W - leftVis - rightVis);
    at(H, 1, withBg(`${t.statusFg}${left}${' '.repeat(gap)}${right}`, t.statusBg || t.screenBg || ''));
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
    : _statusCache.starting ? `${t.warning}◐${R}${ansi.dim} api${R}` : `${ansi.dim}○ api${R}`;
  const fe = _statusCache.frontend
    ? `${t.success}●${R}${ansi.dim} web :8717${R}`
    : _statusCache.starting ? `${t.warning}◐${R}${ansi.dim} web${R}` : `${ansi.dim}○ web${R}`;

  const fcIndicator = fullControl ? `${t.error}⚡ full-control${R}  ` : '';
  const left = ` ${loc}`;
  const mid = `${fcIndicator}${be}  ${fe}`;
  const right = `${usage ? `${formatUsage(usage)}  ` : ''}${version || 'unknown'} `;

  const leftVis = vis(left);
  const midVis = vis(mid);
  const rightVis = vis(right);
  const gap1 = Math.max(1, Math.floor((W - leftVis - midVis - rightVis) / 2));
  const gap2 = Math.max(1, W - leftVis - gap1 - midVis - rightVis);

  at(H, 1, withBg(`${t.statusFg}${left}${' '.repeat(gap1)}${mid}${' '.repeat(gap2)}${right}`, t.statusBg || t.screenBg || ''));
}

function formatUsage(usage) {
  const total = Number(usage.totalTokens || 0).toLocaleString();
  return usage.costUsd ? `${total} tok ~$${usage.costUsd.toFixed(4)}` : `${total} tok`;
}

// ── Result popup — scrollable command output overlay ───────────────────────
export function renderResult(title, lines, scrollOff = 0) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  const panelBg = t.panelBg || ansi.bgRgb(20, 22, 30);
  const panelW  = Math.min(Math.floor(W * 0.72), 90);
  const panelL  = Math.floor((W - panelW) / 2) + 1;
  const contentH = Math.min(lines.length, H - 10);
  const panelH   = contentH + 3;
  const panelTop = Math.max(2, Math.floor((H - panelH) / 2));

  for (let r = panelTop; r <= panelTop + panelH; r++) {
    at(r, panelL - 1, `${panelBg}${' '.repeat(panelW + 2)}${R}`);
  }

  const maxScroll = Math.max(0, lines.length - contentH);
  const pct = maxScroll > 0 ? ` ${Math.round((scrollOff / maxScroll) * 100)}%` : '';
  const titleRight = `${ansi.dim}${pct}  esc${R}`;
  const escPad = Math.max(0, panelW - vis(title) - vis(pct) - 5);
  at(panelTop, panelL, `${panelBg}${ansi.bold}${title}${R}${panelBg}${' '.repeat(escPad)}${titleRight}`);

  // Scrollbar gutter (right edge)
  if (maxScroll > 0) {
    const barH = Math.max(1, Math.round((contentH / lines.length) * contentH));
    const barTop = Math.round((scrollOff / maxScroll) * (contentH - barH));
    for (let i = 0; i < contentH; i++) {
      const barChar = (i >= barTop && i < barTop + barH) ? `${t.accent}▐${R}` : `${ansi.dim}│${R}`;
      at(panelTop + 2 + i, panelL + panelW, `${panelBg}${barChar}`);
    }
  }

  const visLines = lines.slice(scrollOff, scrollOff + contentH);
  for (let i = 0; i < contentH; i++) {
    const line = i < visLines.length ? visLines[i] : '';
    const pad = Math.max(0, panelW - vis(line) - 2);
    at(panelTop + 2 + i, panelL, `${panelBg}  ${line}${' '.repeat(pad)}${R}`);
  }

  const hint = maxScroll > 0
    ? `  ↑↓ / PgUp·PgDn scroll  ·  Home/End  ·  esc close`
    : `  esc close`;
  at(panelTop + 2 + contentH, panelL, `${panelBg}${ansi.dim}${hint}${R}`);
}

// ── Models Page — 3-tab floating panel (Downloaded / Recommended / Search) ───
export function renderModelsPage(tab, searchBuf, items, selectedIdx, activeDownloads, loading) {
  const t = getTheme();
  const W = w();
  const H = h();
  const R = ansi.reset;

  clearThemedRows(t, 1, H - 1, W);

  const TAB_NAMES = ['Downloaded', 'Recommended', 'Search'];
  const panelBg = t.panelBg || ansi.bgRgb(18, 18, 24);
  const panelW = Math.min(Math.floor(W * 0.72), 88);
  const panelL = Math.floor((W - panelW) / 2) + 1;

  const extraRows = tab === 2 ? 1 : 0;
  const maxShow = Math.min(items.length, H - 14 - extraRows);
  const panelH = maxShow + 8 + extraRows;
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

  // Search input row — only for Search tab; shows typed query with a visible cursor
  if (tab === 2) {
    const sq = searchBuf || '';
    const displayText = sq || 'Type to search HuggingFace GGUF models...';
    const sqPad = Math.max(0, panelW - 2 - vis(displayText));
    const sqStyle = sq ? t.inputFg : ansi.dim;
    // Do NOT reset after │ — that kills panelBg and leaves a black gap before the text
    at(panelTop + 2, panelL, `${panelBg}${t.accent}│ ${sqStyle}${displayText}${R}${panelBg}${' '.repeat(sqPad)}${R}`);
  }

  // Item list
  const itemStartRow = panelTop + 3 + extraRows;
  if (items.length === 0) {
    if (loading) {
      at(itemStartRow, panelL, `${panelBg}  ${ansi.dim}Loading...${R}`);
    } else {
      const emptyMsg = tab === 0
        ? 'No models downloaded yet.'
        : tab === 1
          ? 'Select a recommended model below to download.'
          : searchBuf ? 'No results found. Try a different search.' : '';
      if (emptyMsg) at(itemStartRow, panelL, `${panelBg}  ${ansi.dim}${emptyMsg}${R}`);
    }
  } else {
    const scrollOff = selectedIdx >= maxShow ? selectedIdx - maxShow + 1 : 0;
    const visible = items.slice(scrollOff, scrollOff + maxShow);

    for (let i = 0; i < visible.length; i++) {
      const item = visible[i];
      const realIdx = i + scrollOff;
      const sel = realIdx === selectedIdx;
      const row = itemStartRow + i;
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
  const dlTop = panelTop + 3 + extraRows + maxShow;

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

  // Cursor at search input row (not the tabs row)
  if (tab === 2) {
    write(ansi.to(panelTop + 2, panelL + 2 + vis(searchBuf || '')));
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

  clearThemedRows(t, 1, H, W);

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
