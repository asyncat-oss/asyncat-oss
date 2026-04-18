import readline from 'readline';
import { getRl, col, c, log, ok, warn, err, info } from '../lib/colors.js';
import { getToken, streamPost, getBase } from '../lib/denApi.js';
import { renderMarkdown } from '../lib/markdown.js';

const CHAT_PROMPT = `  ${col('cyan', 'you')} ${col('dim', '▸')} `;
const AI_LABEL    = `  ${col('magenta', 'asyncat')} ${col('dim', '▸')} `;

function chatHelp() {
  console.log('');
  console.log(`  ${col('bold', 'Chat commands:')}`);
  console.log(`  ${col('cyan', '/exit')}   ${col('dim', '/bye /quit')}   Leave chat, return to REPL`);
  console.log(`  ${col('cyan', '/new')}               Start a fresh conversation`);
  console.log(`  ${col('cyan', '/clear')}             Clear the screen`);
  console.log(`  ${col('cyan', '/web')}               Toggle web search on/off`);
  console.log(`  ${col('cyan', '/think')}             Toggle extended thinking on/off`);
  console.log(`  ${col('cyan', '/style')} ${col('dim', '<mode>')}      Set response style: normal concise detailed`);
  console.log(`  ${col('cyan', '/history')}           Show this conversation`);
  console.log(`  ${col('cyan', '/save')}              Save this conversation to workspace`);
  console.log(`  ${col('cyan', '/help')}              Show this help`);
  console.log('');
}

function printHeader(webSearch, thinking, style) {
  console.log('');
  console.log(`  ${col('magenta', col('bold', 'asyncat chat'))}  ${col('dim', '─'.repeat(36))}`);
  console.log(`  ${col('dim', 'type a message · /help for commands · /exit to quit')}`);

  const flags = [];
  if (webSearch) flags.push(col('cyan',   '⊕ web'));
  if (thinking)  flags.push(col('yellow', '◎ think'));
  flags.push(col('dim', `◈ ${style}`));
  if (flags.length) console.log(`  ${flags.join('  ')}`);
  console.log('');
}

async function saveConversation(history, token, base) {
  if (history.length < 2) { warn('Nothing to save yet.'); return; }
  try {
    const res = await fetch(`${base}/api/ai/chats/autosave`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ messages: history, mode: 'chat' }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) ok(`Conversation saved${data.conversationId ? ` (${data.conversationId.slice(0, 8)}…)` : ''}`);
    else warn('Save failed — backend returned ' + res.status);
  } catch (e) {
    warn('Save failed: ' + e.message);
  }
}

async function streamMessage(message, history, opts, token, base) {
  const { webSearch, thinking, style } = opts;

  // Print AI label before streaming starts
  process.stdout.write('\n' + AI_LABEL);

  let fullContent  = '';
  let lineBuffer   = '';
  let toolsShown   = 0;
  let searchShown  = false;

  await streamPost('/api/ai/unified-stream', {
    message,
    conversationHistory: history,
    responseStyle: style,
    webSearch,
    thinking,
  }, (event) => {
    switch (event.type) {
      case 'search_start':
        if (!searchShown) {
          process.stdout.write(`\n  ${col('dim', '⊕ searching…')}`);
          searchShown = true;
        }
        break;

      case 'search_done': {
        // Overwrite the searching line
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        const srcs = (event.sources || []).filter(s => s.read).length;
        process.stdout.write(
          `  ${col('dim', `⊕ searched · ${event.resultCount} results · ${srcs} pages read (${event.engine})`)}\n` +
          AI_LABEL
        );
        break;
      }

      case 'tool_start':
        toolsShown++;
        process.stdout.write(`\n  ${col('dim', `⚙ ${event.tool}…`)}`);
        break;

      case 'tool_done':
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(`  ${col('dim', `⚙ ${event.tool} ✔`)}\n` + AI_LABEL);
        break;

      case 'delta':
        if (event.content) {
          fullContent += event.content;
          // Write raw delta so the user sees it streaming; we'll re-render below
          process.stdout.write(event.content);
        }
        break;

      case 'done':
        // Overwrite streamed raw text with formatted markdown
        // Move cursor up to the AI_LABEL line and reprint
        if (fullContent) {
          const lineCount = fullContent.split('\n').length;
          // Move up lineCount lines, clear from there
          process.stdout.write(`\x1b[${lineCount}A\r`);
          // Clear from cursor to end of screen
          process.stdout.write('\x1b[J');
          const rendered = renderMarkdown(fullContent);
          process.stdout.write(rendered);
        }
        process.stdout.write('\n\n');
        break;

      case 'error':
      case 'local_model_offline':
      case 'context_overflow':
      case 'content_filter':
        process.stdout.write('\n');
        err(event.error || 'Unknown error from AI');
        break;
    }
  });

  return fullContent;
}

export async function run(args = []) {
  const mainRl = getRl();

  // ── Auth check ──────────────────────────────────────────────────────────────
  let token, base;
  try {
    token = await getToken();
    base  = getBase();
  } catch (e) {
    err(e.message);
    return;
  }

  // ── Session state ────────────────────────────────────────────────────────────
  let history   = [];
  let webSearch = false;
  let thinking  = false;
  let style     = 'normal';

  // Parse flags from args:  asyncat chat --web --think --style=concise
  for (const a of args) {
    if (a === '--web'  || a === '-w') webSearch = true;
    if (a === '--think'|| a === '-t') thinking  = true;
    if (a.startsWith('--style='))     style     = a.split('=')[1];
  }

  printHeader(webSearch, thinking, style);

  // ── Take over the main RL line handler ───────────────────────────────────────
  const savedListeners = mainRl ? mainRl.rawListeners('line') : [];
  const savedPrompt    = mainRl ? mainRl._prompt : '';

  if (mainRl) {
    mainRl.removeAllListeners('line');
    mainRl.setPrompt(CHAT_PROMPT);
    mainRl.prompt();
  }

  return new Promise((resolve) => {
    const exit = () => {
      if (mainRl) {
        mainRl.removeAllListeners('line');
        for (const l of savedListeners) mainRl.on('line', l);
        mainRl.setPrompt(savedPrompt);
      }
      info('Back in REPL. Type ' + col('cyan', 'help') + ' for commands.');
      resolve();
    };

    const handleLine = async (input) => {
      const trimmed = input.trim();

      // ── Slash commands ─────────────────────────────────────────────────────
      if (trimmed.startsWith('/')) {
        const [cmd, ...rest] = trimmed.split(/\s+/);
        switch (cmd.toLowerCase()) {
          case '/exit': case '/bye': case '/quit':
            exit(); return;

          case '/new':
            history = [];
            console.clear();
            printHeader(webSearch, thinking, style);
            ok('New conversation started.');
            break;

          case '/clear':
            console.clear();
            printHeader(webSearch, thinking, style);
            break;

          case '/web':
            webSearch = !webSearch;
            ok(`Web search ${webSearch ? col('green', 'ON') : col('dim', 'OFF')}`);
            break;

          case '/think':
            thinking = !thinking;
            ok(`Extended thinking ${thinking ? col('green', 'ON') : col('dim', 'OFF')}`);
            break;

          case '/style': {
            const s = rest[0];
            const valid = ['normal', 'concise', 'detailed', 'code-focused', 'learning'];
            if (!s || !valid.includes(s)) {
              warn(`Valid styles: ${valid.join(' · ')}`);
            } else {
              style = s;
              ok(`Response style → ${col('cyan', style)}`);
            }
            break;
          }

          case '/history':
            if (history.length === 0) {
              info('No messages yet.');
            } else {
              console.log('');
              for (const m of history) {
                const label = m.role === 'user'
                  ? `  ${col('cyan', 'you')}      `
                  : `  ${col('magenta', 'asyncat')}  `;
                const preview = (m.content || '').slice(0, 120).replace(/\n/g, ' ');
                console.log(`${label}${col('dim', preview)}${m.content.length > 120 ? col('dim', '…') : ''}`);
              }
              console.log('');
            }
            break;

          case '/save':
            await saveConversation(history, token, base);
            break;

          case '/help': case '/?':
            chatHelp();
            break;

          default:
            warn(`Unknown command: ${col('white', cmd)}  (type ${col('cyan', '/help')})`);
        }

        if (mainRl) mainRl.prompt();
        return;
      }

      // ── Empty input ──────────────────────────────────────────────────────────
      if (!trimmed) { if (mainRl) mainRl.prompt(); return; }

      // ── Send message ─────────────────────────────────────────────────────────
      try {
        const reply = await streamMessage(trimmed, history, { webSearch, thinking, style }, token, base);

        if (reply) {
          history.push({ role: 'user',      content: trimmed });
          history.push({ role: 'assistant', content: reply });
          // Keep last 20 messages to avoid unbounded memory
          if (history.length > 20) history = history.slice(-20);
        }
      } catch (e) {
        console.log('');
        err(e.message);
        console.log('');
      }

      if (mainRl) mainRl.prompt();
    };

    if (mainRl) {
      mainRl.on('line', handleLine);
    } else {
      // Fallback: no main REPL (invoked directly from CLI args)
      const tmpRl = readline.createInterface({
        input: process.stdin, output: process.stdout,
        prompt: CHAT_PROMPT, terminal: true,
      });
      printHeader(webSearch, thinking, style);
      tmpRl.prompt();
      tmpRl.on('line', async (line) => {
        await handleLine(line);
        tmpRl.prompt();
      });
      tmpRl.on('close', resolve);
    }
  });
}
