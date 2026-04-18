// asyncat run <model>
// Direct terminal chat with the local llama-server (localhost:8765).
// No den backend required — hits the OpenAI-compatible endpoint directly.

import readline from 'readline';
import { readEnv } from '../lib/env.js';
import { getRl, col, log, ok, warn, err, info } from '../lib/colors.js';
import { renderMarkdown } from '../lib/markdown.js';

const RUN_PROMPT = `  ${col('green', 'you')} ${col('dim', '▸')} `;
const AI_LABEL   = `  ${col('cyan',  'model')} ${col('dim', '▸')} `;

function getLlamaBase() {
  const env  = readEnv('den/.env');
  const port = env['LLAMA_SERVER_PORT'] || '8765';
  return `http://127.0.0.1:${port}`;
}

async function checkLlamaServer(base) {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch (_) { return false; }
}

async function getLoadedModels(base) {
  try {
    const res = await fetch(`${base}/v1/models`, {
      headers: { Authorization: 'Bearer local' },
      signal:  AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(m => m.id);
  } catch (_) { return []; }
}

async function streamCompletion(base, modelName, messages) {
  const res = await fetch(`${base}/v1/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local' },
    body:    JSON.stringify({
      model:      modelName || 'local',
      messages,
      stream:     true,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`llama-server ${res.status}: ${text.slice(0, 120)}`);
  }

  process.stdout.write('\n' + AI_LABEL);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = '';
  let full      = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const parsed = JSON.parse(raw);
        const chunk  = parsed.choices?.[0]?.delta?.content || '';
        if (chunk) {
          full += chunk;
          process.stdout.write(chunk);
        }
        // thinking tokens from QwQ / DeepSeek-R1
        const thinking = parsed.choices?.[0]?.delta?.reasoning_content || '';
        if (thinking && !full) {
          process.stdout.write(col('dim', thinking));
        }
      } catch (_) {}
    }
  }

  // Rerender with markdown after streaming
  if (full) {
    const lineCount = full.split('\n').length;
    process.stdout.write(`\x1b[${lineCount}A\r\x1b[J`);
    process.stdout.write(renderMarkdown(full));
  }
  process.stdout.write('\n\n');
  return full;
}

export async function run(args = []) {
  const base = getLlamaBase();

  // ── Check server is up ───────────────────────────────────────────────────────
  const alive = await checkLlamaServer(base);
  if (!alive) {
    err(`llama-server is not running at ${col('white', base)}`);
    info(`Load a model first:  ${col('cyan', 'models serve <filename.gguf>')}`);
    info(`Or start the backend: ${col('cyan', 'start')}`);
    return;
  }

  // ── Detect loaded model ──────────────────────────────────────────────────────
  const models    = await getLoadedModels(base);
  const modelName = args[0] || models[0] || 'local';

  console.log('');
  console.log(`  ${col('cyan', col('bold', 'asyncat run'))}  ${col('dim', '─'.repeat(36))}`);
  console.log(`  ${col('dim', 'model: ')}${col('white', modelName)}  ${col('dim', `@ ${base}`)}`);
  console.log(`  ${col('dim', '/bye or ctrl+c to exit · /clear to clear · /reset to restart')}`);
  console.log('');

  const mainRl        = getRl();
  const savedListeners = mainRl ? mainRl.rawListeners('line') : [];
  const savedPrompt    = mainRl ? mainRl._prompt : '';

  let history = [
    { role: 'system', content: 'You are a helpful AI assistant. Be concise and accurate.' },
  ];

  if (mainRl) {
    mainRl.removeAllListeners('line');
    mainRl.setPrompt(RUN_PROMPT);
    mainRl.prompt();
  }

  return new Promise((resolve) => {
    const exit = () => {
      if (mainRl) {
        mainRl.removeAllListeners('line');
        for (const l of savedListeners) mainRl.on('line', l);
        mainRl.setPrompt(savedPrompt);
      }
      console.log('');
      info('Exited run mode. Type ' + col('cyan', 'help') + ' for commands.');
      console.log('');
      resolve();
    };

    const handleLine = async (input) => {
      const trimmed = input.trim();

      if (!trimmed) { if (mainRl) mainRl.prompt(); return; }

      if (trimmed === '/bye' || trimmed === '/exit' || trimmed === '/quit') {
        exit(); return;
      }
      if (trimmed === '/clear') {
        console.clear();
        console.log(`  ${col('dim', `model: ${modelName}`)}`);
        console.log('');
        if (mainRl) mainRl.prompt();
        return;
      }
      if (trimmed === '/reset') {
        history = [history[0]]; // keep system prompt
        ok('Conversation reset.');
        if (mainRl) mainRl.prompt();
        return;
      }
      if (trimmed === '/info') {
        console.log('');
        info(`Server: ${col('white', base)}`);
        info(`Model:  ${col('white', modelName)}`);
        info(`Turns:  ${col('white', String(Math.floor((history.length - 1) / 2)))}`);
        console.log('');
        if (mainRl) mainRl.prompt();
        return;
      }

      history.push({ role: 'user', content: trimmed });

      try {
        const reply = await streamCompletion(base, modelName, history);
        if (reply) {
          history.push({ role: 'assistant', content: reply });
          // Trim to last 12 exchanges (24 messages) + system prompt
          if (history.length > 25) history = [history[0], ...history.slice(-24)];
        }
      } catch (e) {
        console.log('');
        err(e.message);
        // Remove the user message we just pushed since it failed
        history.pop();
        console.log('');
      }

      if (mainRl) mainRl.prompt();
    };

    if (mainRl) {
      mainRl.on('line', handleLine);
    } else {
      const tmpRl = readline.createInterface({
        input: process.stdin, output: process.stdout,
        prompt: RUN_PROMPT, terminal: true,
      });
      tmpRl.prompt();
      tmpRl.on('line', async (line) => {
        await handleLine(line);
        tmpRl.prompt();
      });
      tmpRl.on('close', resolve);
    }
  });
}
