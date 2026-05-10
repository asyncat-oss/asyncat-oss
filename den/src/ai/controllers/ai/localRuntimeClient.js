import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function flattenMessageContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item?.type === 'text') return item.text || '';
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(content || '');
}

function promptFromChat({ messages = [], system = null }) {
  const lines = [];
  if (system) {
    lines.push('System instructions:', system, '');
  }
  for (const message of messages) {
    const role = message.role === 'assistant' ? 'Assistant' : message.role === 'system' ? 'System' : 'User';
    lines.push(`${role}: ${flattenMessageContent(message.content)}`);
  }
  lines.push('', 'Respond as the assistant. Return only the final answer.');
  return lines.join('\n');
}

function errorWithOutput(label, code, stderr, stdout) {
  const details = [stderr, stdout].filter(Boolean).join('\n').trim();
  const suffix = details ? `\n${details.slice(0, 2000)}` : '';
  return new Error(`${label} exited with code ${code}.${suffix}`);
}

function runCommand({ command, args, input = '', cwd = process.cwd(), timeoutMs = DEFAULT_TIMEOUT_MS, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        HERMES_ACCEPT_HOOKS: process.env.HERMES_ACCEPT_HOOKS || '1',
      },
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    const abort = () => {
      child.kill('SIGTERM');
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener?.('abort', abort, { once: true });

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', err => {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', abort);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', abort);
      if (code === 0) resolve({ stdout, stderr });
      else reject(errorWithOutput(command, code, stderr, stdout));
    });

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

function responseFromText(text, model) {
  return {
    id: `local-runtime-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

async function* streamFromText(text, model) {
  if (text) {
    yield {
      id: `local-runtime-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    };
  }
  yield {
    id: `local-runtime-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  };
}

export class LocalRuntimeClient {
  constructor({ runtime, defaultModel = '', settings = {} } = {}) {
    this.runtime = runtime;
    this.defaultModel = defaultModel || 'gpt-5.5';
    this.settings = settings || {};
    this.client = {
      chat: {
        completions: {
          create: async (options = {}, requestOptions = {}) => this.createChatCompletion(options, requestOptions),
        },
      },
    };
    this.messages = {
      create: async (options = {}) => {
        const result = await this.createChatCompletion({
          model: options.model,
          messages: options.messages || [],
          system: options.system || null,
          max_tokens: options.max_tokens || options.max_completion_tokens,
        });
        return {
          id: result.id,
          content: [{ type: 'text', text: result.choices?.[0]?.message?.content || '' }],
          model: result.model,
          role: 'assistant',
          type: 'message',
          usage: {
            input_tokens: result.usage?.prompt_tokens || 0,
            output_tokens: result.usage?.completion_tokens || 0,
            total_tokens: result.usage?.total_tokens || 0,
          },
        };
      },
    };
  }

  async createChatCompletion(options = {}, requestOptions = {}) {
    const model = options.model || this.defaultModel;
    const prompt = promptFromChat({
      system: options.system,
      messages: options.messages || [],
    });
    const text = await this.runPrompt(prompt, model, requestOptions?.signal);
    if (options.stream) return streamFromText(text, model);
    return responseFromText(text, model);
  }

  async runPrompt(prompt, model, signal) {
    if (this.runtime === 'codex-cli') {
      const outputPath = path.join(os.tmpdir(), `asyncat-codex-${process.pid}-${Date.now()}.txt`);
      try {
        await runCommand({
          command: this.settings.command || 'codex',
          args: [
            'exec',
            '--model', model,
            '--sandbox', 'read-only',
            '--skip-git-repo-check',
            '--ephemeral',
            '--color', 'never',
            '--output-last-message', outputPath,
            '-',
          ],
          input: prompt,
          cwd: this.settings.cwd || process.cwd(),
          timeoutMs: Number(this.settings.timeoutMs) || DEFAULT_TIMEOUT_MS,
          signal,
        });
        return fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').trim() : '';
      } finally {
        try { fs.unlinkSync(outputPath); } catch {}
      }
    }

    throw new Error(`Unsupported local runtime: ${this.runtime || 'unknown'}`);
  }
}

export default LocalRuntimeClient;
