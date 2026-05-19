import OpenAI from 'openai';
import { getModelCapabilities, normalizeReasoningEffort } from './modelCapabilities.js';

const CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex';
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REFRESH_SKEW_SECONDS = 120;

export const CODEX_MODEL_CATALOG = [
  { id: 'gpt-5.5', name: 'GPT-5.5', context_window: 272000 },
  { id: 'gpt-5.4', name: 'GPT-5.4', context_window: 272000 },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', context_window: 272000 },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', context_window: 272000 },
  { id: 'gpt-5.2', name: 'GPT-5.2', context_window: 272000 },
];

function parseTokenBundle(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : { access_token: String(value) };
  } catch {
    return { access_token: String(value) };
  }
}

function tokenExpiring(accessToken, skewSeconds = REFRESH_SKEW_SECONDS) {
  try {
    const [, payload] = String(accessToken || '').split('.');
    if (!payload) return false;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    const exp = Number(json.exp || 0);
    return exp > 0 && exp <= Math.floor(Date.now() / 1000) + skewSeconds;
  } catch {
    return false;
  }
}

function codexHeaders(accessToken) {
  const headers = {
    'User-Agent': 'codex_cli_rs/0.0.0 (Asyncat)',
    originator: 'codex_cli_rs',
  };
  try {
    const [, payload] = String(accessToken || '').split('.');
    if (!payload) return headers;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    const accountId = claims?.['https://api.openai.com/auth']?.chatgpt_account_id;
    if (typeof accountId === 'string' && accountId) headers['ChatGPT-Account-ID'] = accountId;
  } catch {}
  return headers;
}

function splitMessages(messages = []) {
  const systemParts = [];
  const input = [];
  for (const message of messages) {
    const content = typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content.map(item => item?.text || '').filter(Boolean).join('\n')
        : String(message.content || '');
    if (!content) continue;
    if (message.role === 'system') {
      systemParts.push(content);
    } else {
      input.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content });
    }
  }
  return {
    instructions: systemParts.join('\n\n') || 'You are a helpful assistant.',
    input: input.length ? input : [{ role: 'user', content: '' }],
  };
}

function extractText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  const output = Array.isArray(response?.output) ? response.output : [];
  const chunks = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string') chunks.push(part.text);
      if (typeof part?.value === 'string') chunks.push(part.value);
    }
  }
  return chunks.join('');
}

function normalizeResponseUsage(usage = {}) {
  const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? (inputTokens + outputTokens);
  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: totalTokens,
    prompt_tokens_details: usage.input_tokens_details || usage.prompt_tokens_details || undefined,
    completion_tokens_details: usage.output_tokens_details || usage.completion_tokens_details || undefined,
  };
}

function completionFromText(text, model, usage = null) {
  return {
    id: `codex-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: 'stop',
    }],
    usage: usage ? normalizeResponseUsage(usage) : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

async function* streamText(text, model) {
  if (text) {
    yield {
      id: `codex-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    };
  }
  yield {
    id: `codex-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  };
}

async function* streamCodexResponse(responseStream, model) {
  let finalUsage = null;
  for await (const event of responseStream) {
    if (event?.type === 'response.output_text.delta' && event.delta) {
      yield {
        id: `codex-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: { content: event.delta }, finish_reason: null }],
      };
    }
    if (event?.type === 'response.failed') {
      const message = event?.response?.error?.message || 'Codex response failed.';
      throw new Error(message);
    }
    if (event?.type === 'response.completed' && event?.response?.usage) {
      finalUsage = normalizeResponseUsage(event.response.usage);
    }
  }
  if (finalUsage) {
    yield {
      id: `codex-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [],
      usage: finalUsage,
    };
  }
  yield {
    id: `codex-${Date.now()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  };
}

async function collectCodexStream(responseStream) {
  let text = '';
  let usage = null;
  for await (const event of responseStream) {
    if (event?.type === 'response.output_text.delta' && event.delta) {
      text += event.delta;
    }
    if (event?.type === 'response.failed') {
      const message = event?.response?.error?.message || 'Codex response failed.';
      throw new Error(message);
    }
    if (event?.type === 'response.completed' && event?.response?.usage) {
      usage = normalizeResponseUsage(event.response.usage);
    }
  }
  return { text, usage };
}

export class CodexDirectClient {
  constructor({ apiKey, defaultModel = 'gpt-5.5', baseURL = CODEX_BASE_URL, onTokens } = {}) {
    this.tokens = parseTokenBundle(apiKey);
    this.defaultModel = defaultModel || 'gpt-5.5';
    this.baseURL = String(baseURL || CODEX_BASE_URL).replace(/\/+$/, '');
    this.onTokens = onTokens;
    this.openai = this.makeOpenAIClient();
    this.client = {
      chat: {
        completions: {
          create: async (options = {}, requestOptions = {}) => this.createChatCompletion(options, requestOptions),
        },
      },
    };
    this.messages = {
      create: async (options = {}) => {
        const response = await this.createChatCompletion({
          model: options.model,
          messages: [
            ...(options.system ? [{ role: 'system', content: options.system }] : []),
            ...(options.messages || []),
          ],
          max_tokens: options.max_tokens || options.max_completion_tokens,
        });
        return {
          id: response.id,
          content: [{ type: 'text', text: response.choices?.[0]?.message?.content || '' }],
          model: response.model,
          role: 'assistant',
          type: 'message',
          usage: {
            input_tokens: response.usage?.prompt_tokens || 0,
            output_tokens: response.usage?.completion_tokens || 0,
            total_tokens: response.usage?.total_tokens || 0,
          },
        };
      },
    };
  }

  makeOpenAIClient() {
    const accessToken = this.tokens.access_token || 'not-configured';
    return new OpenAI({
      apiKey: accessToken,
      baseURL: this.baseURL,
      defaultHeaders: codexHeaders(accessToken),
    });
  }

  async ensureAccessToken() {
    const access = String(this.tokens.access_token || '').trim();
    if (access && !tokenExpiring(access)) return access;
    const refresh = String(this.tokens.refresh_token || '').trim();
    if (!refresh) throw new Error('OpenAI Codex is missing a refresh token. Reconnect Codex from the Models page.');

    const response = await fetch(CODEX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: CODEX_CLIENT_ID,
      }),
    });
    if (!response.ok) {
      let message = `Codex token refresh failed with status ${response.status}.`;
      try {
        const data = await response.json();
        const err = data?.error;
        message = err?.message || data?.error_description || message;
        const code = err?.code || err?.type || (typeof err === 'string' ? err : '');
        if (code === 'refresh_token_reused') {
          message = 'Codex refresh token was already consumed by another client. Reconnect Codex in Asyncat to create a fresh Asyncat-owned session.';
        }
      } catch {}
      throw new Error(message);
    }
    const data = await response.json();
    if (!data?.access_token) throw new Error('Codex token refresh did not return an access token.');
    this.tokens = {
      ...this.tokens,
      access_token: data.access_token,
      refresh_token: data.refresh_token || refresh,
    };
    this.openai = this.makeOpenAIClient();
    await this.onTokens?.(JSON.stringify(this.tokens));
    return this.tokens.access_token;
  }

  async createChatCompletion(options = {}, requestOptions = {}) {
    await this.ensureAccessToken();
    const model = options.model || this.defaultModel;
    const { instructions, input } = splitMessages(options.messages || []);
    
    const capabilities = getModelCapabilities('openai-codex', model);
    const reasoningEffort = normalizeReasoningEffort(options.reasoning_effort || options.reasoningEffort, capabilities);
    
    const payload = {
      model,
      input,
      store: false,
      ...(instructions ? { instructions } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    };
    const responseStream = await this.openai.responses.create({ ...payload, stream: true }, requestOptions);
    if (options.stream) return streamCodexResponse(responseStream, model);
    const { text, usage } = await collectCodexStream(responseStream);
    return completionFromText(text, model, usage);
  }
}

export function makeCodexTokenBundle(tokens = {}) {
  return JSON.stringify({
    access_token: tokens.access_token || '',
    refresh_token: tokens.refresh_token || '',
  });
}

export default CodexDirectClient;
