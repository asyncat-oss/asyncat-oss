import { EventEmitter } from 'events';
import readline from 'readline';
import { c } from './colors.js';
import { getTheme } from './theme.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const HISTORY_FILE = path.join(os.homedir(), '.asyncat_history');
const MAX_HISTORY  = 200;
const MAX_SUGG     = 7;

// ── Command catalogs ───────────────────────────────────────────────────────────
const TOP_CMDS = [
  { name: 'start',    desc: 'Start backend & frontend services' },
  { name: 'stop',     desc: 'Stop all running services' },
  { name: 'status',   desc: 'Show running processes' },
  { name: 'restart',  desc: 'Stop then start all services' },
  { name: 'chat',     desc: 'Interactive AI chat with streaming' },
  { name: 'run',      desc: 'Direct chat with local llama-server' },
  { name: 'models',   desc: 'Manage GGUF models' },
  { name: 'provider', desc: 'Configure AI provider (local / cloud)' },
  { name: 'sessions', desc: 'Browse saved conversations' },
  { name: 'stash',    desc: 'Save or view stashed notes' },
  { name: 'install',  desc: 'Set up dependencies and .env' },
  { name: 'doctor',   desc: 'Full system health check' },
  { name: 'update',   desc: 'Pull latest code and reinstall' },
  { name: 'logs',     desc: 'View service logs' },
  { name: 'db',       desc: 'Database backup / reset / seed' },
  { name: 'config',   desc: 'Get or set configuration values' },
  { name: 'theme',    desc: 'Switch color theme' },
  { name: 'version',  desc: 'Show version info' },
  { name: 'open',     desc: 'Open asyncat in the browser' },
  { name: 'help',     desc: 'Show command reference' },
  { name: 'clear',    desc: 'Clear the screen' },
  { name: 'exit',     desc: 'Quit and stop all services' },
];

// Slash commands — shown when input starts with /
const SLASH_CMDS = [
  { name: '/chat',     desc: 'Start an interactive AI chat session' },
  { name: '/run',      desc: 'Direct chat with local llama-server' },
  { name: '/status',   desc: 'Show running processes' },
  { name: '/start',    desc: 'Start backend & frontend services' },
  { name: '/stop',     desc: 'Stop all running services' },
  { name: '/stash',    desc: 'Save or browse stashed notes' },
  { name: '/sessions', desc: 'Browse saved conversations' },
  { name: '/models',   desc: 'Manage AI models' },
  { name: '/provider', desc: 'Configure AI provider' },
  { name: '/theme',    desc: 'Switch color theme (dark/hacker/ocean/minimal)' },
  { name: '/help',     desc: 'Show command reference' },
  { name: '/clear',    desc: 'Clear the screen' },
  { name: '/exit',     desc: 'Quit and stop all services' },
];

const SUB_CMDS = {
  models:   [
    { name: 'list',  desc: 'List downloaded models' },
    { name: 'pull',  desc: 'Download a GGUF model' },
    { name: 'serve', desc: 'Load model into llama-server' },
    { name: 'stop',  desc: 'Stop llama-server' },
    { name: 'ps',    desc: 'Show running models' },
    { name: 'rm',    desc: 'Delete a model file' },
    { name: 'info',  desc: 'Show model metadata' },
  ],
  provider: [
    { name: 'list',  desc: 'Show current provider' },
    { name: 'set',   desc: 'Switch provider (local / cloud / custom)' },
    { name: 'stop',  desc: 'Stop local model server' },
    { name: 'get',   desc: 'Get provider details' },
  ],
  sessions: [
    { name: 'list',  desc: 'List saved conversations' },
    { name: 'rm',    desc: 'Delete a conversation' },
    { name: 'stats', desc: 'Show conversation statistics' },
  ],
  stash: [
    { name: 'list',  desc: 'Show all stashed notes' },
    { name: 'rm',    desc: 'Remove a stash entry by ID' },
    { name: 'clear', desc: 'Clear all stash entries' },
  ],
  theme: [
    { name: 'dark',    desc: 'Default dark theme (magenta)' },
    { name: 'hacker',  desc: 'Monochrome green hacker style' },
    { name: 'ocean',   desc: 'Blue and cyan palette' },
    { name: 'minimal', desc: 'Low-contrast minimal style' },
  ],
  logs: [
    { name: 'backend',  desc: 'Show backend logs' },
    { name: 'frontend', desc: 'Show frontend logs' },
    { name: 'all',      desc: 'Show all logs' },
  ],
  db: [
    { name: 'backup', desc: 'Backup the database' },
    { name: 'reset',  desc: 'Reset database to clean state' },
    { name: 'seed',   desc: 'Seed with example data' },
  ],
  config: [
    { name: 'show', desc: 'Show all config values' },
    { name: 'get',  desc: 'Get a single config value' },
    { name: 'set',  desc: 'Set a config value' },
  ],
  start: [
    { name: '--backend-only',  desc: 'Start backend only' },
    { name: '--frontend-only', desc: 'Start frontend only' },
  ],
  chat: [
    { name: '--web',            desc: 'Enable web search' },
    { name: '--think',          desc: 'Enable extended thinking' },
    { name: '--style=normal',   desc: 'Normal response style' },
    { name: '--style=concise',  desc: 'Concise response style' },
    { name: '--style=detailed', desc: 'Detailed response style' },
  ],
};

// Sub-commands for slash mode
const SLASH_SUB = {
  '/theme': [
    { name: 'dark',    desc: 'Default dark theme (magenta)' },
    { name: 'hacker',  desc: 'Monochrome green hacker style' },
    { name: 'ocean',   desc: 'Blue and cyan palette' },
    { name: 'minimal', desc: 'Low-contrast minimal style' },
  ],
  '/stash': [
    { name: 'list',  desc: 'Show all stashed notes' },
    { name: 'rm',    desc: 'Remove a stash entry by ID' },
    { name: 'clear', desc: 'Clear all stash entries' },
  ],
  '/models': SUB_CMDS.models,
  '/sessions': SUB_CMDS.sessions,
};

function getSuggestions(buf) {
  if (!buf) return [];

  // ── Slash mode ───────────────────────────────────────────────────────────────
  if (buf.startsWith('/')) {
    const tokens = buf.trimStart().split(/\s+/);
    const first  = tokens[0];

    if (tokens.length === 1) {
      // Filtering top-level slash commands
      const matches = SLASH_CMDS.filter(s => s.name.startsWith(first) && s.name !== first);
      // If nothing typed yet beyond '/', show all
      return first === '/' ? SLASH_CMDS.slice(0, MAX_SUGG) : matches;
    }

    // Sub-command for a slash command
    const subs = SLASH_SUB[first] || [];
    const stub = tokens[tokens.length - 1];
    return stub ? subs.filter(s => s.name.startsWith(stub) && s.name !== stub) : subs;
  }

  // ── Normal mode ──────────────────────────────────────────────────────────────
  const tokens = buf.trimStart().split(/\s+/);
  const first  = tokens[0];

  if (tokens.length === 1) {
    return TOP_CMDS.filter(cmd => cmd.name.startsWith(first) && cmd.name !== first);
  }

  const subs = SUB_CMDS[first] || [];
  const stub = tokens[tokens.length - 1];
  return stub ? subs.filter(s => s.name.startsWith(stub) && s.name !== stub) : subs;
}

// ── LiveLine ───────────────────────────────────────────────────────────────────
export class LiveLine extends EventEmitter {
  constructor(promptStr, promptLen) {
    super();
    this._prompt    = promptStr;
    this._promptLen = promptLen;
    this._isMain    = true;

    this.buf        = '';
    this.pos        = 0;
    this.history    = this._loadHistory();
    this.histIdx    = -1;
    this.histSaved  = '';

    this.suggestions     = [];
    this.selIdx          = 0;
    this.suggestionLines = 0;

    this.closed = false;
  }

  // ── readline-compatible API ──────────────────────────────────────────────────
  get line() { return this.buf; }

  setPrompt(str) {
    this._prompt    = str;
    this._promptLen = str.replace(/\x1b\[[^m]*m/g, '').length;
    this._isMain    = false;
  }

  restoreMainPrompt(str, len) {
    this._prompt    = str;
    this._promptLen = len;
    this._isMain    = true;
  }

  // Called by external code (dispatch, command handlers) to redraw after output
  prompt() { this._draw(false); }

  // ── Start raw input ──────────────────────────────────────────────────────────
  start() {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('keypress', (str, key) => this._onKey(str, key));
    this._draw(false);
  }

  // ── Print text above the live prompt, then redraw ────────────────────────────
  printAbove(text) {
    // Cursor is at PROMPT LINE — move up to RULE LINE, clear everything, print text, redraw
    process.stdout.write('\x1b[1A');   // up to rule line
    process.stdout.write('\r\x1b[J');  // col 0, clear to end of screen
    process.stdout.write(text + '\n');
    this._draw(false);
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  // atPrompt=true  → cursor is at the PROMPT LINE; move up 1 to redraw the rule too
  // atPrompt=false → cursor is on a fresh line; write rule then prompt
  _draw(atPrompt) {
    const t     = getTheme();
    const W     = process.stdout.columns || 80;
    const suggs = this._isMain ? getSuggestions(this.buf).slice(0, MAX_SUGG) : [];

    process.stdout.write('\x1b[?25l');  // hide cursor

    if (atPrompt) {
      process.stdout.write('\x1b[1A');  // move up to rule line
    }

    process.stdout.write('\r\x1b[J');  // col 0, clear to end of screen

    // ── Rule line ──────────────────────────────────────────────────────────
    process.stdout.write(`${t.border} ${'─'.repeat(W - 2)}${c.reset}\n`);

    // ── Prompt + buffer ────────────────────────────────────────────────────
    process.stdout.write(this._prompt);
    process.stdout.write(this.buf);

    // ── Suggestions ────────────────────────────────────────────────────────
    if (suggs.length > 0) {
      const colW = Math.max(...suggs.map(s => s.name.length)) + 3;
      process.stdout.write('\n');
      for (let i = 0; i < suggs.length; i++) {
        const s   = suggs[i];
        const sel = i === this.selIdx;
        const pad = s.name.padEnd(colW);
        if (sel) {
          process.stdout.write(`  ${c.bold}${t.sugg}${pad}${c.reset}${s.desc}${c.reset}`);
        } else {
          process.stdout.write(`  ${c.dim}${pad}${c.reset}${c.dim}${s.desc}${c.reset}`);
        }
        if (i < suggs.length - 1) process.stdout.write('\n');
      }
      // Move cursor back up to prompt line (not rule line)
      process.stdout.write(`\x1b[${suggs.length}A`);
      this.suggestionLines = suggs.length;
    } else {
      this.suggestionLines = 0;
    }

    this.suggestions = suggs;
    readline.cursorTo(process.stdout, this._promptLen + this.pos);
    process.stdout.write('\x1b[?25h');  // show cursor
  }

  // ── Key handler ───────────────────────────────────────────────────────────────
  _onKey(str, key) {
    if (!key) return;
    const { name, ctrl, meta } = key;

    if (ctrl && name === 'c') {
      process.stdout.write('\n');
      process.stdout.write(`  ${c.dim}(ctrl+c again to quit, or type exit)${c.reset}\n`);
      this.buf = ''; this.pos = 0; this.selIdx = 0;
      this._draw(false);
      return;
    }

    if (ctrl && name === 'd') {
      if (this.buf === '') this.emit('close');
      return;
    }

    if (ctrl && name === 'l') {
      console.clear();
      this._draw(false);
      return;
    }

    // ── Enter ──────────────────────────────────────────────────────────────────
    if (name === 'return' || name === 'enter') {
      const line = this.buf;

      // Move up to rule line, clear everything, echo the submitted line
      process.stdout.write('\x1b[1A');
      process.stdout.write('\r\x1b[J');
      process.stdout.write(this._prompt + line + '\n');

      if (line.trim()) {
        this.history.unshift(line);
        if (this.history.length > MAX_HISTORY) this.history.pop();
        this._saveHistory();
      }
      this.buf = ''; this.pos = 0; this.histIdx = -1;
      this.histSaved = ''; this.selIdx = 0; this.suggestionLines = 0;

      this.emit('line', line);
      return;
    }

    // ── Tab — complete selected suggestion ─────────────────────────────────────
    if (name === 'tab') {
      if (this.suggestions.length > 0) {
        this._applyCompletion(this.suggestions[this.selIdx].name);
      }
      this._draw(true); return;
    }

    // ── Arrow keys ─────────────────────────────────────────────────────────────
    if (name === 'up') {
      if (this.suggestions.length > 0 && this._isMain) {
        this.selIdx = Math.max(0, this.selIdx - 1);
      } else {
        if (this.histIdx === -1) this.histSaved = this.buf;
        if (this.histIdx < this.history.length - 1) {
          this.histIdx++;
          this.buf = this.history[this.histIdx];
          this.pos = this.buf.length;
          this.selIdx = 0;
        }
      }
      this._draw(true); return;
    }

    if (name === 'down') {
      if (this.suggestions.length > 0 && this._isMain) {
        this.selIdx = Math.min(this.suggestions.length - 1, this.selIdx + 1);
      } else {
        if (this.histIdx > 0) {
          this.histIdx--;
          this.buf = this.history[this.histIdx];
          this.pos = this.buf.length;
          this.selIdx = 0;
        } else if (this.histIdx === 0) {
          this.histIdx = -1;
          this.buf = this.histSaved;
          this.pos = this.buf.length;
          this.selIdx = 0;
        }
      }
      this._draw(true); return;
    }

    if (name === 'left') {
      if (ctrl) {
        let p = this.pos - 1;
        while (p > 0 && this.buf[p - 1] === ' ') p--;
        while (p > 0 && this.buf[p - 1] !== ' ') p--;
        this.pos = p;
      } else {
        this.pos = Math.max(0, this.pos - 1);
      }
      this._draw(true); return;
    }

    if (name === 'right') {
      if (this.pos === this.buf.length && this.suggestions.length > 0) {
        this._applyCompletion(this.suggestions[this.selIdx].name);
        this.selIdx = 0;
      } else if (ctrl) {
        let p = this.pos;
        while (p < this.buf.length && this.buf[p] === ' ') p++;
        while (p < this.buf.length && this.buf[p] !== ' ') p++;
        this.pos = p;
      } else {
        this.pos = Math.min(this.buf.length, this.pos + 1);
      }
      this._draw(true); return;
    }

    // ── Home / End ──────────────────────────────────────────────────────────────
    if (name === 'home' || (ctrl && name === 'a')) { this.pos = 0; this._draw(true); return; }
    if (name === 'end'  || (ctrl && name === 'e')) { this.pos = this.buf.length; this._draw(true); return; }

    // ── Backspace / Delete ──────────────────────────────────────────────────────
    if (name === 'backspace') {
      if (this.pos > 0) {
        this.buf = this.buf.slice(0, this.pos - 1) + this.buf.slice(this.pos);
        this.pos--; this.selIdx = 0;
      }
      this._draw(true); return;
    }
    if (name === 'delete') {
      if (this.pos < this.buf.length) {
        this.buf = this.buf.slice(0, this.pos) + this.buf.slice(this.pos + 1);
        this.selIdx = 0;
      }
      this._draw(true); return;
    }

    // ── Ctrl shortcuts ──────────────────────────────────────────────────────────
    if (ctrl && name === 'u') { this.buf = this.buf.slice(this.pos); this.pos = 0; this.selIdx = 0; this._draw(true); return; }
    if (ctrl && name === 'k') { this.buf = this.buf.slice(0, this.pos); this.selIdx = 0; this._draw(true); return; }
    if (ctrl && name === 'w') {
      let p = this.pos;
      while (p > 0 && this.buf[p - 1] === ' ') p--;
      while (p > 0 && this.buf[p - 1] !== ' ') p--;
      this.buf = this.buf.slice(0, p) + this.buf.slice(this.pos);
      this.pos = p; this.selIdx = 0;
      this._draw(true); return;
    }

    // ── Printable character ─────────────────────────────────────────────────────
    if (str && str.length === 1 && !ctrl && !meta) {
      this.buf = this.buf.slice(0, this.pos) + str + this.buf.slice(this.pos);
      this.pos++; this.selIdx = 0;
      this._draw(true);
    }
  }

  // ── Complete the current token with the selected suggestion ───────────────────
  _applyCompletion(selectedName) {
    const isSlash  = this.buf.startsWith('/');
    const trimmed  = this.buf.trimStart();
    const tokens   = trimmed.split(/\s+/);

    if (isSlash && tokens.length === 1) {
      // Replace the whole /xyz with the selected /cmd + space
      this.buf = selectedName + ' ';
    } else if (tokens.length <= 1) {
      this.buf = selectedName + ' ';
    } else {
      tokens[tokens.length - 1] = selectedName;
      this.buf = tokens.join(' ') + ' ';
    }
    this.pos = this.buf.length;
  }

  // ── History persistence ───────────────────────────────────────────────────────
  _loadHistory() {
    try {
      return fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
    } catch { return []; }
  }

  _saveHistory() {
    try {
      fs.writeFileSync(HISTORY_FILE, this.history.slice(0, MAX_HISTORY).join('\n') + '\n');
    } catch {}
  }

  close() {
    this._saveHistory();
    this.closed = true;
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  }
}
