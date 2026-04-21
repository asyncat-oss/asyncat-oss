// Asyncat v2 — Main TUI Controller
import { EventEmitter } from 'events';
import readline from 'readline';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { ansi, strip, vis, w, h, write, at, clearRow } from './ansi.js';
import {
  renderZen, renderChat, renderPalette, renderStatusBar,
  renderStreamingIndicator, renderSelector, filterPalette,
  spinnerFrame, nextCatMsg, setServiceStatus, renderModelSetup,
  renderResult,
} from './views.js';
import { getTheme } from '../theme.js';
import { getLiveLogsEnabled } from '../colors.js';

const HISTORY_FILE = path.join(os.homedir(), '.asyncat_history');
const MAX_HISTORY  = 200;

export class Tui extends EventEmitter {
  constructor(opts = {}) {
    super();
    // Modes: zen | chat | palette | selector
    this.mode        = 'zen';
    this.messages    = [];
    this.logs        = [];
    this.scrollOff   = 0;
    this.buf         = '';
    this.pos         = 0;
    this.conversationId = null;
    this.history     = this._loadHistory();
    this.histIdx     = -1;
    this.histSaved   = '';
    this.paletteIdx  = 0;
    this.paletteItems = [];
    this.modelInfo    = opts.modelInfo || '';
    this.providerInfo = opts.providerInfo || '';
    this.version      = opts.version || '0.3.2';
    this.streaming    = false;
    this._streamTimer = null;
    this._streamMsg   = '';
    this._keyHandler  = null;
    this._resizeHandler = null;
    this._started     = false;
    this._destroyed   = false;
    this._inputLocked = false;
    this._catMsg      = null;
    this._origLog     = null;
    this._inputStream = new PassThrough();

    // Selector state (for model/theme pickers)
    this._selTitle    = '';
    this._selItems    = [];
    this._selIdx      = 0;
    this._selResolve  = null;

    // Model setup state
    this._setupModel  = null;
    this._setupResolve = null;

    // Result popup state
    this._resultTitle  = '';
    this._resultLines  = [];
    this._resultScroll = 0;

    // Console capture (for inline command output)
    this._captureMode   = false;
    this._captureBuffer = [];
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  start() {
    if (this._started) return;
    this._started = true;
    this._destroyed = false;

    write(ansi.altScreen);
    write(ansi.hide);
    write(ansi.clear + ansi.home);

    // Intercept console.log — routes to capture buffer or sidebar
    if (!this._origLog) {
      this._origLog = console.log;
      console.log = (...args) => {
        const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
        text.split('\n').forEach(line => {
          if (this._captureMode) {
            this._captureBuffer.push(line);
          } else {
            this.logs.push(line);
            if (this.logs.length > 500) this.logs.shift();
          }
        });
        if (!this._captureMode && getLiveLogsEnabled()) this.render();
      };
    }

    // Enable mouse tracking
    write('\x1b[?1000h'); // button events
    write('\x1b[?1006h'); // SGR extended mode

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }

    // Only set up keypress once on our filtered stream
    if (!this._keypressSetup) {
      readline.emitKeypressEvents(this._inputStream);
      this._keypressSetup = true;
    }

    this._keyHandler = (str, key) => this._onKey(str, key);
    this._inputStream.on('keypress', this._keyHandler);

    // Mouse click handling (raw data intercept)
    this._mouseEnabled = true;
    this._mouseHandler = (data) => {
      const s = data.toString();
      // Parse mouse SGR sequences: \x1b[<btn;col;rowM or \x1b[<btn;col;rowm
      const mouseRegex = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
      let match;
      while ((match = mouseRegex.exec(s)) !== null) {
        const btn = parseInt(match[1]);
        const col = parseInt(match[2]);
        const row = parseInt(match[3]);
        const press = match[4] === 'M';
        if (press && btn === 0)   this._onMouseClick(col, row);
        if (press && btn === 64)  this._onMouseScroll(-3);   // wheel up
        if (press && btn === 65)  this._onMouseScroll(+3);   // wheel down
      }
      
      // Filter out all mouse SGR sequences before passing to readline
      const clean = s.replace(/\x1b\[<[0-9;]+[mM]/g, '');
      if (clean) {
        this._inputStream.write(Buffer.from(clean));
      }
    };
    process.stdin.on('data', this._mouseHandler);
    this._resizeHandler = () => this.render();
    process.stdout.on('resize', this._resizeHandler);

    // Start service status polling — poll rapidly after startup to catch services coming up
    this._pollStatus();
    setTimeout(() => this._pollStatus(), 1000);
    setTimeout(() => this._pollStatus(), 3000);
    setTimeout(() => this._pollStatus(), 6000);
    setTimeout(() => this._pollStatus(), 10000);
    setTimeout(() => this._pollStatus(), 16000);
    this._statusTimer = setInterval(() => this._pollStatus(), 4000);

    this.render();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._started = false;
    if (this._streamTimer) clearInterval(this._streamTimer);
    if (this._statusTimer) clearInterval(this._statusTimer);
    if (this._keyHandler) {
      this._inputStream.removeListener('keypress', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._mouseHandler) {
      process.stdin.removeListener('data', this._mouseHandler);
      this._mouseHandler = null;
    }
    if (this._resizeHandler) {
      process.stdout.removeListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    // Disable mouse tracking
    write('\x1b[?1000l');
    write('\x1b[?1006l');
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    write(ansi.show);
    write(ansi.mainScreen);
    if (this._origLog) {
      console.log = this._origLog;
      this._origLog = null;
    }

    this._saveHistory();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  render() {
    if (this._destroyed) return;
    write(ansi.hide);
    renderStatusBar(this.version);

    const isOverlay = this.mode === 'palette' || this.mode === 'selector' || this.mode === 'model-setup' || this.mode === 'result';

    // Always render base screen first so overlays float on top of it
    // Pass actual buf so the typed text shows through (like OpenCode's zen input behind palette)
    if (this.mode === 'chat' || (isOverlay && this.messages.length > 0)) {
      const msgs = this._streamContent ? [...this.messages, { role: 'assistant', content: this._streamContent }] : this.messages;
      renderChat(msgs, this.scrollOff, this.mode === 'model-setup' ? '' : this.buf, this.mode === 'model-setup' ? 0 : this.pos, this.modelInfo, this.providerInfo, this.logs);
    } else {
      renderZen(this.buf, this.pos, this.modelInfo, this.providerInfo, this._catMsg, this.logs);
    }

    // Result popup doesn't need a background redraw (it's standalone)
    if (this.mode === 'result') {
      renderResult(this._resultTitle, this._resultLines, this._resultScroll);
      write(ansi.show);
      return;
    }

    // Then render overlays on top
    if (this.mode === 'palette') {
      this.paletteItems = filterPalette(this.buf);
      if (this.paletteIdx >= this.paletteItems.length) {
        this.paletteIdx = Math.max(0, this.paletteItems.length - 1);
      }
      renderPalette(this.paletteItems, this.paletteIdx, this.buf, this.pos);
    } else if (this.mode === 'selector') {
      renderSelector(this._selTitle, this._selItems, this._selIdx, this.buf, this.pos);
    } else if (this.mode === 'model-setup') {
      renderModelSetup(this._setupModel, this.buf, this.pos, true);
    }

    write(ansi.show);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  addMessage(role, content, extra = {}) {
    this.messages.push({ role, content, ...extra });
    this.scrollOff = 0;
    if (this.mode !== 'chat') this.mode = 'chat';
    this.render();
  }

  updateLastMessage(content) {
    if (this.messages.length > 0) {
      this.messages[this.messages.length - 1].content = content;
      this.render();
    }
  }

  clearMessages() {
    this.messages = [];
    this.conversationId = null;
    this.mode = 'zen';
    this._catMsg = nextCatMsg();
    this.render();
  }

  setModel(name, provider) {
    this.modelInfo = name || '';
    this.providerInfo = provider || '';
    this.render();
  }

  print(text)     { this.addMessage('system', text); }
  printOk(text)   { this.print(`✔  ${text}`); }
  printWarn(text)  { this.print(`⚠  ${text}`); }
  printErr(text)   { this.print(`✖  ${text}`); }
  printInfo(text)  { this.print(`→  ${text}`); }

  // ── Selector (floating panel picker for models/themes) ───────────────────
  showSelector(title, items) {
    return new Promise((resolve) => {
      this.mode = 'selector';
      this._selTitle = title;
      this._selItems = items;
      this._selIdx = 0;
      this._selResolve = resolve;
      this.buf = ''; this.pos = 0; // buf used as search input
      this.render();
    });
  }

  // ── Model Setup Wizard ────────────────────────────────────────────────────
  showModelSetup(model) {
    return new Promise((resolve) => {
      this.mode = 'model-setup';
      this._setupModel = model;
      this._setupResolve = resolve;
      this.buf = String(model.contextLength || 8192);
      this.pos = this.buf.length;
      this.render();
    });
  }

  // ── Result popup ──────────────────────────────────────────────────────────
  showResult(title, lines) {
    this._resultTitle  = title;
    this._resultLines  = lines.map(l => (typeof l === 'string' ? l : String(l)));
    this._resultScroll = 0;
    this.mode = 'result';
    this.render();
  }

  startCapture() {
    this._captureMode   = true;
    this._captureBuffer = [];
  }

  endCapture() {
    this._captureMode = false;
    const lines = this._captureBuffer.slice();
    this._captureBuffer = [];
    return lines;
  }

  // ── Streaming ─────────────────────────────────────────────────────────────
  setStreamMsg(msg) {
    this._streamMsg = msg;
    this.render();
  }

  appendStreamContent(delta) {
    this._streamContent = (this._streamContent || '') + delta;
    this.render();
  }

  clearStreamContent() {
    this._streamContent = '';
    this.render();
  }

  startStreaming(msg = 'Thinking...') {
    this.streaming = true;
    this._streamMsg = msg;
    if (this.mode !== 'chat') this.mode = 'chat';
    this._streamTimer = setInterval(() => {
      if (this._destroyed) return;
      const contentH = h() - 7;
      renderStreamingIndicator(contentH, this._streamMsg);
    }, 80);
  }

  stopStreaming() {
    this.streaming = false;
    if (this._streamTimer) { clearInterval(this._streamTimer); this._streamTimer = null; }
    this.render();
  }

  setStreamMsg(msg) { this._streamMsg = msg; }
  lockInput() { this._inputLocked = true; }
  unlockInput() { this._inputLocked = false; this.render(); }

  // ── Key handler ───────────────────────────────────────────────────────────
  _onKey(str, key) {
    if (this._destroyed || !key) return;
    if (this._inputLocked && !(key.ctrl && key.name === 'c')) return;
    const { name, ctrl, meta } = key;

    // ── Global shortcuts (always active) ─────────────────────────────────
    if (ctrl && name === 'c') { this.emit('exit'); return; }
    if (ctrl && name === 'l') { write(ansi.clear); this.render(); return; }

    // Ctrl+M — toggle mouse tracking (off lets native terminal selection work)
    if (ctrl && name === 'm') {
      this._mouseEnabled = !this._mouseEnabled;
      if (this._mouseEnabled) {
        write('\x1b[?1000h'); write('\x1b[?1006h');
        this.print('🖱  Mouse on  — wheel scrolls, click status bar for palette');
      } else {
        write('\x1b[?1000l'); write('\x1b[?1006l');
        this.print('✂  Mouse off — drag to select & copy now works. Ctrl+M to re-enable.');
      }
      return;
    }

    // Ctrl+Y — yank (copy) last assistant message to clipboard
    if (ctrl && name === 'y') {
      const lastAi = [...this.messages].reverse().find(m => m.role === 'assistant');
      if (!lastAi) { this.print('  Nothing to copy yet.'); return; }
      const text = typeof lastAi.content === 'string' ? lastAi.content : JSON.stringify(lastAi.content);
      try {
        let proc;
        const platform = os.platform();
        if (platform === 'linux') proc = spawn('sh', ['-c', 'xclip -selection clipboard 2>/dev/null || xsel --clipboard --input 2>/dev/null || wl-copy 2>/dev/null']);
        else if (platform === 'darwin') proc = spawn('pbcopy');
        if (proc) { proc.stdin.write(text); proc.stdin.end(); }
      } catch {}
      this.print(`✔  Copied ${text.length} chars to clipboard  (Ctrl+M then drag to select manually)`);
      return;
    }

    // ── Result popup mode ────────────────────────────────────────────────
  if (this.mode === 'result') {
    if (name === 'escape' || str === 'q') {
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      this.render();
    } else if (name === 'up') {
      this._resultScroll = Math.max(0, this._resultScroll - 1);
      this.render();
    } else if (name === 'down') {
      this._resultScroll = Math.min(Math.max(0, this._resultLines.length - 1), this._resultScroll + 1);
      this.render();
    } else if (name === 'pageup') {
      this._resultScroll = Math.max(0, this._resultScroll - 10);
      this.render();
    } else if (name === 'pagedown') {
      this._resultScroll = Math.min(Math.max(0, this._resultLines.length - 1), this._resultScroll + 10);
      this.render();
    }
    return;
  }

    // ── Selector mode ────────────────────────────────────────────────────
  if (this.mode === 'selector') {
    this._onKeySelector(name, ctrl, str, key);
    return;
  }

  // ── Model Setup mode ─────────────────────────────────────────────────
  if (this.mode === 'model-setup') {
    if (name === 'escape') {
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._setupResolve) { this._setupResolve(null); this._setupResolve = null; }
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (name === 'return') {
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      const ctxSize = this.buf.trim() || '8192';
      if (this._setupResolve) { this._setupResolve(ctxSize); this._setupResolve = null; }
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (str && !/^[0-9]$/.test(str) && name !== 'backspace' && name !== 'delete' && name !== 'left' && name !== 'right') {
      return;
    }
  }

  // ── ESC ──────────────────────────────────────────────────────────────
  if (name === 'escape') {
    if (this.mode === 'palette') {
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      this.buf = ''; this.pos = 0;
      this.render(); return;
    }
    if (this.buf) { this.buf = ''; this.pos = 0; this.render(); return; }
    if (this.mode === 'chat') {
      this.mode = 'zen';
      this._catMsg = nextCatMsg();
      this.render(); return;
    }
    this.emit('exit'); return;
  }

  // ── Enter ────────────────────────────────────────────────────────────
  if (name === 'return') {
    if (this.mode === 'palette' && this.paletteItems.length > 0) {
      const chosen = this.paletteItems[this.paletteIdx];
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      this.buf = ''; this.pos = 0; this.paletteIdx = 0;
      this.render();
      this.emit('command', chosen.cmd.slice(1));
      return;
    }

    if (str === '\n' && !ctrl) {
      this.buf = this.buf.slice(0, this.pos) + '\n' + this.buf.slice(this.pos);
      this.pos++;
      this.render();
      return;
    }

    const line = this.buf.trim();
    if (!line) {
      this._catMsg = nextCatMsg();
      this.render();
      return;
    }

    this.history.unshift(this.buf);
    if (this.history.length > MAX_HISTORY) this.history.pop();
    this.histIdx = -1;
    this.buf = ''; this.pos = 0;

    if (line.startsWith('/')) {
      const parts = line.slice(1).split(/\s+/);
      this.render();
      this.emit('command', parts[0], parts.slice(1));
      return;
    }

    this.mode = 'chat';
    this.render();
    this.emit('input', line);
    return;
  }

  // ── Tab ──────────────────────────────────────────────────────────────
  if (name === 'tab') {
    if (this.mode === 'palette' && this.paletteItems.length > 0) {
      const chosen = this.paletteItems[this.paletteIdx];
      this.buf = chosen.cmd + ' ';
      this.pos = this.buf.length;
      this.render(); return;
    }
    return;
  }

  // ── PageUp/PageDown — scroll messages ─────────────────────────────
  if (name === 'pageup') {
    const half = Math.max(3, Math.floor(h() / 2));
    this.scrollOff += half;
    if (this.mode !== 'chat') this.mode = 'chat';
    this.render(); return;
  }
  if (name === 'pagedown') {
    const half = Math.max(3, Math.floor(h() / 2));
    this.scrollOff = Math.max(0, this.scrollOff - half);
    this.render(); return;
  }

  // ── Arrows ───────────────────────────────────────────────────────────
  if (name === 'up') {
    if (this.mode === 'palette') {
      this.paletteIdx = Math.max(0, this.paletteIdx - 1);
      this.render(); return;
    }
    if (ctrl) { this._onUp(); return; }
    if (this.histIdx === -1) this.histSaved = this.buf;
    if (this.histIdx < this.history.length - 1) {
      this.histIdx++;
      this.buf = this.history[this.histIdx];
      this.pos = this.buf.length;
      this.render();
    }
    return;
  }

  if (name === 'down') {
    if (this.mode === 'palette') {
      this.paletteIdx = Math.min(this.paletteItems.length - 1, this.paletteIdx + 1);
      this.render(); return;
    }
    if (ctrl) { this._onDown(); return; }
    if (this.histIdx > 0) {
      this.histIdx--;
      this.buf = this.history[this.histIdx];
      this.pos = this.buf.length;
    } else if (this.histIdx === 0) {
      this.histIdx = -1;
      this.buf = this.histSaved;
      this.pos = this.buf.length;
    }
    this.render();
    return;
  }

  if (name === 'left') {
    if (ctrl) { this.pos = 0; this.render(); return; }
    this._onLeft(); return;
  }
  if (name === 'right') {
    if (ctrl) { this.pos = this.buf.length; this.render(); return; }
    this._onRight(); return;
  }

  // ── Home/End ─────────────────────────────────────────────────────────
  if (name === 'home' || (ctrl && name === 'a')) { this._onHome(); return; }
  if (name === 'end' || (ctrl && name === 'e')) { this._onEnd(); return; }

    // ── Backspace / Delete ───────────────────────────────────────────────
  if (name === 'backspace') {
    if (this.pos > 0) {
      if (this.buf[this.pos - 1] === '\n') {
        const { line } = this._posToVis(this.pos);
        const prevLineEnd = this._visToPos(line, vis(this.buf.split('\n')[line - 1] || ''));
        this.buf = this.buf.slice(0, this.pos - 1) + this.buf.slice(this.pos);
        this.pos = prevLineEnd;
      } else {
        this.buf = this.buf.slice(0, this.pos - 1) + this.buf.slice(this.pos);
        this.pos--;
      }
    }
    if (this.mode === 'palette' && (!this.buf || !this.buf.startsWith('/'))) {
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      this.paletteIdx = 0;
    }
    this.render(); return;
  }
  if (name === 'delete') {
    if (this.pos < this.buf.length) {
      if (this.buf[this.pos] === '\n') {
        this.buf = this.buf.slice(0, this.pos) + this.buf.slice(this.pos + 1);
      } else {
        this.buf = this.buf.slice(0, this.pos) + this.buf.slice(this.pos + 1);
      }
    }
    this.render(); return;
  }

  // ── Ctrl shortcuts ───────────────────────────────────────────────────
  if (ctrl && name === 'u') { this.buf = this.buf.slice(this.pos); this.pos = 0; this.render(); return; }
  if (ctrl && name === 'k') { this.buf = this.buf.slice(0, this.pos); this.render(); return; }
  if (ctrl && name === 'w') {
    let p = this.pos;
    while (p > 0 && this.buf[p-1] === ' ') p--;
    while (p > 0 && this.buf[p-1] !== ' ') p--;
    this.buf = this.buf.slice(0, p) + this.buf.slice(this.pos);
    this.pos = p;
    this.render(); return;
  }
  if (ctrl && name === 'p') {
    this.mode = 'palette';
    this.buf = '/'; this.pos = 1; this.paletteIdx = 0;
    this.render(); return;
  }

  // ── Printable character ──────────────────────────────────────────────
  if (str && str.length === 1 && !ctrl && !meta) {
    this.buf = this.buf.slice(0, this.pos) + str + this.buf.slice(this.pos);
    this.pos++;

    if (this.buf === '/' && this.mode !== 'palette') {
      this.mode = 'palette';
      this.paletteIdx = 0;
    }

    this.render();
  }
  } // end _onKey

  // ── Multi-line helpers ─────────────────────────────────────────────────
  _innerWidth() {
    const W = w();
    const liveLogs = getLiveLogsEnabled();
    const mainW = liveLogs ? Math.floor(W * 0.65) : W;
    // Must match the innerW used by each view's wrapInputLine call
    if (this.mode === 'chat') return Math.floor(mainW * 0.8) - 2;
    return Math.floor(mainW * 0.5) - 2; // zen / palette
  }

  _posToVis(pos) {
    const iw = this._innerWidth();
    const before = this.buf.slice(0, pos);
    const beforeVis = vis(before);
    const col = beforeVis % iw;
    const line = Math.floor(beforeVis / iw);
    return { col, line };
  }

  _visToPos(row, col) {
    const iw = this._innerWidth();
    const lines = this.buf.split('\n');
    let pos = 0;
    for (let l = 0; l < row && l < lines.length; l++) {
      pos += lines[l].length + 1;
    }
    if (row < lines.length) {
      pos += Math.min(col, vis(lines[row]));
    }
    return pos;
  }

  _onLeft() {
    if (this.pos > 0) {
      if (this.buf[this.pos - 1] === '\n') {
        const { col, line } = this._posToVis(this.pos);
        if (line > 0) {
          const newRow = line - 1;
          const lines = this.buf.split('\n');
          const prevLineLen = vis(lines[newRow] || '');
          const newCol = Math.min(col, prevLineLen);
          this.pos = this._visToPos(newRow, newCol);
        } else {
          this.pos--;
        }
      } else {
        this.pos--;
      }
    }
    this.render();
  }

  _onRight() {
    if (this.pos < this.buf.length) {
      if (this.buf[this.pos] === '\n') {
        const { line } = this._posToVis(this.pos);
        const newRow = line + 1;
        this.pos = this._visToPos(newRow, 0);
      } else {
        this.pos++;
      }
    }
    this.render();
  }

  _onUp() {
    const { col, line } = this._posToVis(this.pos);
    if (line > 0) {
      const lines = this.buf.split('\n');
      const prevLineLen = vis(lines[line - 1] || '');
      const newCol = Math.min(col, prevLineLen);
      this.pos = this._visToPos(line - 1, newCol);
    }
    this.render();
  }

  _onDown() {
    const { col, line } = this._posToVis(this.pos);
    const lines = this.buf.split('\n');
    if (line < lines.length - 1) {
      const nextLineLen = vis(lines[line + 1] || '');
      const newCol = Math.min(col, nextLineLen);
      this.pos = this._visToPos(line + 1, newCol);
    }
    this.render();
  }

  _onHome() {
    const { line } = this._posToVis(this.pos);
    this.pos = this._visToPos(line, 0);
    this.render();
  }

  _onEnd() {
    const { line } = this._posToVis(this.pos);
    const lines = this.buf.split('\n');
    this.pos = this._visToPos(line, vis(lines[line] || ''));
    this.render();
  }

  // ── Mouse click handler ────────────────────────────────────────────────────
  _onMouseClick(col, row) {
    if (this._destroyed || this._inputLocked) return;
    const H = h();
    const W = w();

    if (this.mode === 'zen') {
      // Cat area: top half of screen
      const centerY = Math.floor(H / 2) - 4;
      if (row >= centerY && row <= centerY + 5) {
        this._catMsg = nextCatMsg();
        this.render();
        return;
      }
    }

    // Status bar click → command palette
    if (row === H) {
      this.mode = 'palette';
      this.buf = '/'; this.pos = 1; this.paletteIdx = 0;
      this.render();
    }
  }

  // ── Mouse scroll handler ──────────────────────────────────────────────────
  // delta > 0 = scroll down (toward newer messages), delta < 0 = scroll up (toward older)
  _onMouseScroll(delta) {
    if (this._destroyed || this._inputLocked) return;
    if (this.mode !== 'chat') return;
    this.scrollOff = Math.max(0, this.scrollOff - delta);
    this.render();
  }

  // ── Selector key handler ──────────────────────────────────────────────────
  _onKeySelector(name, ctrl, str, key) {
    // Get filtered items (same logic as renderSelector)
    const query = this.buf.toLowerCase();
    const filtered = query
      ? this._selItems.filter(it => (it.name || it).toLowerCase().includes(query) || (it.desc || '').toLowerCase().includes(query))
      : this._selItems;

    if (name === 'escape') {
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._selResolve) { this._selResolve(null); this._selResolve = null; }
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (name === 'return') {
      const chosen = filtered[this._selIdx] ?? null;
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._selResolve) { this._selResolve(chosen); this._selResolve = null; }
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (name === 'up') {
      this._selIdx = Math.max(0, this._selIdx - 1);
      this.render(); return;
    }
    if (name === 'down') {
      this._selIdx = Math.min(filtered.length - 1, this._selIdx + 1);
      this.render(); return;
    }
    // Search: backspace
    if (name === 'backspace') {
      if (this.pos > 0) { this.buf = this.buf.slice(0, this.pos - 1) + this.buf.slice(this.pos); this.pos--; }
      this._selIdx = 0;
      this.render(); return;
    }
    // Search: typing
    if (str && str.length === 1 && !ctrl) {
      this.buf = this.buf.slice(0, this.pos) + str + this.buf.slice(this.pos);
      this.pos++;
      this._selIdx = 0;
      this.render(); return;
    }
  }

  // ── History ────────────────────────────────────────────────────────────────
  _loadHistory() {
    try { return fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean); }
    catch { return []; }
  }
  _saveHistory() {
    try { fs.writeFileSync(HISTORY_FILE, this.history.slice(0, MAX_HISTORY).join('\n') + '\n'); }
    catch {}
  }

  // ── Service status polling ────────────────────────────────────────────────
  _pollStatus() {
    const checkTcp = (port) => new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(800);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.on('error', () => { socket.destroy(); resolve(false); });
      socket.connect(port, '127.0.0.1');
    });

    // Vite dev server is more reliably checked via HTTP than raw TCP
    const checkHttp = (url) => fetch(url, {
      signal: AbortSignal.timeout(1200),
    }).then(() => true).catch(() => false);

    Promise.all([
      checkTcp(8716),
      checkHttp('http://localhost:8717'),
    ]).then(([be, fe]) => {
      setServiceStatus(be, fe);
      if (!this._destroyed) this.render();
    });
  }
}
