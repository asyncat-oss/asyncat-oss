#!/usr/bin/env node
// A stand-in for llama-server in tests and demo runs. It takes the same
// options Asyncat passes (-m, --port, --lora…), serves /health, /props,
// /v1/models, /lora-adapters and /v1/chat/completions (streamed or not), and
// answers differently when a LoRA adapter is applied (its scale above 0), so
// the before/after comparison can be checked without a real model.

import http from 'node:http';
import path from 'node:path';

const argv = process.argv.slice(2);
if (argv.includes('--version')) {
  console.log('version: 9999 (fake llama-server)');
  process.exit(0);
}
const option = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const port = Number(option('--port', 8765));
const model = option('-m', 'model.gguf');
const adapters = [];
argv.forEach((arg, i) => { if (arg === '--lora') adapters.push({ id: adapters.length, path: argv[i + 1], scale: 1 }); });

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const json = (() => { try { return JSON.parse(body || '{}'); } catch { return {}; } })();
    if (req.url === '/health') return send(res, 200, { status: 'ok' });
    if (req.url === '/props') return send(res, 200, { n_ctx_train: 4096, modalities: { vision: false } });
    if (req.url === '/v1/models') return send(res, 200, { object: 'list', data: [{ id: path.basename(model) }] });
    if (req.url === '/lora-adapters' && req.method === 'GET') return send(res, 200, adapters);
    if (req.url === '/lora-adapters' && req.method === 'POST') {
      for (const item of Array.isArray(json) ? json : []) {
        const adapter = adapters.find((a) => a.id === item.id);
        if (adapter) adapter.scale = Number(item.scale);
      }
      return send(res, 200, { success: true });
    }
    if (req.url === '/v1/chat/completions') {
      // A request's own "lora" list wins; adapters it leaves out count as 0.
      const scale = Array.isArray(json.lora)
        ? Number(json.lora.find((item) => item.id === 0)?.scale || 0)
        : Number(adapters[0]?.scale || 0);
      const question = String(json.messages?.at(-1)?.content || '');
      const content = scale > 0
        ? `Water them deeply twice a week, in the morning. (${question.slice(0, 40)})`
        : `It depends on many things. (${question.slice(0, 40)})`;
      if (json.stream) {
        // Streamed answers also say which model file is loaded, so a test can
        // tell which model answered.
        const chunk = (choices, extra = {}) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: path.basename(model), choices, ...extra })}\n\n`;
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(chunk([{ index: 0, delta: { role: 'assistant', content: `${content} [${path.basename(model)}]` }, finish_reason: null }]));
        res.write(chunk([{ index: 0, delta: {}, finish_reason: 'stop' }]));
        res.write(chunk([], { usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } }));
        return res.end('data: [DONE]\n\n');
      }
      return send(res, 200, { id: 'x', object: 'chat.completion', model: path.basename(model), choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] });
    }
    send(res, 404, { error: 'not found' });
  });
}).listen(port, '127.0.0.1');
