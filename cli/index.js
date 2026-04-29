// Asyncat v2 — TUI Entry Point
// Premium terminal experience inspired by OpenCode
import { Tui } from './lib/tui/index.js';
import { loadTheme, setTheme, setThemePreview, getThemeName, THEME_NAMES } from './lib/theme.js';
import { stopAll, procs } from './lib/procs.js';
import fs from 'fs';
import path from 'path';
import { ROOT, setKey } from './lib/env.js';
import { PROVIDER_DEFAULTS } from './lib/tui/views.js';
import { spawn as _spawn } from 'child_process';
import crypto from 'crypto';
import { logger } from './lib/logger.js';

// ── Command imports ──────────────────────────────────────────────────────────
import * as _start    from './commands/start.js';
import * as _stop     from './commands/stop.js';
import * as _status   from './commands/status.js';
import * as _install  from './commands/install.js';
import * as _onboard  from './commands/onboard.js';
import * as _doctor   from './commands/doctor.js';
import * as _logs     from './commands/logs.js';
import * as _models   from './commands/models.js';
import * as _db       from './commands/db.js';
import * as _config   from './commands/config.js';
import * as _skills   from './commands/skills.js';
import * as _update   from './commands/update.js';
import * as _version  from './commands/version.js';
import * as _open     from './commands/open.js';
import * as _chat     from './commands/chat.js';
import * as _run      from './commands/run.js';
import * as _provider from './commands/provider.js';
import * as _sessions from './commands/sessions.js';
import * as _snippets from './commands/snippets.js';
import * as _history  from './commands/history.js';
import * as _uninstall from './commands/uninstall.js';
import * as _git      from './commands/git.js';
import * as _code     from './commands/code.js';
import * as _agent    from './commands/agent.js';
import * as _mcp      from './commands/mcp.js';
import * as _context  from './commands/context.js';
import * as _memory   from './commands/memory.js';
import { getToken, getBase, apiGet, apiPost } from './lib/denApi.js';
import { banner, setLiveLogsEnabled, getLiveLogsEnabled } from './lib/colors.js';
import { stashAdd, stashList, stashRm, stashClear } from './lib/stash.js';

loadTheme();

const LOCAL_ENGINE_MISSING = 'Local engine missing. Run asyncat install --local-engine, set LLAMA_BINARY_PATH, or choose /provider for Ollama, LM Studio, or cloud.';

function localEngineErrorMessage(message) {
  const text = String(message || '');
  if (/MISSING_ENGINE|llama-server binary not found|Local engine missing/i.test(text)) {
    return LOCAL_ENGINE_MISSING;
  }
  return text;
}

function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'cli/package.json'), 'utf8'));
    return pkg.version || '0.4.0';
  } catch { return '0.4.0'; }
}

// ── Test provider connection directly (before backend restart) ──────────────
async function testProviderConnection(providerType, apiKey, model, baseUrl) {
  const isAnthropic = baseUrl.includes('anthropic.com');
  const headers = { 'Content-Type': 'application/json' };
  if (isAnthropic) {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const authFailed = s => s === 401 || s === 403;

  // Step 1: try lightweight GET /models
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (authFailed(res.status)) return { ok: false, msg: 'Auth failed — check your API key' };
    if (res.ok) return { ok: true, msg: 'Connected' };
    // 404 = provider doesn't have /models, fall through to chat ping
    if (res.status !== 404) return { ok: false, msg: `Server returned ${res.status}` };
  } catch (e) {
    if (e.name === 'TimeoutError' || e.code === 'UND_ERR_CONNECT_TIMEOUT') return { ok: false, msg: 'Connection timed out' };
    return { ok: false, msg: `Cannot reach ${baseUrl}` };
  }

  // Step 2: /models not found — do a minimal chat completion as auth check
  try {
    const body = isAnthropic
      ? JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] })
      : JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST', headers,
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (authFailed(res.status)) return { ok: false, msg: 'Auth failed — check your API key' };
    if (res.ok || res.status === 400) return { ok: true, msg: 'Connected' }; // 400 = bad request but auth passed
    return { ok: false, msg: `Server returned ${res.status}` };
  } catch (e) {
    if (e.name === 'TimeoutError' || e.code === 'UND_ERR_CONNECT_TIMEOUT') return { ok: false, msg: 'Connection timed out' };
    return { ok: false, msg: `Cannot reach ${baseUrl}` };
  }
}

// ── ChatGPT Plus/Pro OAuth (PKCE) ────────────────────────────────────────────
async function doChatGPTOAuth(tui) {
  const http = await import('http');
  const { openSync } = await import('./lib/open.js').catch(() => ({ openSync: null }));

  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = 'http://localhost:59012/callback';
  const clientId = 'app_EMoamEEZ73f0CkXaXp7hrann';

  const authUrl = `https://auth.openai.com/oauth/authorize?` +
    `client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=openid+email+profile+offline_access+model.read+model.request+organization.read+organization.write` +
    `&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

  tui.printInfo('Opening browser for ChatGPT login...');
  try {
    const { exec } = await import('child_process');
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${opener} "${authUrl}"`);
  } catch {}
  tui.printInfo(`Or open manually: ${authUrl.slice(0, 60)}...`);

  return new Promise((resolve) => {
    const timer = setTimeout(() => { server.close(); resolve(null); }, 120000);
    const server = http.default.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost:59012');
        if (url.pathname !== '/callback') { res.end(); return; }
        const code = url.searchParams.get('code');
        if (!code) { res.end('No code'); resolve(null); return; }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:sans-serif;padding:2rem"><h2>✔ Logged in — return to asyncat</h2></body></html>');
        server.close();
        clearTimeout(timer);

        const tokenRes = await fetch('https://auth.openai.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code', code,
            redirect_uri: redirectUri, client_id: clientId,
            code_verifier: verifier,
          }),
        });
        const data = await tokenRes.json();
        resolve(data.access_token || null);
      } catch (e) { server.close(); clearTimeout(timer); resolve(null); }
    });
    server.listen(59012);
  });
}

// ── Detect model info ───────────────────────────────────────────────────────
function providerDisplayName(config = {}) {
  const id = config.provider_id || config.providerId || '';
  const names = {
    'llamacpp-builtin': 'llama.cpp',
    ollama: 'Ollama',
    lmstudio: 'LM Studio',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
    minimax: 'MiniMax',
    'minimax-cn': 'MiniMax CN',
    groq: 'Groq',
    openrouter: 'OpenRouter',
    azure: 'Azure',
    custom: 'Custom',
  };
  return names[id] || id || config.provider_type || 'provider';
}

async function detectModel() {
  try {
    const token = await getToken();
    const base  = getBase();
    let localStatus = null;
    try {
      const statusRes = await fetch(`${base}/api/ai/providers/server/status`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(1200),
      });
      if (statusRes.ok) localStatus = await statusRes.json();
    } catch {}

    const res = await fetch(`${base}/api/ai/providers/config`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      const isLocal = data.provider_type === 'local';
      const isBuiltin = data.provider_id === 'llamacpp-builtin';
      const localState = isBuiltin ? (localStatus?.status || 'idle') : null;
      const loadingPrefix = localState === 'loading' ? 'loading ' : '';
      if (isBuiltin && localState !== 'ready') {
        return {
          model: localStatus?.model || data.model || '',
          provider: `${loadingPrefix}local · ${providerDisplayName(data)} · ${localState}`,
          context: {
            ctxSize: localStatus?.ctxSize || null,
            ctxTrain: localStatus?.ctxTrain || null,
          },
        };
      }
      const mode = isLocal ? 'local' : (data.provider_type === 'cloud' ? 'cloud' : 'custom');
      const tools = data.supports_tools ? ' · tools' : '';
      return {
        model: (isBuiltin ? localStatus?.model : data.model) || data.model || 'default',
        provider: `${mode} · ${providerDisplayName(data)}${isBuiltin ? ` · ${localState}` : ''}${tools}`,
        context: isBuiltin ? {
          ctxSize: localStatus?.ctxSize || null,
          ctxTrain: localStatus?.ctxTrain || null,
        } : {},
      };
    }
  } catch {}
  return { model: '', provider: '', context: {} };
}

// ── Auto-start all services on TUI launch ──────────────────────────────────
async function autoStartServices(tui) {
  if (!fs.existsSync(path.join(ROOT, 'den/.env')))         return;
  if (!fs.existsSync(path.join(ROOT, 'den/node_modules'))) return;

  const checkBe = () => fetch('http://localhost:8716/health', { signal: AbortSignal.timeout(700) }).then(r => r.ok).catch(() => false);
  const checkFe = () => fetch('http://localhost:8717',        { signal: AbortSignal.timeout(700) }).then(() => true).catch(() => false);

  let [beUp, feUp] = await Promise.all([checkBe(), checkFe()]);

  if (!beUp) { tui.logStartup('→', 'Starting backend...'); _start.run(['--backend-only']); }
  if (!feUp) { tui.logStartup('→', 'Starting frontend...'); _start.run(['--frontend-only']); }

  if (beUp && feUp) {
    const { model, provider, context } = await detectModel();
    tui.setModel(model, provider, context);
    tui._startupLog = [];
    tui.render();
    return;
  }

  // Poll until both services are up (max ~40 s)
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const [nowBe, nowFe] = await Promise.all([
      beUp ? Promise.resolve(true) : checkBe(),
      feUp ? Promise.resolve(true) : checkFe(),
    ]);
    if (!beUp && nowBe) { tui.logStartup('✔', 'Backend ready'); beUp = true; }
    if (!feUp && nowFe) { tui.logStartup('✔', 'Frontend ready'); feUp = true; }
    if (beUp && feUp) break;
  }

  if (!beUp) tui.logStartup('✖', 'Backend timed out — /start or /doctor');

  const { model, provider, context } = await detectModel();
  tui.setModel(model, provider, context);
  // Clear startup log a moment after everything is ready
  setTimeout(() => { tui._startupLog = []; tui.render(); }, 3000);
}

// ── TUI Mode (default — interactive) ────────────────────────────────────────
async function startTui() {
  // Print startup progress BEFORE TUI starts (so messages aren't cleared by alternate screen)
  console.log('\x1b[36m[asyncat]\x1b[0m Starting up...');

  // Step 1: Check if backend is already running
  let backendUp = false;
  try {
    console.log('\x1b[36m[asyncat]\x1b[0m Checking backend health...');
    const res = await fetch('http://localhost:8716/health', {
      signal: AbortSignal.timeout(1000),
    });
    backendUp = res.ok;
  } catch {
    console.log('\x1b[33m[asyncat]\x1b[0m Backend not running, will start it...');
  }
  if (backendUp) console.log('\x1b[32m[asyncat]\x1b[0m Backend is already running');

  // Now create and start TUI
  const tui = new Tui({
    modelInfo: '',
    providerInfo: '',
    version: getVersion(),
  });
  tui.start();
  tui.setServicesStarting(true);

  // Start services with live TUI feedback; detectModel is called inside once both are up.
  autoStartServices(tui).catch(e => tui.printWarn(`Startup: ${e.message}`));

  // Wire events immediately so Ctrl+C and other keys work during startup.
  // Function declarations below are hoisted, so these closures are safe.
  tui.on('command', (cmd, args) => dispatch(cmd, args));
  tui.on('input', (text) => handleAiInput(text));
  let exiting = false;
  const cleanupAndExit = (code = 0) => {
    if (exiting) return;
    exiting = true;
    stopAll();
    tui.destroy();
    process.exit(code);
  };
  tui.on('exit', () => cleanupAndExit(0));
  process.once('SIGINT', () => cleanupAndExit(130));
  process.once('SIGTERM', () => cleanupAndExit(143));
  process.once('SIGHUP', () => cleanupAndExit(129));
  process.once('uncaughtException', (err) => {
    tui.destroy();
    console.error(err);
    stopAll();
    process.exit(1);
  });

  console.log('\x1b[32m[asyncat]\x1b[0m Ready! Starting TUI...\n');

  // ── Helper: run a command in normal terminal, then return to TUI ───────
  function runInShell(fn) {
    return new Promise(async (resolve) => {
      tui.destroy();
      // Clear the main screen so old output doesn't stack
      process.stdout.write('\x1b[2J\x1b[H');

      try {
        await fn();
      } catch (e) {
        console.log(`\n  \x1b[31m✖\x1b[0m  ${e.message}\n`);
      }

      console.log(`\n  \x1b[2mPress any key to return to asyncat...\x1b[0m`);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        tui.start();
        resolve();
      });
    });
  }

  // ── Command dispatch ──────────────────────────────────────────────────
  // Helper: capture console output from a sync/async fn → result popup
  async function runInline(title, fn) {
    tui.startCapture();
    try { await fn(); } catch (e) { console.log(`Error: ${e.message}`); }
    const lines = tui.endCapture();
    tui.showResult(title, lines.length ? lines : ['(no output)']);
    tui.unlockInput();
  }

  async function dispatch(cmd, args = []) {
    tui.lockInput();
    logger.commands.info(`dispatch: ${cmd} ${args.join(' ')}`.trim());

    // Commands that are capture-able: run inline, show output in result popup
    const inlineCommands = {
      'status': () => runInline('Service Status', () => _status.run()),
      'ps':     () => runInline('Service Status', () => _status.run()),
      'version':() => runInline('Version', () => _version.run()),
      'v':      () => runInline('Version', () => _version.run()),
      'doctor': () => runInline('Doctor', () => _doctor.run()),
      'context':() => runInline('Context', () => _context.run()),
      'config': () => runInline('Config', () => _config.run(args)),
    };

    if (inlineCommands[cmd]) {
      await inlineCommands[cmd]();
      return;
    }

    // Commands that still need the full terminal (interactive / spawning editors / processes)
    const shellCommands = [
      'install', 'setup', 'onboard', 'snippets', 'update', 'uninstall', 'logs',
      'code', 'git',
    ];

    if (shellCommands.includes(cmd)) {
      await runInShell(async () => {
        switch (cmd) {
          case 'install': case 'setup': await _install.run(args); break;
          case 'onboard': await _onboard.run(); break;
          case 'snippets': await _snippets.run(args); break;
          case 'update':   _update.run(); break;
          case 'uninstall': _uninstall.run(); break;
          case 'logs':     _logs.run(args); break;
          case 'code':     _code.run(args); break;
          case 'git':      _git.run(args); break;
        }
      });
      tui.unlockInput();
      return;
    }

    try {
      switch (cmd) {
        // ── Models: TUI models page ────────────────────────────────────────────
        case 'models': {
          if (args.length > 0) {
            await runInShell(() => _models.run(args));
            const { model: m, provider: p, context: c } = await detectModel();
            tui.setModel(m, p, c);
            tui.unlockInput();
            return;
          }
          tui.unlockInput();
          await tui.showModelsPage();
          return;
        }

        case 'ctx': {
          tui.unlockInput();
          const size = parseInt(args[0], 10);
          if (!Number.isFinite(size) || size < 512) {
            const status = await apiGet('/api/ai/providers/server/status').catch(() => null);
            const current = status?.ctxSize ? `current ${status.ctxSize}` : 'current unknown';
            const metadata = status?.ctxTrain ? `, metadata ${status.ctxTrain}` : '';
            tui.printInfo(`Usage: /ctx <tokens>  (${current}${metadata})`);
            return;
          }

          const status = await apiGet('/api/ai/providers/server/status');
          const filename = status.model_file || status.model;
          if (!filename || status.status === 'idle') {
            tui.printWarn('No local model is loaded. Use /models first.');
            return;
          }

          const target = size;
          if (status.ctxTrain && size > status.ctxTrain) {
            tui.printWarn(`Requested context exceeds metadata (${status.ctxTrain}); trying ${target} anyway.`);
          }
          tui.printInfo(`Restarting ${filename} with ctx ${target}...`);
          await apiPost('/api/ai/providers/server/start', { filename, ctxSize: target });

          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const next = await apiGet('/api/ai/providers/server/status').catch(() => null);
            if (!next) continue;
            if (next.status === 'ready') {
              tui.setModel(next.model_file || next.model || filename, 'local', {
                ctxSize: next.ctxSize || target,
                ctxTrain: next.ctxTrain || status.ctxTrain || null,
              });
              tui.printOk(`Context active: ${next.ctxSize || target}${next.ctxTrain ? ` / metadata ${next.ctxTrain}` : ''}`);
              return;
            }
            if (next.status === 'error') {
              tui.printErr(next.error || 'Model failed to restart with that context size.');
              return;
            }
          }
          tui.printWarn('Still loading. Run /ctx again to check current status.');
          return;
        }

        // ── Theme: inline TUI selector ──────────────────────────────────
        case 'theme': {
          tui.unlockInput();
          const originalTheme = getThemeName();
          const themeItems = THEME_NAMES.map(n => ({
            name: n,
            desc: n === originalTheme ? 'current' : 'preview',
          }));
          const chosen = await tui.showSelector('Select Theme', themeItems, {
            onHighlight: item => item?.name && setThemePreview(item.name),
            onCancel: () => setThemePreview(originalTheme),
          });
          if (chosen) {
            setTheme(chosen.name);
            tui.printOk(`Theme: ${chosen.name}`);
          } else {
            setThemePreview(originalTheme);
          }
          tui.render();
          return;
        }

        // ── Quick commands ───────────────────────────────────────────────
        case 'open':
        case 'o':
          _open.run();
          tui.printOk('Opening web UI → http://localhost:8717');
          break;
        case 'db':
          await _db.run(args);
          break;
        case 'history':
          _history.run(args);
          break;
        case 'stash':
          handleStash(args.length ? args : ['list'], tui);
          break;
        case 'live-logs':
          handleLiveLogs(args, tui);
          break;
        case 'undo':
          try {
            const data = await apiPost('/api/agent/checkpoints/restore', { id: args[0] || null });
            tui.printOk(`Restored checkpoint ${data.checkpoint?.id || ''}`);
          } catch (e) {
            tui.printWarn(`Undo failed: ${e.message}`);
          }
          break;
        case 'checkpoints':
          try {
            const data = await apiGet('/api/agent/checkpoints');
            const cps = data.checkpoints || [];
            if (!cps.length) { tui.printInfo('No checkpoints yet.'); break; }
            tui.showResult('Checkpoints', cps.map(cp => `${cp.id}  ${cp.kind}  ${cp.workspace}  ${cp.createdAt}`));
          } catch (e) {
            tui.printWarn(`Checkpoints: ${e.message}`);
          }
          break;
        case 'full-control':
        case 'fc':
          tui._fullControl = !tui._fullControl;
          tui.print(tui._fullControl
            ? '  Full-control ON — tool permission requests auto-approve'
            : '  Full-control OFF — tool permission requests require approval');
          tui.render();
          break;
        case 'chat': {
          // Toggle between direct chat (fast, single LLM call) and agent (multi-step, tools)
          tui._chatMode = !tui._chatMode;
          tui.print(tui._chatMode
            ? '  Chat mode ON — messages go directly to the LLM (fast, no tools)'
            : '  Agent mode ON — messages run through the ReAct agent loop (tools enabled)');
          tui.render();
          break;
        }
        case 'log':
        case 'logs': {
          tui.unlockInput();
          const log = tui._agentLog;
          if (!log.length) {
            tui.printInfo('No tool calls yet this session.');
            return;
          }
          const lines = [];
          for (const entry of log) {
            const icon = entry.success === false ? '✘' : entry.success === true ? '✔' : '…';
            const ts = entry.ts ? entry.ts.slice(11, 19) : '';
            lines.push(`${icon}  ${entry.tool}  ${ts}${entry.round != null ? `  round ${entry.round}` : ''}`);
            if (Object.keys(entry.args || {}).length) {
              lines.push(`   args: ${JSON.stringify(entry.args).slice(0, 120)}`);
            }
            lines.push('');
            const outLines = (entry.output || '').split('\n');
            for (const l of outLines) lines.push(`   ${l}`);
            lines.push('');
            lines.push('─'.repeat(52));
            lines.push('');
          }
          tui.showResult(`Tool Log  (${log.length} calls)`, lines);
          return;
        }
case 'tools': {
          tui.unlockInput();
          try {
            const token = await getToken();
            const base = getBase();
            const data = await fetch(`${base}/api/agent/tools`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.json());

            const tools = data.tools || [];
            const byCategory = {};
            for (const t of tools) {
              const cat = t.category || 'general';
              if (!byCategory[cat]) byCategory[cat] = [];
              byCategory[cat].push(t);
            }

            const permIcon = p => p === 'safe' ? '●' : p === 'moderate' ? '◐' : '○';
            const lines = [
              `${tools.length} tools registered  (● safe  ◐ moderate  ○ dangerous)`,
              '',
            ];
            for (const [cat, catTools] of Object.entries(byCategory).sort()) {
              lines.push(`── ${cat} ${'─'.repeat(Math.max(0, 44 - cat.length))}`);
              for (const t of catTools.sort((a, b) => a.name.localeCompare(b.name))) {
                const icon = permIcon(t.permission);
                const name = t.name.padEnd(26);
                const desc = (t.description || '').slice(0, 50);
                lines.push(`  ${icon}  ${name} ${desc}`);
              }
              lines.push('');
            }
            lines.push('Tools are called automatically by the agent during tasks.');
            lines.push('Use /skills to browse task-template brain skills instead.');
            tui.showResult(`Agent Tools  (${tools.length})`, lines);
          } catch (e) {
            tui.printErr(`Could not load tools: ${e.message}`);
          }
          return;
        }

        // ── Skills: inline searchable selector ──────────────────────────
        case 'skills': {
          tui.unlockInput();
          const allSkills = _skills.listSkills ? _skills.listSkills() : [];
          if (!allSkills.length) {
            tui.printWarn('No skills found in skills/ directory.');
            return;
          }
          const skillItems = allSkills.map(s => ({
            name: s.name,
            desc: `[${(s.brain_region || '?').slice(0, 11)}]  ${(s.description || '').slice(0, 58)}`,
            _skill: s,
          }));
          const chosenSkill = await tui.showSelector('Skills  (Cerebellum)', skillItems);
          if (!chosenSkill) return;
          // Show skill details in result popup
          const skillDetail = _skills.loadSkill ? _skills.loadSkill(chosenSkill.name) : null;
          const detailLines = [
            `Name:         ${chosenSkill.name}`,
            `Brain Region: ${chosenSkill._skill?.brain_region || 'unknown'}`,
            `Tags:         ${chosenSkill._skill?.tags || 'none'}`,
            '',
            `${skillDetail?.frontmatter?.description || ''}`,
            '',
            '─'.repeat(48),
            '',
            ...(skillDetail?.body?.split('\n').slice(0, 40) || ['(no body)']),
          ];
          tui.showResult(`Skill: ${chosenSkill.name}`, detailLines);
          return;
        }

        // ── Sessions: inline selector, select to load into chat ─────────
        case 'sessions': {
          tui.unlockInput();
          try {
            const token = await getToken();
            const base = getBase();
            const data = await fetch(`${base}/api/ai/chats?limit=50`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.json());
            const convos = data.conversations || [];
            if (!convos.length) {
              tui.printInfo('No sessions yet. Start chatting to create one.');
              return;
            }
            const relTime = iso => {
              const d = Date.now() - new Date(iso).getTime();
              const m = Math.floor(d / 60000), hr = Math.floor(m / 60), dy = Math.floor(hr / 24);
              return dy > 0 ? `${dy}d ago` : hr > 0 ? `${hr}h ago` : m > 0 ? `${m}m ago` : 'just now';
            };
            const sessionItems = convos.map(c => ({
              name: (c.title || '(no title)').slice(0, 42),
              desc: `${relTime(c.last_message_at || c.created_at)}  ·  ${c.message_count || 0} msgs`,
              _id: c.id,
            }));
            const chosen = await tui.showSelector('Sessions', sessionItems);
            if (!chosen) return;
            // Try to load the conversation messages
            try {
              const conv = await fetch(`${base}/api/ai/chats/${chosen._id}`, {
                headers: { Authorization: `Bearer ${token}` },
              }).then(r => r.json());
              const msgs = (conv.messages || conv.conversation?.messages || [])
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({ role: m.role, content: m.content || '' }));
              if (msgs.length) {
                tui.messages = msgs;
                tui.conversationId = chosen._id;
                tui.mode = 'chat';
                tui.render();
                tui.printOk(`Loaded: ${chosen.name}`);
              } else {
                tui.printWarn('Could not load messages for this session.');
              }
            } catch { tui.printWarn('Failed to load session messages.'); }
          } catch (e) { tui.printErr(`Sessions: ${e.message}`); }
          return;
        }

        // ── MCP: inline list + add/rm without leaving TUI ───────────────
        case 'mcp': {
          if (!args.length || args[0] === 'list') {
            tui.unlockInput();
            tui.startCapture();
            await _mcp.run(['list']);
            tui.showResult('MCP Servers', tui.endCapture());
          } else {
            tui.startCapture();
            await _mcp.run(args);
            const lines = tui.endCapture();
            tui.showResult(`MCP: ${args[0]}`, lines.length ? lines : ['Done.']);
            tui.unlockInput();
          }
          return;
        }

        // ── Provider: show setup wizard ─────────────────────────────────────
        case 'provider': {
          if (!args.length || args[0] === 'set' || args[0] === 'list' || args[0] === 'show') {
            tui.unlockInput();
            const result = await tui.showProviderSetup();
            if (!result) {
              tui.unlockInput();
              return;
            }
            if (result.providerType === 'ollama') {
              setKey('den/.env', 'AI_BASE_URL', 'http://localhost:11434/v1');
              setKey('den/.env', 'AI_API_KEY', '');
              setKey('den/.env', 'AI_MODEL', 'ollama');
              setKey('den/.env', 'AI_PROVIDER_TYPE', 'local');
            } else if (result.providerType === 'lmstudio') {
              setKey('den/.env', 'AI_BASE_URL', 'http://localhost:1234/v1');
              setKey('den/.env', 'AI_API_KEY', '');
              setKey('den/.env', 'AI_MODEL', 'lmstudio');
              setKey('den/.env', 'AI_PROVIDER_TYPE', 'local');
            } else if (result.providerType === 'copilot') {
              setKey('den/.env', 'AI_BASE_URL', 'http://localhost:4141/v1');
              setKey('den/.env', 'AI_API_KEY', 'copilot');
              setKey('den/.env', 'AI_MODEL', 'gpt-4o');
              setKey('den/.env', 'AI_PROVIDER_TYPE', 'cloud');
              tui.printInfo('Testing GitHub Copilot proxy at localhost:4141...');
              const test = await testProviderConnection('copilot', 'copilot', 'gpt-4o', 'http://localhost:4141/v1');
              if (test.ok) {
                tui.printOk('GitHub Copilot connected via local proxy');
              } else {
                tui.printWarn('Proxy not running. Set it up once with these steps:');
                tui.printInfo('  1. npx copilot-api@latest auth   (login with GitHub)');
                tui.printInfo('  2. npx copilot-api@latest start  (run in a separate terminal)');
                tui.printInfo('  3. /provider  →  GitHub Copilot  (connect again)');
              }
            } else if (result.providerType === 'chatgpt') {
              const token = await doChatGPTOAuth(tui);
              if (token) {
                setKey('den/.env', 'AI_BASE_URL', 'https://api.openai.com/v1');
                setKey('den/.env', 'AI_API_KEY', token);
                setKey('den/.env', 'AI_MODEL', 'gpt-4o');
                setKey('den/.env', 'AI_PROVIDER_TYPE', 'cloud');
                tui.printOk('ChatGPT login successful');
              } else {
                tui.printErr('Login cancelled or failed');
              }
            } else {
              const baseUrl = result.baseUrl || PROVIDER_DEFAULTS[result.providerType]?.baseUrl || '';
              const model = result.model || PROVIDER_DEFAULTS[result.providerType]?.model || '';
              setKey('den/.env', 'AI_BASE_URL', baseUrl);
              setKey('den/.env', 'AI_API_KEY', result.apiKey);
              setKey('den/.env', 'AI_MODEL', model);
              setKey('den/.env', 'AI_PROVIDER_TYPE', 'cloud');
              tui.printInfo(`Testing connection to ${result.providerType}...`);
              const test = await testProviderConnection(result.providerType, result.apiKey, model, baseUrl);
              if (test.ok) {
                tui.printOk(`Connected to ${result.providerType} — ${model}`);
              } else {
                tui.printErr(`${result.providerType}: ${test.msg}`);
                tui.printWarn('Settings saved anyway. Fix the key and run /provider again.');
              }
            }
            const { model: m, provider: p, context: c } = await detectModel();
            tui.setModel(m, p, c);
            tui.unlockInput();
          } else {
            await runInShell(() => _provider.run(args));
            const { model: m, provider: p, context: c } = await detectModel();
            tui.setModel(m, p, c);
            tui.unlockInput();
          }
          return;
        }
        case 'new':
          tui.clearMessages();
          tui.printOk('New session started');
          break;
        case 'memory': {
          tui.unlockInput();
          const sub  = args[0];
          const rest = args.slice(1).join(' ');

          if (sub === 'show' || sub === 'get') {
            if (!rest) { tui.printWarn('Usage: /memory show <key>'); return; }
            try {
              const token = await getToken();
              const base = getBase();
              const res = await fetch(`${base}/api/agent/memory/${encodeURIComponent(rest)}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) { tui.printWarn(`No memory found: ${rest}`); return; }
              const data = await res.json();
              const m = data.memory;
              tui.print('');
              tui.print(`━━ Memory: ${m.key || rest} ━━`);
              tui.print(`  kind=${m.kind || m.memory_type || 'fact'}  importance=${Number(m.importance ?? 0.5).toFixed(2)}  access=${m.access_count || 0}`);
              if (Array.isArray(m.tags) && m.tags.length) tui.print(`  tags=${m.tags.join(', ')}`);
              tui.print('');
              for (const line of String(m.content || '').split('\n')) tui.print(`  ${line}`);
              tui.print('');
            } catch { tui.printWarn('Backend not reachable'); }
            return;
          }

          if (sub === 'rm' || sub === 'delete' || sub === 'forget') {
            // /memory rm <key>
            if (!rest) { tui.printWarn('Usage: /memory rm <key>'); return; }
            try {
              await getToken();
              const base = getBase();
              const token = await getToken();
              const res = await fetch(`${base}/api/agent/memory`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ key: rest }),
              });
              if (res.ok) tui.printOk(`Forgotten: ${rest}`);
              else tui.printWarn(`Could not delete: ${rest}`);
            } catch { tui.printWarn('Backend not reachable'); }
            return;
          }

          // /memory [search query] or /memory alone = list all
          try {
            const token = await getToken();
            const base = getBase();
            const url = sub
              ? `${base}/api/agent/memory?q=${encodeURIComponent(args.join(' '))}`
              : `${base}/api/agent/memory`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) { tui.printWarn('Could not fetch memories'); return; }
            const data = await res.json();
            const mems = data.memories || data;
            if (!mems || mems.length === 0) {
              tui.print('');
              tui.print('  No memories stored yet.');
              tui.print('  The agent stores memories automatically as you work.');
              tui.print('  You can also ask: "remember that I prefer TypeScript"');
              tui.print('');
              return;
            }
            tui.print('');
            tui.print(`━━ Stored Memories  (${mems.length}) ━━`);
            tui.print('');
            for (const m of mems) {
              const kind = m.kind || m.memory_type || 'fact';
              const tags = Array.isArray(m.tags) && m.tags.length ? `  #${m.tags.join(' #')}` : '';
              tui.print(`  ${m.key || '-'}  [${kind}]${tags}`);
              tui.print(`    importance=${Number(m.importance ?? 0.5).toFixed(2)}  access=${m.access_count || 0}  updated=${m.updated_at || 'unknown'}`);
              if (m.last_accessed_at) tui.print(`    last accessed=${m.last_accessed_at}`);
              tui.print(`    ${(m.content || '').slice(0, 120)}`);
            }
            tui.print('');
            tui.print('  /memory rm <key>   to delete a memory');
            tui.print('  /memory <query>    to search memories');
            tui.print('');
          } catch { tui.printWarn('Backend not reachable'); }
          return;
        }
        case 'cron':
        case 'schedule': {
          tui.unlockInput();
          const cronSub  = args[0];
          const cronRest = args.slice(1).join(' ');

          try {
            const token = await getToken();
            const base  = getBase();

            if (cronSub === 'ls' || cronSub === 'list' || !cronSub) {
              const data = await apiGet('/api/agent/schedule');
              const jobs = data.jobs || [];
              if (jobs.length === 0) {
                tui.print('');
                tui.print('  No scheduled jobs yet.');
                tui.print('  Create one:  /cron add "name" "goal" interval:3600000');
                tui.print('  Formats: interval:<ms>  once:<ms>  daily:HH:MM  hourly  at:<ISO>');
                tui.print('');
              } else {
                tui.print('');
                tui.print(`━━ Scheduled Jobs (${jobs.length}) ━━`);
                for (const j of jobs) {
                  const status = j.enabled ? '▶' : '⏸';
                  const next   = j.next_run_at ? new Date(j.next_run_at).toLocaleString() : '—';
                  tui.print(`  ${status} [${j.id.slice(0,8)}]  ${j.name}`);
                  tui.print(`       goal: ${j.goal.slice(0, 60)}`);
                  tui.print(`       schedule: ${j.schedule}  next: ${next}  runs: ${j.run_count}`);
                }
                tui.print('');
                tui.print('  /cron rm <id>      delete job');
                tui.print('  /cron off <id>     disable');
                tui.print('  /cron on <id>      enable');
                tui.print('');
              }
            } else if (cronSub === 'add' || cronSub === 'new' || cronSub === 'create') {
              // /cron add "name" "goal text here" interval:3600000
              const match = cronRest.match(/^"([^"]+)"\s+"([^"]+)"\s+(\S+)/) || cronRest.match(/^(\S+)\s+"([^"]+)"\s+(\S+)/);
              if (!match) {
                tui.printWarn('Usage: /cron add "name" "goal" <schedule>');
                tui.printInfo('  schedule: interval:<ms> | once:<ms> | daily:HH:MM | hourly | at:<ISO>');
              } else {
                const [, jobName, jobGoal, jobSchedule] = match;
                const res = await fetch(`${base}/api/agent/schedule`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ name: jobName, goal: jobGoal, schedule: jobSchedule }),
                });
                const data = await res.json();
                if (data.success) {
                  tui.printOk(`Scheduled "${jobName}" (${data.job.id.slice(0,8)}) — ${jobSchedule}`);
                } else {
                  tui.printErr(data.error || 'Failed to create job');
                }
              }
            } else if (cronSub === 'rm' || cronSub === 'delete' || cronSub === 'del') {
              const id = cronRest.trim();
              if (!id) { tui.printWarn('Usage: /cron rm <job-id>'); } else {
                const res = await fetch(`${base}/api/agent/schedule/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                data.success ? tui.printOk(`Deleted job ${id}`) : tui.printErr(data.error);
              }
            } else if (cronSub === 'off' || cronSub === 'disable') {
              const id = cronRest.trim();
              await fetch(`${base}/api/agent/schedule/${id}/disable`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
              tui.printOk(`Job ${id} paused`);
            } else if (cronSub === 'on' || cronSub === 'enable') {
              const id = cronRest.trim();
              await fetch(`${base}/api/agent/schedule/${id}/enable`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
              tui.printOk(`Job ${id} enabled`);
            } else {
              tui.printWarn(`Unknown subcommand. Try: /cron list | add | rm | on | off`);
            }
          } catch (e) { tui.printErr(e.message); }
          return;
        }

        case 'screen': {
          tui.unlockInput();
          const screenSub = args[0];
          try {
            const token = await getToken();
            const base  = getBase();

            if (!screenSub || screenSub === 'help') {
              tui.print('');
              tui.print('━━ Screen Controller ━━');
              tui.print('  The agent can see and control your screen.');
              tui.print('  Required tools: scrot + xdotool + tesseract-ocr (Linux)');
              tui.print('');
              tui.print('  Ask the agent:');
              tui.print('    "Take a screenshot and tell me what you see"');
              tui.print('    "Click on the button at position 500, 300"');
              tui.print('    "Type hello world in the current window"');
              tui.print('    "Press Ctrl+S to save"');
              tui.print('    "Find the terminal window"');
              tui.print('');
              tui.print('  Or install tools:');
              tui.print('    sudo apt install scrot xdotool tesseract-ocr');
              tui.print('');
            } else if (screenSub === 'shot' || screenSub === 'screenshot') {
              tui.printInfo('Taking screenshot via agent...');
              tui.emit('input', 'Take a screenshot of the current screen and tell me what you see');
            } else {
              tui.emit('input', args.join(' '));
            }
          } catch (e) { tui.printErr(e.message); }
          return;
        }

        case 'help':
        case '?':
          tui.showResult('asyncat  —  help', [
            '── Basics ───────────────────────────────────────────────',
            '  Type anything       Send goal to AI agent (or direct chat if /chat is on)',
            '  /                   Open command palette (browse all)',
            '  esc                 Clear focus → clear input → back → exit',
            '',
            '── Keyboard shortcuts ───────────────────────────────────',
            '  Ctrl+P              Open command palette',
            '  Ctrl+F              Toggle full-control mode (no permission prompts)',
            '  Ctrl+Y              Copy last AI response to clipboard',
            '  Ctrl+M              Toggle mouse tracking (off = drag-to-select)',
            '  Ctrl+L              Refresh / redraw screen',
            '  Ctrl+U              Delete to start of line',
            '  Ctrl+K              Delete to end of line',
            '',
            '── Scrolling ────────────────────────────────────────────',
            '  PgUp / PgDn         Scroll messages up / down',
            '  ↑ / ↓               Command history (when input not empty)',
            '  Mouse wheel         Scroll messages',
            '',
            '── Tool call log (inline) ───────────────────────────────',
            '  Tab                 Focus tool calls — cycle newest → oldest',
            '  Enter               Expand / collapse focused tool call inline',
            '  Esc                 Return focus to input',
            '  /log                Open full scrollable tool call log overlay',
            '',
            '── Commands ─────────────────────────────────────────────',
            '  /skills             Browse all brain skills (searchable)',
            '  /ctx <tokens>       Restart local model with a new context size',
            '  /tools              All registered tools grouped by category (live count)',
            '  /log                Full tool call log — output, errors, args',
            '  /memory             Search agent memories',
            '  /models             Switch or pull AI models',
            '  /provider           Configure AI provider',
            '  /sessions           Browse & reload past conversations',
            '  /cron               Schedule recurring tasks',
            '  /mcp                Manage MCP servers',
            '  /git                Git status, branches, commits',
            '  /status             Running services status',
            '  /live-logs          Toggle live log sidebar',
            '  /theme              Switch color theme',
            '  /open               Open web UI (localhost:8717)',
            '  /new                Start fresh session',
            '  /help               Show this',
            '',
            '── Full-control mode ─────────────────────────────────────',
            '  /chat               Toggle chat mode (fast, no tools) vs agent mode (ReAct loop)',
            '  Ctrl+F or /fc to toggle. When ON (⚡ shown in status bar):',
            '  · All tool calls auto-approved — no permission prompts',
            '  · Agent can run shell commands, write files, etc. freely',
            '  · Resets when you restart the CLI',
            '',
            '── Brain regions ─────────────────────────────────────────',
            '  prefrontal          Planning, code review, decisions',
            '  cerebellum          45 bundled skills (muscle memory)',
            '  hippocampus         Memory — semantic + episodic',
            '  amygdala            Safety, permissions, error handling',
            '  basal-ganglia       Auto-learns patterns from your usage',
          ]);
          break;
        case 'clear':
          tui.clearMessages();
          break;
        case 'exit':
        case 'quit':
        case 'q':
          tui.destroy();
          stopAll();
          console.log('  bye ♡');
          process.exit(0);
          break;
        default:
          tui.printWarn(`Unknown: /${cmd}  — press / to browse commands`);
      }
    } catch (e) {
      tui.printErr(e.message);
    }

    tui.unlockInput();
  }

  // ── Handle AI input (plain text → agent) ──────────────────────────────
  async function handleAiInput(text) {
    // Guard: check if model/backend is available
    if (!tui.modelInfo || tui.modelInfo === 'no model' || !tui.modelInfo.trim()) {
      tui.addMessage('system', '⚠  No model loaded. Let\'s pick one!');

      // Try to get available models
      let models = [];
      try {
        await getToken();
        const localModels = await apiGet('/api/ai/providers/local-models');
        models = (localModels.models || []).map(m => ({
          name: m.filename,
          desc: m.sizeFormatted || '',
          sizeFormatted: m.sizeFormatted || 'Unknown',
          architecture: m.architecture || 'unknown',
          parameterCount: m.parameterCount || '',
          contextLength: m.contextLength || null,
          _file: m.filename,
        }));
      } catch (err) {
        const message = String(err?.message || '');
        if (/Auth failed|Authentication failed|401/.test(message)) {
          tui.printErr('Backend auth failed. den/.env SOLO_PASSWORD does not match the backend database user.');
          tui.printInfo('Sync the solo password, then try again.');
          return;
        }
        tui.printErr('Backend not running. Starting it...');
        _start.run(['--backend-only']);
        tui.printInfo('Waiting for backend... try again in a few seconds.');
        return;
      }

      if (models.length === 0) {
        tui.printWarn('No local models found.');
        tui.printInfo('Download one:  /models pull <url> <name.gguf>');
        tui.printInfo('Or configure cloud:  /provider');
        return;
      }

      const chosen = await tui.showSelector('Select a Model to Start', models);
      if (!chosen) { tui.printInfo('Cancelled. Type /models for more options.'); return; }

      const ctxSize = await tui.showModelSetup(chosen);
      if (!ctxSize) { tui.printInfo('Model load cancelled.'); return; }

      tui.printInfo(`Loading ${chosen.name} (ctx: ${ctxSize})...`);
      try {
        const token = await getToken();
        const base = getBase();
        await fetch(`${base}/api/ai/providers/server/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ filename: chosen._file, ctxSize: parseInt(ctxSize, 10) || 8192 }),
        });
        tui.printInfo(`Model ${chosen.name} is loading...`);
        let ready = false;
        for (let i = 0; i < 180; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const status = await apiGet('/api/ai/providers/server/status').catch(() => null);
          if (!status) continue;
          if (status.status === 'ready') {
            tui.printOk(`Model ${status.model || chosen.name} is ready.`);
            const { model: m, provider: p, context: c } = await detectModel();
            tui.setModel(m, p, c);
            ready = true;
            break;
          }
          if (status.status === 'error') {
            tui.printErr(localEngineErrorMessage(status.error || 'Model failed to load.'));
            return;
          }
        }
        if (!ready) {
          tui.printWarn('Model is still loading. Try again when the status becomes ready.');
          return;
        }
      } catch (e) {
        tui.printErr(`Failed: ${localEngineErrorMessage(e.message)}`);
        return;
      }
    }

    // Now send the message
    tui.addMessage('user', text);
    tui.lockInput();

    // Chat mode: single LLM call, fast. Agent mode: ReAct loop with tools.
    if (tui._chatMode) {
      tui.startStreaming('Thinking...');
      try {
        const token = await getToken();
        const base  = getBase();
        const controller = new AbortController();
        tui.setCancelStreaming(() => controller.abort());

        const history = tui.messages.slice(0, -1)
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }));

        const res = await fetch(`${base}/api/ai/unified-stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          body: JSON.stringify({ message: text, conversationHistory: history }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`Chat ${res.status}: ${body.slice(0, 100)}`);
        }

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let event;
            try { event = JSON.parse(line.slice(6).trim()); } catch { continue; }
            if (event.type === 'delta' && event.content) {
              tui.appendStreamContent(event.content);
              fullText += event.content;
            } else if (event.type === 'error') {
              tui.stopStreaming();
              tui.clearStreamContent();
              tui.printErr(event.message || 'Unknown error');
              tui.unlockInput();
              return;
            }
          }
        }

        tui.stopStreaming();
        tui.clearStreamContent();
        if (fullText) tui.addMessage('assistant', fullText);
      } catch (e) {
        if (e.name !== 'AbortError') tui.printErr(e.message);
        tui.stopStreaming();
        tui.clearStreamContent();
      }
      tui.unlockInput();
      return;
    }

    tui.startStreaming('Agent thinking...');

    try {
      const token = await getToken();
      const base  = getBase();
      const controller = new AbortController();
      tui.setCancelStreaming(() => controller.abort());

      // Prepare conversation history (exclude the current goal)
      const history = tui.messages.slice(0, -1).map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      }));

      const res = await fetch(`${base}/api/agent/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          goal: text,
          conversationHistory: history,
          workingDir: process.cwd(),
          maxRounds: 25,
          autoApprove: tui._fullControl,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Agent ${res.status}: ${body.slice(0, 100)}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';
      let fullAnswer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try {
            event = JSON.parse(line.slice(6).trim());
          } catch {
            continue;
          }
          await handleAgentEvent(tui, event, token, base);
          if (event.type === 'answer') fullAnswer = event.data?.answer || '';
        }
      }

      tui.stopStreaming();
      tui.clearStreamContent();
      
      if (fullAnswer) {
        tui.addMessage('assistant', fullAnswer);

        // Auto-save session
        try {
          fetch(`${base}/api/chats/autosave`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              messages: tui.messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
              mode: 'agent',
              conversationId: tui.conversationId || null,
            })
          }).then(r => r.json()).then(data => {
            if (data.success && data.conversation) {
              tui.conversationId = data.conversation.id;
            }
          }).catch(() => {});
        } catch (e) {}
      }
    } catch (e) {
      tui.stopStreaming();
      if (e.name === 'AbortError') {
        tui.printWarn('Agent run stopped.');
      } else if (e.message.includes('fetch failed') || e.message.includes('ECONNREFUSED')) {
        tui.printErr('Backend not reachable. Try /start or /doctor');
      } else {
        tui.printErr(e.message);
      }
    }

    tui.setCancelStreaming(null);
    tui.unlockInput();
  }

}

// ── Agent event handler ─────────────────────────────────────────────────────
async function handleAgentEvent(tui, event, token, base) {
  const { type, data } = event;
  switch (type) {
    case 'thinking':
      // Clear any leftover delta from previous round
      tui.clearStreamContent();
      tui.setStreamMsg(`Thinking (Round ${(data.round || 0) + 1})...`);
      if (data.thought) {
        tui.addMessage('thinking', data.thought, { round: (data.round || 0) + 1 });
      }
      break;
    case 'delta':
      if (data.content) {
        // Show all tokens including <think> content — users want to see generation
        tui.appendStreamContent(data.content);
      }
      break;
    case 'tool_start':
      tui.setStreamMsg(`Running ${data.tool}...`);
      tui.addMessage('tool', data.description || '', { tool: data.tool, success: null });
      break;
    case 'tool_result': {
      const isErr = data.result?.success === false;
      const raw = isErr
        ? (data.result?.error || data.result?.content || data.result?.message || 'Unknown error')
        : (data.result?.content || data.result?.message || '');
      const fullText = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
      const bounded = fullText.length > 250000 ? `${fullText.slice(0, 250000)}\n... [bounded in-memory scrollback truncated]` : fullText;
      tui.addMessage('tool', bounded, { tool: data.tool || 'tool', success: data.result?.success });
      // Store full entry in run log for /log viewer
      tui._agentLog.push({
        tool: data.tool || 'tool',
        args: data.args || {},
        success: data.result?.success,
        output: bounded,
        round: data.round,
        ts: new Date().toISOString(),
      });
      if (tui._agentLog.length > 200) tui._agentLog.splice(0, tui._agentLog.length - 200);
      break;
    }
    case 'done':
      tui.stopStreaming();
      break;
    case 'error':
      tui.stopStreaming();
      tui.printErr(data.message || 'Unknown agent error');
      break;
    case 'permission_request':
      await handlePermissionRequest(tui, data, token, base);
      break;
    case 'ask_user':
      await handleAskUser(tui, data, token, base);
      break;
    case 'plan_update':
      tui.messages.push({ role: 'plan', plan: Array.isArray(data.plan) ? data.plan : [] });
      tui.render?.();
      break;
    case 'compaction':
      tui.messages.push({ role: 'system', content: `compacted ${data.droppedMessages} msgs (~${data.tokensBefore}→${data.tokensAfter} tok)` });
      tui.render?.();
      break;
    case 'usage_update':
      tui.setUsage(withCost(data));
      break;
    case 'checkpoint':
      tui.printInfo(`Checkpoint ${data.id || ''} created (${data.kind || 'snapshot'})`);
      break;
  }
}

function withCost(usage) {
  const model = String(usage.model || '').toLowerCase();
  const table = [
    ['gpt-4o-mini', 0.15, 0.60],
    ['gpt-4o', 2.50, 10.00],
    ['gpt-4.1-mini', 0.40, 1.60],
    ['gpt-4.1', 2.00, 8.00],
    ['claude-3-5-sonnet', 3.00, 15.00],
    ['claude-3-5-haiku', 0.80, 4.00],
  ];
  const hit = table.find(([name]) => model.includes(name));
  if (!hit || usage.isLocal) return usage;
  const [, inPerM, outPerM] = hit;
  return {
    ...usage,
    costUsd: ((usage.inputTokens || 0) / 1_000_000 * inPerM) + ((usage.outputTokens || 0) / 1_000_000 * outPerM),
  };
}

async function handleAskUser(tui, data, token, base) {
  const requestId = data.requestId;
  if (!requestId) {
    tui.printErr('Agent question missing requestId.');
    return;
  }

  const question = data.question || 'The agent needs more information.';
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const defaultAnswer = data.default || '';

  tui.setStreamMsg('Waiting for your answer...');
  tui.printInfo(`Agent asks: ${question}`);
  tui.unlockInput();

  let answer = defaultAnswer;
  if (choices.length > 0) {
    const selected = await tui.showSelector('Agent Question', choices.map(choice => ({
      name: choice,
      desc: choice === defaultAnswer ? 'default' : '',
      answer: choice,
    })));
    answer = selected?.answer || defaultAnswer || '';
  } else {
    answer = await tui.showAskInput(question, defaultAnswer);
  }

  tui.lockInput();

  const res = await fetch(`${base}/api/agent/ask/${requestId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ answer }),
  });
  if (!res.ok) throw new Error(`Question response failed (${res.status})`);

  tui.print(`Answered: ${answer || '(empty)'}`);
  tui.setStreamMsg('Agent continuing...');
}

async function handlePermissionRequest(tui, data, token, base) {
  const toolName = data.toolName || data.tool || 'unknown_tool';
  const requestId = data.requestId;

  if (!requestId) {
    tui.printErr('Permission request missing requestId; denying tool call.');
    return;
  }

  const argPreview = previewPermissionArgs(toolName, data.args || {});
  tui.setStreamMsg(`Permission needed: ${toolName}`);
  tui.printWarn(`Permission needed for ${toolName}: ${argPreview}`);
  if (data.diff) {
    tui.addMessage('tool', data.diff, { tool: `${toolName} diff`, success: null });
  }

  let decision = 'deny';
  if (tui._fullControl) {
    decision = 'allow_session';
  } else {
    tui.unlockInput();
    const firstCmd = toolName === 'run_command'
      ? String(data.args?.command || '').trim().split(/\s+/)[0]
      : '';
    const options = [
      { name: 'Approve once', desc: data.diff ? 'Review diff in the tool card above' : argPreview, decision: 'allow' },
      { name: 'Deny', desc: 'Do not run this tool call', decision: 'deny' },
      { name: 'Trust this run', desc: 'Approve this tool for the rest of this agent run', decision: 'allow_session' },
      { name: `Always allow ${toolName}`, desc: 'Save a workspace rule that auto-approves this tool', decision: 'allow_always_tool' },
    ];
    if (firstCmd) {
      options.push({
        name: `Always allow ${firstCmd} …`,
        desc: `Save a workspace rule matching: ^${firstCmd}`,
        decision: 'allow_always_command',
      });
    }
    const selected = await tui.showSelector(`Permission: ${toolName}`, options);
    tui.lockInput();
    decision = selected?.decision || 'deny';
  }

  const res = await fetch(`${base}/api/agent/permissions/${requestId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) throw new Error(`Permission response failed (${res.status})`);

  tui.print(`${decision === 'deny' ? 'Denied' : 'Approved'} ${toolName}`);
  tui.setStreamMsg('Agent continuing...');
}

function previewPermissionArgs(toolName, args) {
  if (toolName === 'run_command') return `$ ${args.command || ''}${args.cwd ? `  in ${args.cwd}` : ''}`;
  if (toolName === 'write_file' || toolName === 'edit_file') return args.path || JSON.stringify(args).slice(0, 120);
  if (toolName === 'run_python' || toolName === 'run_node') return String(args.code || '').split('\n').slice(0, 2).join(' ').slice(0, 120);
  try {
    return JSON.stringify(args).slice(0, 120);
  } catch {
    return String(args).slice(0, 120);
  }
}
// ── Help ────────────────────────────────────────────────────────────────────
function showTuiHelp(tui) {
  tui.print('');
  tui.print('━━ 🐱 asyncat — keyboard reference ━━');
  tui.print('');
  tui.print('  Just type          Send to AI (auto-agent mode)');
  tui.print('  /                  Browse all commands (palette)');
  tui.print('  esc                Back / Clear input / Exit');
  tui.print('');
  tui.print('  ── 🧠 Brain Regions ───────────────────────');
  tui.print('  Prefrontal         Planning, code review, decisions');
  tui.print('  Cerebellum         45 bundled skills (muscle memory)');
  tui.print('  Hippocampus       Memory (semantic + episodic)');
  tui.print('  Amygdala          Safety, permissions, errors');
  tui.print('  Basal Ganglia     Auto-learns from your patterns');
  tui.print('');
  tui.print('  ── Navigation ─────────────────────────');
  tui.print('  ↑ / ↓              Scroll prompt history');
  tui.print('  PgUp / PgDn        Scroll messages');
  tui.print('  Mouse wheel        Scroll');
  tui.print('');
  tui.print('  ── Clipboard ───────────────────────────');
  tui.print('  Ctrl+Y             Copy last AI response');
  tui.print('  Ctrl+M             Toggle mouse (drag to select)');
  tui.print('');
  tui.print('  ── Editing ─────────────────────────────');
  tui.print('  Ctrl+U             Delete to start of line');
  tui.print('  Ctrl+K             Delete to end of line');
  tui.print('  Ctrl+L             Refresh screen');
  tui.print('  Ctrl+P             Open command palette');
  tui.print('');
  tui.print('  ── Key Commands ───────────────────────────');
  tui.print('  /skills      Browse 45 brain skills');
  tui.print('  /tools      List agent tools');
  tui.print('  /memory     Search agent memories');
  tui.print('  /models    Select AI model');
  tui.print('  /provider  Configure AI provider');
  tui.print('  /theme     Switch color theme');
  tui.print('  /open      Open web UI (localhost:8717)');
  tui.print('  /new      Start fresh session');
  tui.print('  /help     Show this');
  tui.print('');
}

// ── Stash handler (TUI mode) ────────────────────────────────────────────────
function handleStash(args, tui) {
  const sub = args[0];
  if (!sub || sub === 'list') {
    const items = stashList();
    if (items.length === 0) { tui.printInfo('Stash is empty.'); return; }
    tui.print('');
    for (const it of items) {
      const date = new Date(it.ts).toLocaleDateString();
      tui.print(`  ${it.id}  ${date}  ${it.text}`);
    }
    return;
  }
  if (sub === 'rm') {
    const id = args[1];
    if (!id) { tui.printWarn('Usage: /stash rm <id>'); return; }
    if (stashRm(id)) tui.printOk(`Removed stash entry ${id}`);
    else tui.printWarn(`No entry matching "${id}"`);
    return;
  }
  if (sub === 'clear') {
    stashClear();
    tui.printOk('Stash cleared.');
    return;
  }
  const text = args.join(' ');
  const id = stashAdd(text);
  tui.printOk(`Stashed [${id}]  ${text}`);
}

// ── Live-logs handler (TUI mode) ────────────────────────────────────────────
function handleLiveLogs(args, tui) {
  const sub = args[0];
  const enabled = getLiveLogsEnabled();
  if (!sub || sub === 'status') {
    tui.printInfo(`Live logs: ${enabled ? 'ON' : 'off'}`);
    return;
  }
  if (sub === 'on' || sub === 'enable') {
    setLiveLogsEnabled(true);
    tui.printOk('Live logs enabled');
    return;
  }
  if (sub === 'off' || sub === 'disable') {
    setLiveLogsEnabled(false);
    tui.printOk('Live logs disabled');
    return;
  }
  if (sub === 'toggle') {
    setLiveLogsEnabled(!enabled);
    tui.printOk(`Live logs ${!enabled ? 'enabled' : 'disabled'}`);
    return;
  }
  tui.printWarn(`Unknown: /live-logs ${sub}. Use on|off|toggle|status`);
}


// ── CLI mode (non-interactive, single command) ──────────────────────────────
async function runSingleCommand(argv) {
  const [first, ...rest] = argv;

  if (first === '--version' || first === '-v') {
    _version.run(); return;
  }
  if (first === '--help' || first === '-h') {
    banner();
    console.log('  Usage: asyncat [command] [args]');
    console.log('  Run without arguments for interactive TUI.');
    console.log('  Commands: agent, chat, run, models, provider, start, stop, status, ...');
    console.log('  Use asyncat help for full reference.');
    return;
  }

  // Direct command execution
  const cmd = first.replace(/^\//, '');
  switch (cmd) {
    case 'agent': await _agent.run(rest); break;
    case 'chat':  await _chat.run(rest);  break;
    case 'run':   await _run.run(rest);   break;
    case 'models': await _models.run(rest); break;
    case 'provider': await _provider.run(rest); break;
    case 'start': _start.run(rest); break;
    case 'stop':  _stop.run(); break;
    case 'status': _status.run(); break;
    case 'logs': _logs.run(rest); break;
    case 'install': await _install.run(rest); break;
    case 'doctor': _doctor.run(); break;
    case 'version': _version.run(); break;
    case 'memory':
    case 'mem':
      await _memory.run(rest); break;
    case 'help': banner(); console.log('  Run asyncat without arguments for interactive TUI.'); break;
    default:
      // Try to handle as goal text for agent
      if (!cmd.startsWith('-')) {
        await _agent.run(argv);
      } else {
        console.log(`  Unknown command: ${cmd}`);
      }
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv.length > 0) {
  await runSingleCommand(argv);
} else {
  await startTui();
}
