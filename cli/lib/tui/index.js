// Asyncat v2 — Main TUI Controller
import { EventEmitter } from 'events';
import readline from 'readline';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ansi, strip, vis, w, h, write, at, clearRow } from './ansi.js';
import {
  renderZen, renderChat, renderPalette, renderStatusBar,
  renderStreamingIndicator, renderSelector, filterPalette,
  spinnerFrame, nextCatMsg,
} from './views.js';
import { getTheme } from '../theme.js';

const HISTORY_FILE = path.join(os.homedir(), '.asyncat_history');
const MAX_HISTORY  = 200;

export class Tui extends EventEmitter {
  constructor(opts = {}) {
    super();
    // Modes: zen | chat | palette | selector
    this.mode        = 'zen';
    this.messages    = [];
    this.scrollOff   = 0;
    this.buf         = '';
    this.pos         = 0;
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

    // Selector state (for model/theme pickers)
    this._selTitle    = '';
    this._selItems    = [];
    this._selIdx      = 0;
    this._selResolve  = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  start() {
    if (this._started) return;
    this._started = true;
    this._destroyed = false;

    write(ansi.altScreen);
    write(ansi.hide);
    write(ansi.clear + ansi.home);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }

    // Only set up keypress once
    if (!this._keypressSetup) {
      readline.emitKeypressEvents(process.stdin);
      this._keypressSetup = true;
    }

    this._keyHandler = (str, key) => this._onKey(str, key);
    process.stdin.on('keypress', this._keyHandler);

    this._resizeHandler = () => this.render();
    process.stdout.on('resize', this._resizeHandler);

    this.render();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._started = false;
    if (this._streamTimer) clearInterval(this._streamTimer);
    if (this._keyHandler) {
      process.stdin.removeListener('keypress', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._resizeHandler) {
      process.stdout.removeListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    write(ansi.show);
    write(ansi.mainScreen);
    this._saveHistory();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  render() {
    if (this._destroyed) return;
    write(ansi.hide);

    if (this.mode === 'selector') {
      renderSelector(this._selTitle, this._selItems, this._selIdx, 1);
    } else if (this.mode === 'palette') {
      this.paletteItems = filterPalette(this.buf);
      if (this.paletteIdx >= this.paletteItems.length) {
        this.paletteIdx = Math.max(0, this.paletteItems.length - 1);
      }
      renderPalette(this.paletteItems, this.paletteIdx, this.buf, this.pos);
    } else if (this.mode === 'chat') {
      renderChat(this.messages, this.scrollOff, this.buf, this.pos, this.modelInfo, this.providerInfo);
    } else {
      // zen
      renderZen(this.buf, this.pos, this.modelInfo, this.providerInfo, this._catMsg);
    }

    renderStatusBar(this.version);
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

  // ── Selector (inline picker for models/themes) ────────────────────────────
  showSelector(title, items) {
    return new Promise((resolve) => {
      this.mode = 'selector';
      this._selTitle = title;
      this._selItems = items;
      this._selIdx = 0;
      this._selResolve = resolve;
      this.render();
    });
  }

  // ── Streaming ─────────────────────────────────────────────────────────────
  startStreaming(msg) {
    this.streaming = true;
    this._streamMsg = msg || 'Thinking...';
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

    // ── Global ───────────────────────────────────────────────────────────
    if (ctrl && name === 'c') { this.emit('exit'); return; }
    if (ctrl && name === 'l') { write(ansi.clear); this.render(); return; }

    // ── Selector mode ────────────────────────────────────────────────────
    if (this.mode === 'selector') {
      this._onKeySelector(name, ctrl, str, key);
      return;
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

      const line = this.buf.trim();
      if (!line) {
        // Enter on empty → cycle cat message
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

      // Regular text → AI
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

    // ── Arrows ───────────────────────────────────────────────────────────
    if (name === 'up') {
      if (this.mode === 'palette') {
        this.paletteIdx = Math.max(0, this.paletteIdx - 1);
        this.render(); return;
      }
      if (this.mode === 'chat' && !this.buf) {
        this.scrollOff++;
        this.render(); return;
      }
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
      if (this.mode === 'chat' && this.scrollOff > 0 && !this.buf) {
        this.scrollOff--;
        this.render(); return;
      }
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
      this.pos = Math.max(0, ctrl ? 0 : this.pos - 1);
      this.render(); return;
    }
    if (name === 'right') {
      this.pos = Math.min(this.buf.length, ctrl ? this.buf.length : this.pos + 1);
      this.render(); return;
    }

    // ── Home/End ─────────────────────────────────────────────────────────
    if (name === 'home' || (ctrl && name === 'a')) { this.pos = 0; this.render(); return; }
    if (name === 'end' || (ctrl && name === 'e')) { this.pos = this.buf.length; this.render(); return; }

    // ── Backspace / Delete ───────────────────────────────────────────────
    if (name === 'backspace') {
      if (this.pos > 0) {
        this.buf = this.buf.slice(0, this.pos - 1) + this.buf.slice(this.pos);
        this.pos--;
      }
      if (this.mode === 'palette' && (!this.buf || !this.buf.startsWith('/'))) {
        this.mode = this.messages.length > 0 ? 'chat' : 'zen';
        this.paletteIdx = 0;
      }
      this.render(); return;
    }
    if (name === 'delete') {
      if (this.pos < this.buf.length) {
        this.buf = this.buf.slice(0, this.pos) + this.buf.slice(this.pos + 1);
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

      // Auto-enter palette when / is first char
      if (this.buf === '/' && this.mode !== 'palette') {
        this.mode = 'palette';
        this.paletteIdx = 0;
      }

      this.render();
    }
  }

  // ── Selector key handler ──────────────────────────────────────────────────
  _onKeySelector(name, ctrl, str, key) {
    if (name === 'escape') {
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._selResolve) { this._selResolve(null); this._selResolve = null; }
      this.render();
      return;
    }
    if (name === 'return') {
      const chosen = this._selItems[this._selIdx];
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._selResolve) { this._selResolve(chosen); this._selResolve = null; }
      this.render();
      return;
    }
    if (name === 'up') {
      this._selIdx = Math.max(0, this._selIdx - 1);
      this.render(); return;
    }
    if (name === 'down') {
      this._selIdx = Math.min(this._selItems.length - 1, this._selIdx + 1);
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
}

