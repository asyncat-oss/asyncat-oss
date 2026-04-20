// Asyncat v2 — TUI Entry Point
// Premium terminal experience inspired by OpenCode
import { Tui } from './lib/tui/index.js';
import { loadTheme, setTheme, getThemeName, THEME_NAMES } from './lib/theme.js';
import { stopAll, procs } from './lib/procs.js';
import { readEnv } from './lib/env.js';
import fs from 'fs';
import path from 'path';
import { ROOT } from './lib/env.js';

// ── Legacy imports (command handlers) ───────────────────────────────────────
import * as _start    from './commands/start.js';
import * as _stop     from './commands/stop.js';
import * as _status   from './commands/status.js';
import * as _install  from './commands/install.js';
import * as _doctor   from './commands/doctor.js';
import * as _logs     from './commands/logs.js';
import * as _models   from './commands/models.js';
import * as _db       from './commands/db.js';
import * as _config   from './commands/config.js';
import * as _update   from './commands/update.js';
import * as _version  from './commands/version.js';
import * as _open     from './commands/open.js';
import * as _chat     from './commands/chat.js';
import * as _run      from './commands/run.js';
import * as _provider from './commands/provider.js';
import * as _sessions from './commands/sessions.js';
import * as _watch    from './commands/watch.js';
import * as _alias    from './commands/alias.js';
import * as _recent   from './commands/recent.js';
import * as _bench    from './commands/bench.js';
import * as _context  from './commands/context.js';
import * as _snippets from './commands/snippets.js';
import * as _macros   from './commands/macros.js';
import * as _history  from './commands/history.js';
import * as _uninstall from './commands/uninstall.js';
import * as _git      from './commands/git.js';
import * as _code     from './commands/code.js';
import * as _agent    from './commands/agent.js';
import * as _mcp      from './commands/mcp.js';
import { getToken, getBase, apiGet } from './lib/denApi.js';
import { c, col, setRl, setLl, log, ok, warn, info, banner, setLiveLogsEnabled, getLiveLogsEnabled } from './lib/colors.js';
import { LiveLine } from './lib/liveLine.js';
import { stashAdd, stashList, stashRm, stashClear } from './lib/stash.js';
import { select } from './lib/select.js';

loadTheme();

// ── Detect model info ───────────────────────────────────────────────────────
async function detectModel() {
  try {
    const token = await getToken();
    const base  = getBase();
    const res = await fetch(`${base}/api/ai/providers/config`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        model: data.model || 'default',
        provider: data.provider_type || 'local',
      };
    }
  } catch {}
  return { model: '', provider: '' };
}

// ── Auto-start backend ─────────────────────────────────────────────────────
async function maybeStartBackend() {
  if (procs.backend) return;
  if (!fs.existsSync(path.join(ROOT, 'den/.env')))          return;
  if (!fs.existsSync(path.join(ROOT, 'den/node_modules')))  return;
  try {
    const res = await fetch('http://localhost:8716/api/health', {
      signal: AbortSignal.timeout(600),
    });
    if (res.ok) return;
  } catch {}
  _start.run(['--backend-only']);
}

// ── TUI Mode (default — interactive) ────────────────────────────────────────
async function startTui() {
  // Create TUI first so alternate screen captures backend output
  const tui = new Tui({
    modelInfo: '',
    providerInfo: '',
    version: '0.3.2',
  });
  tui.start();

  // Suppress console output during backend auto-start
  const origWrite = process.stdout.write.bind(process.stdout);
  const origConsoleLog = console.log;
  process.stdout.write = (s) => { /* swallow during startup */ return true; };
  console.log = () => {};

  await maybeStartBackend();

  // Restore and re-render
  process.stdout.write = origWrite;
  console.log = origConsoleLog;

  // Detect model after backend is up
  const { model, provider } = await detectModel();
  tui.setModel(model, provider);

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
  async function dispatch(cmd, args = []) {
    tui.lockInput();

    // Commands that need the full terminal
    const shellCommands = [
      'install', 'setup', 'doctor', 'provider', 'sessions',
      'snippets', 'mcp', 'update', 'uninstall', 'logs',
      'status', 'ps', 'config', 'version', 'v', 'context',
      'code', 'git',
    ];

    if (shellCommands.includes(cmd)) {
      await runInShell(async () => {
        switch (cmd) {
          case 'install': case 'setup': await _install.run(); break;
          case 'doctor':   _doctor.run();  break;
          case 'provider': await _provider.run(args); break;
          case 'sessions': await _sessions.run(args); break;
          case 'snippets': await _snippets.run(args); break;
          case 'mcp':      await _mcp.run(args); break;
          case 'update':   _update.run(); break;
          case 'uninstall': _uninstall.run(); break;
          case 'logs':     _logs.run(args); break;
          case 'status': case 'ps': _status.run(); break;
          case 'config':   _config.run(args); break;
          case 'version': case 'v': _version.run(); break;
          case 'context':  _context.run(); break;
          case 'code':     _code.run(args); break;
          case 'git':      _git.run(args); break;
        }
      });
      if (['provider'].includes(cmd)) {
        const { model: m, provider: p } = await detectModel();
        tui.setModel(m, p);
      }
      tui.unlockInput();
      return;
    }

    try {
      switch (cmd) {
        // ── Models: inline TUI selector ─────────────────────────────────
        case 'models': {
          if (args.length > 0) {
            // Subcommand like 'models serve foo.gguf'
            await runInShell(() => _models.run(args));
            const { model: m, provider: p } = await detectModel();
            tui.setModel(m, p);
            tui.unlockInput();
            return;
          }
          // Show inline model picker
          tui.unlockInput();
          let models = [];
          try {
            const token = await getToken();
            const localModels = await apiGet('/api/ai/providers/local-models');
            models = (localModels.models || []).map(m => ({
              name: m.filename,
              desc: m.sizeFormatted || '',
              _file: m.filename,
            }));
          } catch { }
          if (models.length === 0) {
            tui.printWarn('No local models found. Use /models pull <url> to download one.');
            return;
          }
          const chosen = await tui.showSelector('Select Model', models);
          if (chosen) {
            const ctxSize = await tui.showModelSetup(chosen);
            if (!ctxSize) {
              tui.printInfo('Model load cancelled.');
              return;
            }

            tui.printInfo(`Loading ${chosen.name} (ctx: ${ctxSize})...`);
            try {
              const token = await getToken();
              const base = getBase();
              await fetch(`${base}/api/ai/providers/server/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ filename: chosen._file, ctxSize: parseInt(ctxSize, 10) || 8192 }),
              });
              tui.printOk(`Model ${chosen.name} loaded`);
              setTimeout(async () => {
                const { model: m, provider: p } = await detectModel();
                tui.setModel(m, p);
              }, 1500);
            } catch (e) {
              tui.printErr(`Failed to load model: ${e.message}`);
            }
          }
          return;
        }

        // ── Theme: inline TUI selector ──────────────────────────────────
        case 'theme': {
          tui.unlockInput();
          const themeItems = THEME_NAMES.map(n => ({
            name: n,
            desc: n === getThemeName() ? '(current)' : '',
          }));
          const chosen = await tui.showSelector('Select Theme', themeItems);
          if (chosen) {
            setTheme(chosen.name);
            tui.printOk(`Theme: ${chosen.name}`);
          }
          tui.render();
          return;
        }

        // ── Services ────────────────────────────────────────────────────
        case 'start':
        case 's':
          _start.run(args);
          tui.printOk('Services starting...');
          break;
        case 'stop':
          _stop.run();
          tui.printOk('Services stopped');
          break;
        case 'restart':
          _stop.run();
          setTimeout(() => _start.run(args), 500);
          tui.printOk('Restarting services...');
          break;

        // ── Quick commands ───────────────────────────────────────────────
        case 'open':
        case 'o':
          _open.run();
          tui.printOk('Opened in browser');
          break;
        case 'db':
          await _db.run(args);
          break;
        case 'watch':
          _watch.run(args);
          break;
        case 'alias':
          _alias.run(args);
          break;
        case 'recent':
          _recent.run(args);
          break;
        case 'bench':
          _bench.run(args);
          break;
        case 'macros':
          _macros.run(args);
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
        case 'tools': {
          tui.printInfo('Agent Skills & Tools:');
          try {
            const token = await getToken();
            const base = getBase();
            // Fetch tool info from backend
            const res = await fetch(`${base}/api/health`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const health = await res.json();
              const toolCount = health.toolCount || '?';
              tui.print(`  ${toolCount} tools registered`);
            }
          } catch {}
          // Show known tool categories
          tui.print('');
          tui.print('  📁 File Tools       read, write, edit, delete, list, search files');
          tui.print('  🖥  Shell Tools      run commands, scripts, package managers');
          tui.print('  🔍 Search Tools     grep, find, semantic search, web search');
          tui.print('  🧠 Memory Tools     remember, recall, context management');
          tui.print('  🌐 Browser Tools    fetch pages, screenshots, web scraping');
          tui.print('  📂 Workspace Tools  project structure, deps, git operations');
          tui.print('  🤖 Agent Tools      sub-tasks, planning, self-reflection');
          tui.print('  🔌 MCP Tools        external tool servers (configurable)');
          tui.print('');
          tui.print('  All tools are available when you type a message.');
          tui.print('  The agent automatically selects which tools to use.');
          break;
        }
        case 'new':
          tui.clearMessages();
          tui.printOk('New session started');
          break;
        case 'help':
        case '?':
          showTuiHelp(tui);
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

    if (['start', 'restart', 's'].includes(cmd)) {
      setTimeout(async () => {
        const { model: m, provider: p } = await detectModel();
        tui.setModel(m, p);
      }, 2000);
    }
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
          _file: m.filename,
        }));
      } catch {
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
        tui.printOk(`Model ${chosen.name} loaded!`);
        // Wait for model to be ready
        await new Promise(r => setTimeout(r, 2000));
        const { model: m, provider: p } = await detectModel();
        tui.setModel(m, p);
      } catch (e) {
        tui.printErr(`Failed: ${e.message}`);
        return;
      }
    }

    // Now send the message
    tui.addMessage('user', text);
    tui.lockInput();
    tui.startStreaming('Agent thinking...');

    try {
      const token = await getToken();
      const base  = getBase();

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
          autoApprove: false,
        }),
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
          try {
            const event = JSON.parse(line.slice(6).trim());
            handleAgentEvent(tui, event, token, base);
            if (event.type === 'answer') fullAnswer = event.data?.answer || '';
          } catch {}
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
      if (e.message.includes('fetch failed') || e.message.includes('ECONNREFUSED')) {
        tui.printErr('Backend not reachable. Try /start or /doctor');
      } else {
        tui.printErr(e.message);
      }
    }

    tui.unlockInput();
  }

  // ── Event wiring ──────────────────────────────────────────────────────
  tui.on('command', (cmd, args) => dispatch(cmd, args));
  tui.on('input', (text) => handleAiInput(text));
  tui.on('exit', () => {
    tui.destroy();
    stopAll();
    console.log('  bye ♡');
    process.exit(0);
  });

  tui.start();
}

// ── Agent event handler ─────────────────────────────────────────────────────
function handleAgentEvent(tui, event, token, base) {
  const { type, data } = event;
  switch (type) {
    case 'thinking':
      tui.setStreamMsg(`Thinking (Round ${(data.round || 0) + 1})...`);
      if (data.thought) {
        tui.addMessage('thinking', data.thought, { round: (data.round || 0) + 1 });
      }
      break;
    case 'delta':
      if (data.content) {
        tui.appendStreamContent(data.content);
      }
      break;
    case 'tool_start':
      tui.setStreamMsg(`Running ${data.tool}...`);
      tui.addMessage('tool', data.description || '', { tool: data.tool, success: null });
      break;
    case 'tool_result':
      const content = data.result?.content || data.result?.message || '';
      const preview = typeof content === 'string' ? content.slice(0, 200) : JSON.stringify(content).slice(0, 200);
      tui.addMessage('tool', preview, { tool: data.tool || 'tool', success: data.result?.success });
      break;
    case 'done':
      tui.stopStreaming();
      break;
    case 'error':
      tui.stopStreaming();
      tui.printErr(data.message || 'Unknown agent error');
      break;
    case 'permission_request':
      // Auto-allow in TUI mode for now (can add dialog later)
      fetch(`${base}/api/agent/permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId: data.sessionId, decision: 'allow' }),
      }).catch(() => {});
      break;
  }
}
// ── Help ────────────────────────────────────────────────────────────────────
function showTuiHelp(tui) {
  tui.print('');
  tui.print('━━ asyncat ━━');
  tui.print('');
  tui.print('  Just type        Send to AI (auto-agent mode)');
  tui.print('  /                Browse all commands');
  tui.print('  esc              Back / Clear / Exit');
  tui.print('  ctrl+p           Command palette');
  tui.print('  ↑↓               Scroll / History');
  tui.print('  enter            (empty) cycle cat message 🐱');
  tui.print('');
  tui.print('  /models          Select & load a model');
  tui.print('  /theme           Pick color theme');
  tui.print('  /provider        Configure AI provider');
  tui.print('  /git             Git project info');
  tui.print('  /doctor          System health check');
  tui.print('  /new             Clear & start fresh');
  tui.print('  /exit            Quit');
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

// ── Legacy REPL mode (for interactive commands) ─────────────────────────────
async function runLegacyCommand(cmd, args) {
  const PROMPT_LEN = 'asyncat ▸ '.length;
  const makePrompt = () => `\x1b[1m\x1b[35masyncat\x1b[0m\x1b[2m ▸ \x1b[0m`;

  banner();

  const ll = new LiveLine(makePrompt(), PROMPT_LEN);
  setRl(ll);
  setLl(ll);

  switch (cmd) {
    case 'chat':  await _chat.run(args);  break;
    case 'run':   await _run.run(args);   break;
    case 'agent': await _agent.run(args); break;
  }

  ll.close();
  setRl(null);
  setLl(null);
  // Return to caller instead of exiting — TUI will resume
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
    case 'install': await _install.run(); break;
    case 'doctor': _doctor.run(); break;
    case 'version': _version.run(); break;
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
