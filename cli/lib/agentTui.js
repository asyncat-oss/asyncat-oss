import blessed from 'neo-blessed';
import { col } from './colors.js';
import tty from 'tty';

let screen = null;
let chatBox = null;
let thoughtBox = null;
let toolBox = null;
let inputBox = null;
let statusBar = null;

function stripAnsi(str) {
  return str.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
}

export function initTui(onSubmit, onExit) {
  const cleanInput = new tty.ReadStream(0);

  screen = blessed.screen({
    smartCSR: true,
    input: cleanInput,
    title: 'Asyncat Agent Command Center',
    cursor: { artificial: true, shape: 'line', blink: true, color: null },
  });

  // Handle exiting
  screen.key(['escape', 'C-c'], () => {
    screen.destroy();
    if (onExit) onExit();
    process.exit(0);
  });

  // ── Layout ─────────────────────────────────────────────────────────────

  // Left panel (Chat history)
  chatBox = blessed.log({
    parent: screen,
    top: 0,
    left: 0,
    width: '60%',
    height: '100%-3', // Leave room for input
    border: { type: 'line' },
    style: { border: { fg: 'blue' } },
    label: ' Agent Chat ',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: ' ', style: { bg: 'blue' } }
  });

  // Top Right (Memory & Thoughts)
  thoughtBox = blessed.log({
    parent: screen,
    top: 0,
    left: '60%',
    width: '40%',
    height: '50%',
    border: { type: 'line' },
    style: { border: { fg: 'yellow' } },
    label: ' Memory & Thoughts ',
    tags: true,
    scrollable: true,
    alwaysScroll: true
  });

  // Bottom Right (Tool Execution)
  toolBox = blessed.log({
    parent: screen,
    top: '50%',
    left: '60%',
    width: '40%',
    height: '100%-3-50%', // 100% minus input height minus 50% for thought box
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    label: ' Tool Execution ',
    tags: true,
    scrollable: true,
    alwaysScroll: true
  });

  // Status Bar (just above input)
  statusBar = blessed.box({
    parent: screen,
    top: '100%-3',
    left: 0,
    width: '100%',
    height: 1,
    content: '{blue-fg} Asyncat Agent {/blue-fg} | Type /help for commands | Press ESC to exit',
    tags: true,
    style: { fg: 'grey' }
  });

  // Bottom Input
  inputBox = blessed.textbox({
    parent: screen,
    top: '100%-2',
    left: 0,
    width: '100%',
    height: 3,
    inputOnFocus: true,
    border: { type: 'line' },
    style: { border: { fg: 'green' } },
    label: ' ▸ User Input ',
  });

  inputBox.key('enter', () => {
    const text = inputBox.getValue().trim();
    if (text) {
      inputBox.clearValue();
      screen.render();
      onSubmit(text);
    } else {
      // Just focus again
      inputBox.focus();
    }
  });

  // Focus input by default
  inputBox.focus();
  screen.render();

  return {
    screen,
    chat: (text) => {
      chatBox.log(text);
    },
    thought: (text) => {
      thoughtBox.log(text);
    },
    tool: (text) => {
      toolBox.log(text);
    },
    setStatus: (text) => {
      statusBar.setContent(text);
      screen.render();
    },
    clearInput: () => {
      inputBox.clearValue();
      screen.render();
    },
    focusInput: () => {
      inputBox.focus();
      screen.render();
    },
    destroy: () => {
      screen.destroy();
    },
    askPermission: (toolName, args, permission) => {
      return new Promise((resolve) => {
        const question = blessed.question({
          parent: screen,
          border: 'line',
          height: 'shrink',
          width: 'half',
          top: 'center',
          left: 'center',
          label: ' Permission Request ',
          tags: true,
          keys: true,
          vi: true
        });

        let argPreview = JSON.stringify(args).slice(0, 100);
        if (toolName === 'run_command') argPreview = args.command;

        question.ask(`Agent wants to run {red-fg}${toolName}{/red-fg}.\nArgs: ${argPreview}\n\nAllow? (Y/N/A for all session)`, (err, value) => {
          if (err || !value) { resolve('deny'); return; }
          const v = value.toLowerCase();
          if (v === 'a' || v === 'all') resolve('allow_session');
          else if (v === 'y' || v === 'yes') resolve('allow');
          else resolve('deny');
        });
      });
    }
  };
}

export function updateTuiEvent(tui, event, opts = {}) {
  const { type, data } = event;

  switch (type) {
    case 'thinking':
      const roundNum = (data.round !== undefined) ? data.round + 1 : 1;
      if (data.thought) {
        tui.thought(`{yellow-fg}🧠 Thinking (Round ${roundNum}){/yellow-fg}`);
        for (const line of data.thought.split('\n')) {
          tui.thought(`{grey-fg}│{/grey-fg}  ${stripAnsi(line)}`);
        }
        tui.thought(`{grey-fg}╰─{/grey-fg}\n`);
      } else {
        tui.thought(`{yellow-fg}🧠 Thinking (Round ${roundNum}){/yellow-fg}`);
      }
      break;

    case 'tool_start':
      tui.tool(`{cyan-fg}🔧 Tool: ${data.tool}{/cyan-fg}`);
      if (data.description) {
        const descLines = stripAnsi(data.description).split('\n');
        for (const line of descLines) {
          tui.tool(`{grey-fg}│{/grey-fg}  ${line}`);
        }
      }
      break;

    case 'tool_result':
      if (data.result?.success) {
        tui.tool(`{green-fg}├─ ✔ Success{/green-fg}`);
        
        const content = data.result.content || data.result.listing || data.result.results ||
          data.result.message || data.result.files || '';
        const preview = typeof content === 'string'
          ? content.split('\n').slice(0, 3).join('\n')
          : JSON.stringify(content).slice(0, 100);
        
        if (preview) {
          for (const line of stripAnsi(preview).split('\n')) {
            tui.tool(`{grey-fg}│{/grey-fg}  ${line}`);
          }
          const total = typeof content === 'string' ? content.split('\n').length : 0;
          if (total > 3) tui.tool(`{grey-fg}│  … (${total - 3} more lines hidden){/grey-fg}`);
        }
        tui.tool(`{grey-fg}╰─{/grey-fg}\n`);
      } else {
        tui.tool(`{red-fg}├─ ✘ Failed{/red-fg}`);
        tui.tool(`{grey-fg}│{/grey-fg}  ${stripAnsi(data.result?.error || 'Unknown error')}`);
        tui.tool(`{grey-fg}╰─{/grey-fg}\n`);
      }
      break;

    case 'answer':
      tui.chat(`{magenta-fg}🤖 Asyncat ▸{/magenta-fg}`);
      tui.chat(stripAnsi(data.answer || ''));
      tui.chat(''); // empty line
      break;

    case 'error':
      tui.chat(`{red-fg}⚠ Agent error: ${stripAnsi(data.message || 'Unknown error')}{/red-fg}`);
      break;
      
    case 'done':
      tui.setStatus(`{blue-fg} Asyncat Agent {/blue-fg} | Ready (took ${data.rounds} rounds)`);
      break;
  }
}
