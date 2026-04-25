// Asyncat v2 — Main TUI Controller
import { EventEmitter } from 'events';
import readline from 'readline';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
import { ansi, strip, vis, w, h, write, at, clearRow, beginFrame, endFrame } from './ansi.js';
import {
  renderZen, renderChat, renderPalette, renderStatusBar,
  renderStreamingIndicator, renderSelector, filterPalette,
  spinnerFrame, nextCatMsg, setServiceStatus, renderModelSetup,
  renderResult, renderModelsPage, renderProviderSetup,
  renderAskInput,
  PROVIDER_TYPES, PROVIDER_DEFAULTS,
} from './views.js';
import { getTheme } from '../theme.js';
import { getLiveLogsEnabled } from '../colors.js';
import { readEnv } from '../env.js';

const HISTORY_FILE = path.join(os.homedir(), '.asyncat_history');
const MAX_HISTORY  = 200;
const LOCAL_ENGINE_MISSING = 'Local engine missing. Run asyncat install --local-engine, set LLAMA_BINARY_PATH, or choose /provider for Ollama, LM Studio, or cloud.';

// Built-in recommended catalog — always available, no backend/auth required
const RECOMMENDED_CATALOG = [
  { repoId: 'unsloth/gemma-4-E4B-it-GGUF',                    name: 'Gemma 4 E4B',           params: '4.5B',         vram: '~9GB',  defaultQuant: 'Q4_K_M', description: 'Google Gemma 4 · multimodal (text/image/audio) · 128K ctx · great for laptops' },
  { repoId: 'unsloth/gemma-4-26B-A4B-it-GGUF',                name: 'Gemma 4 26B MoE',        params: '25B/3.8B act', vram: '~17GB', defaultQuant: 'Q4_K_M', description: 'Google MoE Gemma 4 · 256K ctx · 88% AIME 2026 · vision' },
  { repoId: 'unsloth/Qwen3.6-35B-A3B-GGUF',                   name: 'Qwen 3.6-35B MoE',       params: '35B/3B act',   vram: '~22GB', defaultQuant: 'Q4_K_M', description: 'Alibaba Apr 2026 · 73% SWE-bench · best agentic coding · 262K ctx' },
  { repoId: 'unsloth/Qwen3.5-7B-Instruct-GGUF',               name: 'Qwen 3.5-7B',            params: '7B',           vram: '~4.7GB',defaultQuant: 'Q4_K_M', description: 'Fast, stable workhorse · 32K ctx · 29+ languages · great coding' },
  { repoId: 'unsloth/Qwen3.5-14B-Instruct-GGUF',              name: 'Qwen 3.5-14B',           params: '14B',          vram: '~9GB',  defaultQuant: 'Q4_K_M', description: 'Balanced power & hardware · 32K ctx · strong coding and math' },
  { repoId: 'HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive', name: 'Qwen 3.5-9B Uncensored', params: '9B', vram: '~5.3GB', defaultQuant: 'Q4_K_M', description: 'Qwen 3.5 uncensored · 262K ctx · 0 refusals · multimodal' },
  { repoId: 'unsloth/gemma-4-31B-it-GGUF',                    name: 'Gemma 4 31B Dense',      params: '30.7B',        vram: '~30GB', defaultQuant: 'Q5_K_M', description: 'Google dense 31B · 85% MMLU Pro · 256K ctx · vision — needs 24GB+ VRAM' },
  { repoId: 'prism-ml/Bonsai-8B-gguf',                        name: 'Bonsai 8B',              params: '8B',           vram: '~5GB',  defaultQuant: 'Q4_K_M', description: 'Consumer-friendly · fast inference · low VRAM · great everyday tasks' },
];
const DEFAULT_LOCAL_CTX_SIZE = 32768;
const MAX_LOCAL_CTX_SIZE = 1048576;

function normalizeContextSize(value, fallback = DEFAULT_LOCAL_CTX_SIZE) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 512) return fallback;
  return Math.min(n, MAX_LOCAL_CTX_SIZE);
}

function defaultContextSize(model = null) {
  const env = readEnv('den/.env');
  const envCtx = normalizeContextSize(env.LLAMA_CTX_SIZE, 0);
  if (envCtx > 0) return envCtx;

  const metadataCtx = normalizeContextSize(model?.contextLength, 0);
  return Math.max(metadataCtx, DEFAULT_LOCAL_CTX_SIZE);
}

function localEngineErrorMessage(message) {
  const text = String(message || '');
  if (/MISSING_ENGINE|llama-server binary not found|Local engine missing/i.test(text)) {
    return LOCAL_ENGINE_MISSING;
  }
  return text;
}

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
    this.contextInfo  = opts.contextInfo || {};
    this.version = opts.version || 'unknown';
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

    // Models page state
    this._modelsTab       = 0;   // 0=downloaded, 1=recommended, 2=search
    this._modelsSearchQuery = '';
    this._modelsResults    = [];
    this._modelsLoading    = false;
    this._modelsResolve    = null;
    this._modelsSelectedIdx = 0;
    this._localModels      = [];
    this._recommendedModels = [];

    // Active downloads tracking
    this._activeDownloads = [];  // { downloadId, filename, progress, total, speed, status }
    this._downloadPollTimer = null;

    // Result popup state
    this._resultTitle  = '';
    this._resultLines  = [];
    this._resultScroll = 0;

    // Console capture (for inline command output)
    this._captureMode   = false;
    this._captureBuffer = [];
    this._cancelStreaming = null;

    // Full-control mode: skip all permission prompts
    this._fullControl = false;

    // Agent run log: full tool call history for /log viewer
    this._agentLog = [];
    this._usage = null;

    // Message focus & inline expand (Tab nav in chat)
    this._msgFocus = -1;       // index into this.messages, -1 = input active
    this._expandedMsgs = new Set(); // set of message indices that are expanded

    // Provider setup state
    this._providerSetup  = null;
    this._providerSetupResolve = null;

    // Startup log — shown in zen view without switching to chat mode
    this._startupLog = [];
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
    if (this._downloadPollTimer) clearTimeout(this._downloadPollTimer);
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
    // Disable every mouse mode we may have touched, plus common terminal variants.
    write('\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1005l\x1b[?1006l\x1b[?1015l');
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    write(ansi.show);
    write(ansi.mainScreen);
    write(ansi.clear + ansi.home);
    if (this._origLog) {
      console.log = this._origLog;
      this._origLog = null;
    }

    this._saveHistory();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  render() {
    if (this._destroyed) return;
    beginFrame();
    write(ansi.hide);
    renderStatusBar(this.version, this.streaming ? this._streamMsg : null, this.modelInfo, this._fullControl, this._usage);

    const isOverlay = this.mode === 'palette' || this.mode === 'selector' || this.mode === 'model-setup' || this.mode === 'result' || this.mode === 'provider-setup' || this.mode === 'ask-input';

    // Models page — standalone overlay, no base screen
    if (this.mode === 'models') {
      renderModelsPage(
        this._modelsTab,
        this.buf,
        this._getModelsItems(),
        this._modelsSelectedIdx,
        this._activeDownloads,
        this._modelsLoading
      );
      write(ansi.show);
      endFrame();
      return;
    }

    // Always render base screen first so overlays float on top of it
    const hideInput = this.mode === 'model-setup' || this.mode === 'provider-setup' || this.mode === 'ask-input';
    if ((this.mode === 'chat') || (isOverlay && this.messages.length > 0)) {
      const msgs = this._streamContent ? [...this.messages, { role: 'assistant', content: this._streamContent }] : this.messages;
      renderChat(msgs, this.scrollOff, hideInput ? '' : this.buf, hideInput ? 0 : this.pos, this.modelInfo, this.providerInfo, this.logs, this._msgFocus, this._expandedMsgs, this._contextStatus(hideInput ? '' : this.buf));
    } else {
      renderZen(hideInput ? '' : this.buf, hideInput ? 0 : this.pos, this.modelInfo, this.providerInfo, this._catMsg, this.logs, this._contextStatus(hideInput ? '' : this.buf), this._startupLog);
    }

    // Result popup doesn't need a background redraw (it's standalone)
    if (this.mode === 'result') {
      renderResult(this._resultTitle, this._resultLines, this._resultScroll);
      write(ansi.show);
      endFrame();
      return;
    }

    // Then render overlays on top
    if (this.mode === 'palette') {
      this.paletteItems = filterPalette(this.buf);
      if (this.paletteIdx >= this.paletteItems.length) {
        this.paletteIdx = Math.max(0, this.paletteItems.length - 1);
      }
      renderPalette(this.paletteItems, this.paletteIdx, this.buf, this.pos, this.messages.length > 0);
    } else if (this.mode === 'selector') {
      renderSelector(this._selTitle, this._selItems, this._selIdx, this.buf, this.pos);
    } else if (this.mode === 'model-setup') {
      renderModelSetup(this._setupModel, this.buf, this.pos, true);
    } else if (this.mode === 'provider-setup') {
      renderProviderSetup(this._providerSetup, this.pos);
    } else if (this.mode === 'ask-input') {
      renderAskInput(this._askQuestion, this.buf, this.pos, this._askDefault);
    }

    write(ansi.show);
    endFrame();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  addMessage(role, content, extra = {}) {
    this.messages.push({ role, content, ...extra });
    this.scrollOff = 0;
    if (this.mode !== 'chat') { this.mode = 'chat'; this._startupLog = []; }
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

  setModel(name, provider, contextInfo = {}) {
    this.modelInfo = name || '';
    this.providerInfo = provider || '';
    this.contextInfo = contextInfo || {};
    this.render();
  }

  _contextStatus(inputBuf = '') {
    const text = [
      ...this.messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)),
      inputBuf || '',
    ].join('\n');
    const messageTokens = Math.ceil(text.length / 4);
    const agentOverhead = 3500;
    const usedTokens = messageTokens + agentOverhead;
    const ctxSize = this.contextInfo?.ctxSize || null;
    const ctxTrain = this.contextInfo?.ctxTrain || null;
    const percent = ctxSize ? Math.min(999, Math.round((usedTokens / ctxSize) * 100)) : null;
    return { usedTokens, messageTokens, ctxSize, ctxTrain, percent };
  }

  print(text)     { this.addMessage('system', text); }
  printOk(text)   { this.print(`✔  ${text}`); }
  printWarn(text)  { this.print(`⚠  ${text}`); }
  printErr(text)   { this.print(`✖  ${text}`); }
  printInfo(text)  { this.print(`→  ${text}`); }

  // Startup-only log: renders in zen view without switching to chat mode
  logStartup(icon, text) {
    this._startupLog.push({ icon, text, ts: Date.now() });
    if (this._startupLog.length > 8) this._startupLog.shift();
    if (this.mode === 'zen') this.render();
  }

  // ── Selector (floating panel picker for models/themes) ───────────────────
  showSelector(title, items, opts = {}) {
    return new Promise((resolve) => {
      this.mode = 'selector';
      this._selTitle = title;
      this._selItems = items;
      this._selIdx = 0;
      this._selResolve = resolve;
      this._selOnHighlight = typeof opts.onHighlight === 'function' ? opts.onHighlight : null;
      this._selOnCancel = typeof opts.onCancel === 'function' ? opts.onCancel : null;
      this.buf = ''; this.pos = 0; // buf used as search input
      if (this._selOnHighlight) this._selOnHighlight(items[0] ?? null);
      this.render();
    });
  }

  showAskInput(question, defaultAnswer = '') {
    return new Promise((resolve) => {
      this.mode = 'ask-input';
      this._askQuestion = question;
      this._askDefault = defaultAnswer || '';
      this._askResolve = resolve;
      this.buf = '';
      this.pos = 0;
      this.render();
    });
  }

  // ── Model Setup Wizard ────────────────────────────────────────────────────
  showModelSetup(model) {
    return new Promise((resolve) => {
      this.mode = 'model-setup';
      this._setupModel = model;
      this._setupResolve = resolve;
      this.buf = String(defaultContextSize(model));
      this.pos = this.buf.length;
      this.render();
    });
  }

  // ── Provider Setup Wizard ─────────────────────────────────────────────────
  showProviderSetup() {
    return new Promise((resolve) => {
      this.mode = 'provider-setup';
      this._providerSetup = {
        step: 0,
        providerType: null,
        apiKey: '',
        model: '',
        baseUrl: '',
        fieldIdx: 0,
        _selIdx: 0,
        _scrollOff: 0,
      };
      this._providerSetupResolve = resolve;
      this.buf = '';
      this.pos = 0;
      this.render();
    });
  }

  // ── Models Page ─────────────────────────────────────────────────────────
  showModelsPage() {
    return new Promise((resolve) => {
      this.mode = 'models';
      this._modelsTab = 0;
      this._modelsSearchQuery = '';
      this._modelsResults = [];
      this._modelsSelectedIdx = 0;
      this._modelsResolve = resolve;
      this._modelsLoading = false;
      this._activeDownloads = [];
      this.buf = '';
      this.pos = 0;
      this.render();
      this._pollDownloads();
      this._loadModelsData();
    });
  }

  async _loadModelsData() {
    // Recommended catalog is static — show it immediately from the built-in list,
    // then refresh from the backend (no auth required for that route).
    this._recommendedModels = RECOMMENDED_CATALOG;
    this.render();

    try {
      const { apiGet, getBase } = await import('../denApi.js');
      const base = getBase();

      const [localData, recData] = await Promise.all([
        apiGet('/api/ai/providers/local-models').catch(() => ({ models: [], storage: {} })),
        // Public endpoint — no auth header needed
        fetch(`${base}/api/ai/providers/recommended-models`, { signal: AbortSignal.timeout(5000) })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ]);
      this._localModels = localData.models || [];
      if (recData?.models?.length) this._recommendedModels = recData.models;
      this.render();
    } catch {
      this._localModels = [];
      this.render();
    }
  }

  async _pollDownloads() {
    if (this._destroyed || this.mode !== 'models') return;
    try {
      const { apiGet } = await import('../denApi.js');
      const data = await apiGet('/api/ai/providers/local-models/downloads').catch(() => ({ downloads: [] }));
      const next = data.downloads || [];
      const changed = JSON.stringify(next) !== JSON.stringify(this._activeDownloads);
      this._activeDownloads = next;
      if (changed) this.render();
    } catch {}
    if (this.mode === 'models' && !this._destroyed) {
      this._downloadPollTimer = setTimeout(() => this._pollDownloads(), 800);
    }
  }

  async _startDownload(repoId, filename, url) {
    try {
      const { apiPost } = await import('../denApi.js');
      await apiPost('/api/ai/providers/local-models/download', { url, filename });
      this._modelsLoading = true;
      this.render();
      setTimeout(() => this._pollDownloads(), 200);
    } catch (e) {
      this.printErr(`Download failed: ${e.message}`);
    }
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
    // Throttle to ~30fps — avoid a full redraw for every incoming token
    const now = Date.now();
    if (!this._lastStreamRender || now - this._lastStreamRender >= 33) {
      this._lastStreamRender = now;
      this.render();
    }
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
      this.render();
    }, 700);
  }

  stopStreaming() {
    this.streaming = false;
    if (this._streamTimer) { clearInterval(this._streamTimer); this._streamTimer = null; }
    this.render();
  }

  setStreamMsg(msg) { this._streamMsg = msg; }
  setCancelStreaming(fn) { this._cancelStreaming = typeof fn === 'function' ? fn : null; }
  lockInput() { this._inputLocked = true; }
  unlockInput() { this._inputLocked = false; this.render(); }
  setUsage(usage) { this._usage = usage; this.render(); }
  setServicesStarting(starting = true) {
    const prev = this._lastServiceStatus || { be: false, fe: false };
    setServiceStatus(prev.be, prev.fe, starting);
    this.render();
  }

  // ── Key handler ───────────────────────────────────────────────────────────
  _onKey(str, key) {
    if (this._destroyed || !key) return;
    const { name, ctrl, meta } = key;
    if (this._inputLocked && !(ctrl && name === 'c')) {
      if (ctrl && name === 'f') {
        this._fullControl = !this._fullControl;
        this.print(this._fullControl
          ? '  Full-control ON — future permission requests in this run will auto-approve'
          : '  Full-control OFF — future tool calls require approval');
        this.render();
        return;
      }
      if (name === 'escape' && this._cancelStreaming) {
        this._cancelStreaming();
        this.setStreamMsg('Stopping agent run...');
      }
      return;
    }

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

    // Ctrl+F — toggle full-control mode (no permission prompts)
    if (ctrl && name === 'f') {
      this._fullControl = !this._fullControl;
      this.print(this._fullControl
        ? '  Full-control ON — all tool calls auto-approved'
        : '  Full-control OFF — tool calls require approval');
      this.render();
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
    const _contentH = Math.min(this._resultLines.length, h() - 10);
    const _maxScroll = Math.max(0, this._resultLines.length - _contentH);
    if (name === 'escape' || str === 'q') {
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      this.render();
    } else if (name === 'up' || (ctrl && name === 'p')) {
      this._resultScroll = Math.max(0, this._resultScroll - 1);
      this.render();
    } else if (name === 'down' || (ctrl && name === 'n')) {
      this._resultScroll = Math.min(_maxScroll, this._resultScroll + 1);
      this.render();
    } else if (name === 'pageup') {
      this._resultScroll = Math.max(0, this._resultScroll - _contentH);
      this.render();
    } else if (name === 'pagedown') {
      this._resultScroll = Math.min(_maxScroll, this._resultScroll + _contentH);
      this.render();
    } else if (name === 'home') {
      this._resultScroll = 0;
      this.render();
    } else if (name === 'end') {
      this._resultScroll = _maxScroll;
      this.render();
    }
    return;
  }

    // ── Selector mode ────────────────────────────────────────────────────
  if (this.mode === 'selector') {
    this._onKeySelector(name, ctrl, str, key);
    return;
  }

  // ── Ask input mode ───────────────────────────────────────────────────
  if (this.mode === 'ask-input') {
    if (name === 'escape') {
      const answer = this._askDefault || '';
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._askResolve) { this._askResolve(answer); this._askResolve = null; }
      this._askQuestion = '';
      this._askDefault = '';
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (name === 'return') {
      const answer = this.buf.trim() || this._askDefault || '';
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._askResolve) { this._askResolve(answer); this._askResolve = null; }
      this._askQuestion = '';
      this._askDefault = '';
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
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
      const ctxSize = String(normalizeContextSize(this.buf.trim(), defaultContextSize(this._setupModel)));
      if (this._setupResolve) { this._setupResolve(ctxSize); this._setupResolve = null; }
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (str && !/^[0-9]$/.test(str) && name !== 'backspace' && name !== 'delete' && name !== 'left' && name !== 'right') {
      return;
    }
  }

  // ── Provider Setup mode ────────────────────────────────────────────────
  if (this.mode === 'provider-setup') {
    const st = this._providerSetup;
    if (!st) { this.mode = 'zen'; this.render(); return; }

    if (name === 'escape') {
      if (st.step === 1) {
        st.step = 0;
        st.fieldIdx = 0;
        this.render();
        return;
      }
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._providerSetupResolve) { this._providerSetupResolve(null); this._providerSetupResolve = null; }
      this._providerSetup = null;
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }

    if (st.step === 0) {
      const maxShow = 10;
      const topIdx = Math.max(0, Math.min(st._selIdx ?? 0, PROVIDER_TYPES.length - maxShow));
      if (name === 'up') {
        if (st._selIdx > 0) { st._selIdx--; this.render(); }
        return;
      }
      if (name === 'down') {
        if (st._selIdx < PROVIDER_TYPES.length - 1) { st._selIdx++; this.render(); }
        return;
      }
      if (name === 'return' || name === 'enter') {
        const chosen = PROVIDER_TYPES[st._selIdx];
        if (!chosen) return;
        st.providerType = chosen.type;
        if (chosen.local || chosen.oauth) {
          // copilot, ollama, lmstudio, chatgpt — resolve immediately, index.js handles setup
          const result = { providerType: st.providerType, apiKey: '', model: '', baseUrl: '' };
          this.mode = this.messages.length > 0 ? 'chat' : 'zen';
          if (this._providerSetupResolve) { this._providerSetupResolve(result); this._providerSetupResolve = null; }
          this._providerSetup = null;
          this.buf = ''; this.pos = 0;
          this.render();
          return;
        }
        st.step = 1;
        st.fieldIdx = 0;
        const defaults = PROVIDER_DEFAULTS[st.providerType] || {};
        st.model = defaults.model || '';
        st.baseUrl = defaults.baseUrl || '';
        this.buf = st.apiKey;
        this.pos = st.apiKey.length;
        this.render();
        return;
      }
      return;
    }

    if (st.step === 1) {
      const fields = ['apiKey', 'model', 'baseUrl'];
      const isLocal = st.providerType === 'ollama' || st.providerType === 'lmstudio';

      if (isLocal) {
        if (name === 'return') {
          const result = { providerType: st.providerType, apiKey: '', model: st.model || 'local', baseUrl: st.baseUrl };
          this.mode = this.messages.length > 0 ? 'chat' : 'zen';
          if (this._providerSetupResolve) { this._providerSetupResolve(result); this._providerSetupResolve = null; }
          this._providerSetup = null;
          this.buf = ''; this.pos = 0;
          this.render();
        }
        return;
      }

      if (name === 'tab' || name === 'right') {
        st.fieldIdx = (st.fieldIdx + 1) % fields.length;
        const field = fields[st.fieldIdx];
        this.buf = st[field] || '';
        this.pos = this.buf.length;
        this.render();
        return;
      }
      if (name === 'left') {
        st.fieldIdx = (st.fieldIdx - 1 + fields.length) % fields.length;
        const field = fields[st.fieldIdx];
        this.buf = st[field] || '';
        this.pos = this.buf.length;
        this.render();
        return;
      }
      if (name === 'up' || name === 'down') {
        return;
      }
      if (name === 'backspace') {
        const field = fields[st.fieldIdx];
        if (st[field] && st[field].length > 0) {
          st[field] = st[field].slice(0, -1);
          if (this.buf.length > 0) this.buf = this.buf.slice(0, -1);
          this.pos = Math.min(this.pos, st[field].length);
        }
        this.render();
        return;
      }
      if (str && str.length === 1 && !ctrl && !meta && str.charCodeAt(0) >= 32) {
        const field = fields[st.fieldIdx];
        st[field] = (st[field] || '') + str;
        this.buf = st[field];
        this.pos = this.buf.length;
        this.render();
        return;
      }
      if (name === 'return') {
        const result = { providerType: st.providerType, apiKey: st.apiKey, model: st.model, baseUrl: st.baseUrl };
        this.mode = this.messages.length > 0 ? 'chat' : 'zen';
        if (this._providerSetupResolve) { this._providerSetupResolve(result); this._providerSetupResolve = null; }
        this._providerSetup = null;
        this.buf = ''; this.pos = 0;
        this.render();
        return;
      }
      return;
    }
    return;
  }

  // ── Models page mode ─────────────────────────────────────────────────
  if (this.mode === 'models') {
    if (name === 'escape' || str === 'q') {
      if (this._downloadPollTimer) { clearTimeout(this._downloadPollTimer); this._downloadPollTimer = null; }
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._modelsResolve) { this._modelsResolve(null); this._modelsResolve = null; }
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (name === 'tab') {
      this._modelsTab = (this._modelsTab + 1) % 3;
      this._modelsSelectedIdx = 0;
      this.buf = '';
      this.pos = 0;
      this.render();
      return;
    }
    if (name === 'left') {
      this._modelsTab = (this._modelsTab + 2) % 3;
      this._modelsSelectedIdx = 0;
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (name === 'right') {
      this._modelsTab = (this._modelsTab + 1) % 3;
      this._modelsSelectedIdx = 0;
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (name === 'up') {
      this._modelsSelectedIdx = Math.max(0, this._modelsSelectedIdx - 1);
      this.render();
      return;
    }
    if (name === 'down') {
      const items = this._getModelsItems();
      this._modelsSelectedIdx = Math.min(items.length - 1, this._modelsSelectedIdx + 1);
      this.render();
      return;
    }
    if (name === 'return') {
      this._onModelsSelect();
      return;
    }
    if (name === 'backspace') {
      if (this.buf.length > 0) {
        this.buf = this.buf.slice(0, -1);
        this.pos = this.buf.length;
        if (this._modelsTab === 2) this._doModelsSearch();
        else this.render();
      }
      return;
    }
    if (str && str.length === 1 && !ctrl && !meta) {
      this.buf += str;
      this.pos = this.buf.length;
      if (this._modelsTab === 2) this._doModelsSearch();
      else this.render();
      return;
    }
    return;
  }

  // ── ESC ──────────────────────────────────────────────────────────────
  if (name === 'escape') {
    if (this.mode === 'palette') {
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      this.buf = ''; this.pos = 0;
      this.render(); return;
    }
    // Clear message focus first if active
    if (this._msgFocus !== -1) {
      this._msgFocus = -1;
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
    // If a tool message is focused, toggle expand/collapse
    if (this._msgFocus !== -1 && !this.buf) {
      const msg = this.messages[this._msgFocus];
      if (msg?.role === 'tool') {
        if (this._expandedMsgs.has(this._msgFocus)) {
          this._expandedMsgs.delete(this._msgFocus);
        } else {
          this._expandedMsgs.add(this._msgFocus);
        }
        this.render(); return;
      }
    }

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
    // In chat with empty input: cycle focus through tool messages (newest → oldest)
    if ((this.mode === 'chat' || this.mode === 'zen') && !this.buf) {
      const toolIdxs = this.messages.map((m, i) => m.role === 'tool' ? i : -1).filter(i => i !== -1);
      if (toolIdxs.length === 0) { this.print('  No tool calls yet.'); return; }
      const cur = this._msgFocus;
      const pos = toolIdxs.lastIndexOf(cur);
      const next = pos <= 0 ? toolIdxs[toolIdxs.length - 1] : toolIdxs[pos - 1];
      this._msgFocus = next;
      // Auto-scroll so focused message is visible
      this.scrollOff = 0;
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
    if (this._msgFocus !== -1) this._msgFocus = -1; // typing clears message focus
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

    if (this.mode === 'selector') {
      const query = this.buf.toLowerCase();
      const filtered = query
        ? this._selItems.filter(it => (it.name || it).toLowerCase().includes(query) || (it.desc || '').toLowerCase().includes(query))
        : this._selItems;
      const panelW = Math.min(Math.floor(W * 0.78), 96);
      const panelL = Math.floor((W - panelW) / 2) + 1;
      const maxShow = Math.min(filtered.length, H - 14);
      const scrollOff = this._selIdx >= maxShow ? this._selIdx - maxShow + 1 : 0;
      const panelH = maxShow + 5;
      const panelTop = Math.max(2, Math.floor((H - panelH) / 2));
      const itemRow = row - (panelTop + 3);
      if (col >= panelL && col <= panelL + panelW && itemRow >= 0 && itemRow < maxShow) {
        const realIdx = scrollOff + itemRow;
        const chosen = filtered[realIdx] ?? null;
        this._selIdx = realIdx;
        this.mode = this.messages.length > 0 ? 'chat' : 'zen';
        if (this._selResolve) { this._selResolve(chosen); this._selResolve = null; }
        this._selOnHighlight = null;
        this._selOnCancel = null;
        this.buf = ''; this.pos = 0;
        this.render();
        return;
      }
    }

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
      if (this._selOnCancel) this._selOnCancel();
      if (this._selResolve) { this._selResolve(null); this._selResolve = null; }
      this._selOnHighlight = null;
      this._selOnCancel = null;
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (name === 'return') {
      const chosen = filtered[this._selIdx] ?? null;
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._selResolve) { this._selResolve(chosen); this._selResolve = null; }
      this._selOnHighlight = null;
      this._selOnCancel = null;
      this.buf = ''; this.pos = 0;
      this.render();
      return;
    }
    if (name === 'up') {
      this._selIdx = Math.max(0, this._selIdx - 1);
      if (this._selOnHighlight) this._selOnHighlight(filtered[this._selIdx] ?? null);
      this.render(); return;
    }
    if (name === 'down') {
      this._selIdx = Math.min(Math.max(0, filtered.length - 1), this._selIdx + 1);
      if (this._selOnHighlight) this._selOnHighlight(filtered[this._selIdx] ?? null);
      this.render(); return;
    }
    // Search: backspace
    if (name === 'backspace') {
      if (this.pos > 0) { this.buf = this.buf.slice(0, this.pos - 1) + this.buf.slice(this.pos); this.pos--; }
      this._selIdx = 0;
      if (this._selOnHighlight) {
        const nextQuery = this.buf.toLowerCase();
        const nextFiltered = nextQuery
          ? this._selItems.filter(it => (it.name || it).toLowerCase().includes(nextQuery) || (it.desc || '').toLowerCase().includes(nextQuery))
          : this._selItems;
        this._selOnHighlight(nextFiltered[0] ?? null);
      }
      this.render(); return;
    }
    // Search: typing
    if (str && str.length === 1 && !ctrl) {
      this.buf = this.buf.slice(0, this.pos) + str + this.buf.slice(this.pos);
      this.pos++;
      this._selIdx = 0;
      if (this._selOnHighlight) {
        const nextQuery = this.buf.toLowerCase();
        const nextFiltered = nextQuery
          ? this._selItems.filter(it => (it.name || it).toLowerCase().includes(nextQuery) || (it.desc || '').toLowerCase().includes(nextQuery))
          : this._selItems;
        this._selOnHighlight(nextFiltered[0] ?? null);
      }
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
      const prev = this._lastServiceStatus;
      const starting = !be || !fe;
      if (!prev || prev.be !== be || prev.fe !== fe || prev.starting !== starting) {
        this._lastServiceStatus = { be, fe, starting };
        setServiceStatus(be, fe, starting);
        if (!this._destroyed) this.render();
      }
    });
  }

  // ── Models page helpers ──────────────────────────────────────────────────
  _getModelsItems() {
    if (this._modelsTab === 0) {
      return (this._localModels || []).map(m => ({ ...m, _type: 'local' }));
    } else if (this._modelsTab === 1) {
      return (this._recommendedModels || []).map(m => ({ ...m, _type: 'recommended' }));
    } else {
      return this._modelsResults.map(m => ({ ...m, _type: 'search' }));
    }
  }

  _doModelsSearch() {
    this._modelsLoading = true;
    this.render();
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(async () => {
      try {
        const { apiGet } = await import('../denApi.js');
        const q = this.buf.trim();
        if (!q) { this._modelsResults = []; this._modelsLoading = false; this.render(); return; }
        const data = await apiGet(`/api/ai/providers/hf-search?q=${encodeURIComponent(q)}`);
        this._modelsResults = data.models || [];
        this._modelsSelectedIdx = 0;
      } catch {
        this._modelsResults = [];
      }
      this._modelsLoading = false;
      this.render();
    }, 400);
  }

  async _onModelsSelect() {
    const items = this._getModelsItems();
    const item = items[this._modelsSelectedIdx];
    if (!item) return;

    if (this._modelsTab === 0) {
      // Close the models page, then ask for context size before loading.
      if (this._downloadPollTimer) { clearTimeout(this._downloadPollTimer); this._downloadPollTimer = null; }
      this.mode = this.messages.length > 0 ? 'chat' : 'zen';
      if (this._modelsResolve) { this._modelsResolve(null); this._modelsResolve = null; }
      this.buf = ''; this.pos = 0;
      this.render();
      const ctxSize = await this.showModelSetup(item);
      if (!ctxSize) {
        this.printInfo('Model load cancelled.');
        return;
      }
      this._loadSelectedModel(item.filename, ctxSize);
      return;
    }

    this._modelsLoading = true;
    this.render();

    try {
      const { apiGet } = await import('../denApi.js');
      const repoId = item.repoId;
      const defaultFilename = item.defaultFilename || (item.quantizations || []).includes(item.defaultQuant || 'Q4_K_M')
        ? `${item.name.replace(/\s+/g, '-').toLowerCase()}-${item.defaultQuant || 'Q4_K_M'}.gguf`
        : null;

      let filename = defaultFilename;
      let downloadUrl = null;

      if (item._type === 'recommended') {
        const urlData = await apiGet(`/api/ai/providers/hf-download-url?repoId=${encodeURIComponent(repoId)}&filename=${encodeURIComponent(filename || item.defaultFilename || '')}`).catch(() => null);
        if (urlData?.url) {
          downloadUrl = urlData.url;
          filename = urlData.filename;
        } else {
          const filesData = await apiGet(`/api/ai/providers/hf-repo/${encodeURIComponent(repoId)}/files`).catch(() => ({ files: [] }));
          const ggufFile = (filesData.files || []).find(f => f.filename.includes(item.defaultQuant || 'Q4_K_M'));
          if (ggufFile) {
            const urlData2 = await apiGet(`/api/ai/providers/hf-download-url?repoId=${encodeURIComponent(repoId)}&filename=${encodeURIComponent(ggufFile.filename)}`).catch(() => null);
            if (urlData2?.url) {
              downloadUrl = urlData2.url;
              filename = ggufFile.filename;
            }
          }
        }
      }

      if (downloadUrl && filename) {
        await this._startDownload(repoId, filename, downloadUrl);
        this._modelsLoading = false;
        this.render();
      } else {
        this.printErr('Could not resolve download URL for this model');
        this._modelsLoading = false;
        this.render();
      }
    } catch (e) {
      this.printErr(`Failed: ${e.message}`);
      this._modelsLoading = false;
      this.render();
    }
  }

  async _loadSelectedModel(filename, ctxSize) {
    try {
      const { apiPost, apiGet } = await import('../denApi.js');
      const requestedCtx = normalizeContextSize(ctxSize, defaultContextSize());
      await apiPost('/api/ai/providers/server/start', { filename, ctxSize: requestedCtx });
      this.printOk(`Loading ${filename} with ctx ${requestedCtx}...`);
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const data = await apiGet('/api/ai/providers/server/status').catch(() => null);
        if (!data) continue;
        if (data.status === 'ready') {
          this.setModel(data.model_file || data.model || filename, 'local', {
            ctxSize: data.ctxSize || requestedCtx,
            ctxTrain: data.ctxTrain || null,
          });
          this.printOk(`Model ready · ctx ${data.ctxSize || requestedCtx}${data.ctxTrain ? ` / metadata ${data.ctxTrain}` : ''}`);
          return;
        }
        if (data.status === 'error') {
          this.printErr(localEngineErrorMessage(data.error || 'Model failed to load.'));
          return;
        }
      }
      this.printWarn('Model is still loading. Check /models or /ctx for status.');
    } catch (e) {
      this.printErr(`Failed to load model: ${localEngineErrorMessage(e.message)}`);
    }
  }
}
