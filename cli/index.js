// Asyncat v2 — TUI Entry Point
// Premium terminal experience inspired by OpenCode
import { Tui } from './lib/tui/index.js';
import { loadTheme, setTheme, getThemeName, THEME_NAMES } from './lib/theme.js';
import { stopAll, procs } from './lib/procs.js';
import fs from 'fs';
import path from 'path';
import { ROOT } from './lib/env.js';

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
import { getToken, getBase, apiGet } from './lib/denApi.js';
import { banner, setLiveLogsEnabled, getLiveLogsEnabled } from './lib/colors.js';
import { stashAdd, stashList, stashRm, stashClear } from './lib/stash.js';

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

// ── Auto-start all services on TUI launch ──────────────────────────────────
async function autoStartServices() {
  if (!fs.existsSync(path.join(ROOT, 'den/.env')))          return;
  if (!fs.existsSync(path.join(ROOT, 'den/node_modules')))  return;

  // Check if backend is already up
  let backendUp = false;
  try {
    const res = await fetch('http://localhost:8716/api/health', {
      signal: AbortSignal.timeout(600),
    });
    backendUp = res.ok;
  } catch {}

  if (!backendUp && !procs.backend) {
    _start.run(['--backend-only']);
  }

  // Start frontend if not already running
  if (!procs.frontend) {
    _start.run(['--frontend-only']);
  }
}

// ── TUI Mode (default — interactive) ────────────────────────────────────────
async function startTui() {
  // Create TUI first so alternate screen captures service output
  const tui = new Tui({
    modelInfo: '',
    providerInfo: '',
    version: '0.3.2',
  });
  tui.start();

  // Suppress console output during auto-start
  const origWrite = process.stdout.write.bind(process.stdout);
  const origConsoleLog = console.log;
  process.stdout.write = (s) => { /* swallow during startup */ return true; };
  console.log = () => {};

  await autoStartServices();

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
      'install', 'setup', 'onboard', 'doctor', 'provider', 'sessions',
      'snippets', 'mcp', 'update', 'uninstall', 'logs',
      'status', 'ps', 'config', 'version', 'v', 'context',
      'code', 'git', 'skills',
    ];

    if (shellCommands.includes(cmd)) {
      await runInShell(async () => {
        switch (cmd) {
          case 'install': case 'setup': await _install.run(); break;
          case 'onboard': await _onboard.run(); break;
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
          case 'skills':   _skills.run(args); break;
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
        case 'tools': {
          tui.unlockInput();

          // ── Agent Tools (direct function calls the LLM can invoke) ─────
          tui.print('');
          tui.print('━━ Agent Tools  (functions the LLM calls directly) ━━');
          tui.print('');
          tui.print('  📁  read_file          Read any file from disk');
          tui.print('  ✏️   write_file         Write or overwrite a file');
          tui.print('  📝  edit_file          Patch specific lines in a file');
          tui.print('  🗑️   delete_file        Delete files or directories');
          tui.print('  📂  list_dir           List directory contents');
          tui.print('  🔍  grep_search        Regex/literal search across files');
          tui.print('  🖥️   run_command        Execute any shell command');
          tui.print('  🐍  run_python         Run Python code in a temp sandbox');
          tui.print('  🟨  run_node           Run JavaScript code in a temp file');
          tui.print('  🌐  web_search         Search the web (DuckDuckGo/SearXNG)');
          tui.print('  🔗  fetch_url          Read any webpage (reader mode)');
          tui.print('  🔌  http_request       Full HTTP client — POST/PUT/DELETE + headers');
          tui.print('  🖥️   sys_info           CPU, RAM, disk, uptime, OS info');
          tui.print('  📋  ps_list            Running processes — sort by CPU/mem');
          tui.print('  🔑  env_get            Read environment variables (secrets masked)');
          tui.print('  🔔  notify             Send a desktop system notification');
          tui.print('  🧪  run_tests          Auto-detect & run Jest/Vitest/Mocha tests');
          tui.print('  📎  clipboard_read     Read clipboard contents');
          tui.print('  📎  clipboard_write    Write text to clipboard');
          tui.print('  🧠  store_memory       Persist facts/preferences across sessions');
          tui.print('  🧠  recall_memory      Search stored memories by query');
          tui.print('  🧠  list_memories      Browse all stored memories');
          tui.print('  🤖  delegate_task      Spawn a specialized sub-agent for a sub-task');
          tui.print('  🔌  mcp_call           Invoke external MCP tool servers');
          tui.print('');

          // ── Agent Skills (higher-level built-in behaviours) ────────────
          tui.print('━━ Agent Skills  (built-in reasoning capabilities) ━━');
          tui.print('');
          tui.print('  🤖  Multi-step planning    Break goals into sub-tasks');
          tui.print('  🔄  Self-reflection         Review & correct its own output');
          tui.print('  📋  Task decomposition      Delegate sub-tasks autonomously');
          tui.print('  🛡️   Permission gating       Ask before destructive actions');
          tui.print('  💾  Auto-session save       Persist conversations to DB');
          tui.print('  📜  Conversation history    Pass context across rounds');
          tui.print('  🌊  Streaming output        Token-by-token TUI rendering');
          tui.print('');
          tui.print('  Type a message to use all of these automatically.');
          tui.print('  /mcp to connect additional tool servers.');
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
              const tag = m.memory_type ? `${ansi?.dim || ''}[${m.memory_type}]` : '';
              tui.print(`  ${m.key || '–'}  ${tag}`);
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
          contextLength: m.contextLength || 8192,
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
  tui.print('━━ asyncat — keyboard reference ━━');
  tui.print('');
  tui.print('  Just type          Send to AI (auto-agent mode)');
  tui.print('  /                  Browse all commands (palette)');
  tui.print('  esc                Back / Clear input / Exit');
  tui.print('');
  tui.print('  ── Navigation ───────────────────────────────');
  tui.print('  ↑ / ↓              Scroll through prompt history');
  tui.print('  PgUp / PgDn        Scroll messages up/down (half page)');
  tui.print('  Mouse wheel        Scroll messages');
  tui.print('  Home / End         Jump to start/end of input');
  tui.print('');
  tui.print('  ── Text & Clipboard ─────────────────────────');
  tui.print('  Ctrl+Y             Copy last AI response to clipboard');
  tui.print('  Ctrl+M             Toggle mouse off → drag to select text');
  tui.print('                     (Ctrl+M again to re-enable scroll/click)');
  tui.print('');
  tui.print('  ── Editing ──────────────────────────────────');
  tui.print('  Ctrl+U             Delete to start of line');
  tui.print('  Ctrl+K             Delete to end of line');
  tui.print('  Ctrl+W             Delete word back');
  tui.print('  Ctrl+L             Refresh screen');
  tui.print('  Ctrl+P             Open command palette');
  tui.print('');
  tui.print('  ── Commands ─────────────────────────────────');
  tui.print('  /models            Select & load a model');
  tui.print('  /memory            View/search/delete agent memories');
  tui.print('  /cron              Schedule recurring agent tasks');
  tui.print('    /cron add "name" "goal" interval:<ms>');
  tui.print('    /cron add "name" "goal" daily:09:00');
  tui.print('    /cron list | rm <id> | on <id> | off <id>');
  tui.print('  /screen            Desktop capture & control info');
  tui.print('  /provider          Configure AI provider');
  tui.print('  /tools             List all agent tools & skills');
  tui.print('  /theme             Pick color theme');
  tui.print('  /git               Git project info');
  tui.print('  /doctor            System health check');
  tui.print('  /open              Open web UI in browser (:8717)');
  tui.print('  /new               Clear & start fresh');
  tui.print('  /exit              Quit');
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
