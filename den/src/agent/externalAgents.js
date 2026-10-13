// externalAgents.js — run Claude Code or Codex as the agent for a conversation.
//
// Both CLIs are full coding agents with their own sign-in, tools and session
// history. Asyncat starts them in their non-interactive JSON modes, in the
// conversation's Project folder (or a private scratch folder), and translates
// their events into the same SSE events Asyncat's own agent sends, so the chat
// feed renders their steps and answers unchanged.
//
//   claude -p --output-format stream-json --verbose --include-partial-messages
//   codex exec --json [resume <thread>]

import { execFile, spawn } from 'child_process';
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { runtimeDataPath } from '../config/runtimeConfig.js';
import { approvalAllows, approvalCoversRun } from './approvalDecisions.js';
import { claudeUsageFromEvent, recordUsage } from './externalUsage.js';

const execFileAsync = promisify(execFile);

export const EXTERNAL_ENGINES = {
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    signInCommand: 'claude auth login',
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code',
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    signInCommand: 'codex login',
    installUrl: 'https://github.com/openai/codex',
  },
};

export function isExternalEngine(engine) {
  return Object.prototype.hasOwnProperty.call(EXTERNAL_ENGINES, engine);
}

/** Agents spoken to over the Agent Client Protocol are engines "acp:<name>". */
export function isAcpEngine(engine) {
  return typeof engine === 'string' && /^acp:[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(engine);
}

// Apps started from a desktop launcher often get a minimal PATH without the
// folders these CLIs install into.
export function agentPath() {
  const home = os.homedir();
  const extra = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.claude', 'local'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ];
  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return [...current, ...extra.filter((dir) => !current.includes(dir))].join(path.delimiter);
}

export function agentEnv() {
  const env = { ...process.env, PATH: agentPath(), NO_COLOR: '1' };
  // A FORCE_COLOR inherited from a dev runner would override NO_COLOR and put
  // colour codes into command output.
  delete env.FORCE_COLOR;
  return env;
}

export function findBinary(command) {
  const names = process.platform === 'win32' ? [`${command}.cmd`, `${command}.exe`, command] : [command];
  for (const dir of agentPath().split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch { /* not here */ }
    }
  }
  return null;
}

async function run(binary, args, timeout = 8000) {
  const { stdout, stderr } = await execFileAsync(binary, args, { timeout, env: agentEnv(), windowsHide: true });
  return `${stdout || ''}${stderr || ''}`.trim();
}

/** Which agent CLIs are installed and signed in. */
export async function detectExternalEngines() {
  const results = [];
  for (const engine of Object.values(EXTERNAL_ENGINES)) {
    const binary = findBinary(engine.command);
    const info = {
      id: engine.id,
      name: engine.name,
      installed: Boolean(binary),
      signInCommand: engine.signInCommand,
      installUrl: engine.installUrl,
      models: engineModels(engine.id),
    };
    if (!binary) {
      results.push(info);
      continue;
    }
    try {
      info.version = (await run(binary, ['--version'])).split('\n')[0];
    } catch { /* version is informational */ }
    try {
      if (engine.id === 'claude-code') {
        const status = JSON.parse(await run(binary, ['auth', 'status', '--json']));
        info.signedIn = Boolean(status.loggedIn);
        info.account = status.email || null;
      } else {
        const text = await run(binary, ['login', 'status']);
        info.signedIn = /logged in/i.test(text) && !/not logged in/i.test(text);
        info.account = /chatgpt/i.test(text) ? 'ChatGPT account' : /api key/i.test(text) ? 'API key' : null;
      }
    } catch {
      info.signedIn = false;
    }
    results.push(info);
  }
  return results;
}

// Codex's default when no model is picked: one every ChatGPT plan can use, so a
// model in config.toml that the account can't use doesn't break it.
export const CODEX_DEFAULT_MODEL = 'gpt-5.5';

/**
 * Models offered in the composer. `id: null` keeps the CLI's own default.
 * Codex lists what its model cache says this account can pick.
 */
export function engineModels(engine, env = process.env) {
  if (engine === 'claude-code') {
    return [
      { id: null, label: 'Default', hint: 'Whatever Claude Code is set to use' },
      { id: 'opus', label: 'Opus', hint: 'Most capable' },
      { id: 'sonnet', label: 'Sonnet', hint: 'Fast and capable' },
      { id: 'haiku', label: 'Haiku', hint: 'Fastest' },
    ];
  }
  const models = [{ id: null, label: 'GPT-5.5', hint: 'Default' }];
  try {
    const home = env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const cache = JSON.parse(fs.readFileSync(path.join(home, 'models_cache.json'), 'utf8'));
    const listed = (cache.models || [])
      .filter((model) => model.visibility === 'list' && model.slug && model.slug !== CODEX_DEFAULT_MODEL)
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    for (const model of listed) models.push({ id: model.slug, label: model.display_name || model.slug, hint: model.description || '' });
  } catch { /* no cache yet: only the default */ }
  return models;
}

/** Where an external agent works when the conversation has no Project. */
export function scratchWorkspace() {
  const dir = runtimeDataPath('agent-workspace');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Event translation ───────────────────────────────────────────────────────

const CLAUDE_TOOL_NAMES = {
  Bash: 'run_command',
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'edit_file',
  MultiEdit: 'edit_file',
  NotebookEdit: 'edit_file',
  Glob: 'glob_find',
  Grep: 'search_files',
  LS: 'list_directory',
  WebSearch: 'web_search',
  WebFetch: 'browse_website',
  TodoWrite: 'todo_write',
};

export function claudeToolCall(block) {
  const input = block.input || {};
  const tool = CLAUDE_TOOL_NAMES[block.name] || block.name;
  const args = { ...input };
  if (input.file_path || input.notebook_path) args.path = input.file_path || input.notebook_path;
  if (input.pattern && !args.query) args.query = input.pattern;
  if (input.url && !args.query) args.query = input.url;
  if (input.description && !args.query && !args.command) args.query = input.description;
  return { tool, toolCallId: block.id, args, description: input.description || '', engineTool: block.name };
}

function toolResultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join('\n');
  return '';
}

function codexToolCall(item) {
  if (item.type === 'command_execution') {
    return { tool: 'run_command', toolCallId: item.id, args: { command: String(item.command || '').replace(/^\/usr\/bin\/bash -lc /, '') } };
  }
  if (item.type === 'file_change') {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const first = changes[0] || {};
    return {
      tool: first.kind === 'add' ? 'write_file' : first.kind === 'delete' ? 'file_delete' : 'edit_file',
      toolCallId: item.id,
      args: { path: first.path || '', files: changes.map((change) => change.path) },
    };
  }
  if (item.type === 'web_search') return { tool: 'web_search', toolCallId: item.id, args: { query: item.query || '' } };
  if (item.type === 'mcp_tool_call') {
    return { tool: `${item.server || 'mcp'}.${item.tool || 'tool'}`, toolCallId: item.id, args: item.arguments || {} };
  }
  if (item.type === 'todo_list') {
    const items = Array.isArray(item.items) ? item.items : [];
    return {
      tool: 'todo_write',
      toolCallId: item.id,
      args: { todos: items.map((entry) => ({ content: entry.text, status: entry.completed ? 'completed' : 'pending' })) },
    };
  }
  return null;
}

// ── Running ─────────────────────────────────────────────────────────────────

function buildCommand(engine, { goal, workingDir, externalSessionId, agentMode, autoApprove, model, approvalConfigPath }) {
  if (engine === 'claude-code') {
    const permissionMode = agentMode === 'plan' ? 'plan' : autoApprove ? 'bypassPermissions' : 'acceptEdits';
    const args = [
      '-p', goal,
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode', permissionMode,
    ];
    if (externalSessionId) args.push('--resume', externalSessionId);
    if (model) args.push('--model', model);
    // Without this, anything acceptEdits doesn't cover (shell commands, web
    // fetches) is refused outright in -p mode. With it, Claude Code asks the
    // user through Asyncat's approval card.
    if (approvalConfigPath) args.push('--mcp-config', approvalConfigPath, '--permission-prompt-tool', 'mcp__asyncat__approve');
    return { command: 'claude', args };
  }
  // Codex: plan reads only, action may write inside the workspace (sandboxed),
  // auto-approve drops the sandbox. Model and effort are passed explicitly so a
  // config.toml written for an API key does not break a ChatGPT sign-in.
  const sandbox = agentMode === 'plan' ? 'read-only' : autoApprove ? 'danger-full-access' : 'workspace-write';
  const args = [
    'exec', '--json', '--skip-git-repo-check',
    '-C', workingDir,
    '-s', sandbox,
    '-m', model || CODEX_DEFAULT_MODEL,
    '-c', 'model_reasoning_effort="medium"',
  ];
  if (externalSessionId) args.push('resume', externalSessionId, goal);
  else args.push(goal);
  return { command: 'codex', args };
}

/**
 * Run one turn with an external agent. `emit(type, data)` receives Asyncat
 * agent events. Resolves with { answer, externalSessionId, stopReason, usage }.
 */
export function runExternalAgent({ engine, goal, workingDir, externalSessionId = null, agentMode = 'action', autoApprove = false, model = null, approvalConfigPath = null, emit, abortSignal }) {
  const spec = EXTERNAL_ENGINES[engine];
  return new Promise((resolve, reject) => {
    const binary = findBinary(spec.command);
    if (!binary) {
      reject(new Error(`${spec.name} isn't installed. Install it, sign in with \`${spec.signInCommand}\`, then try again.`));
      return;
    }
    const { args } = buildCommand(engine, { goal, workingDir, externalSessionId, agentMode, autoApprove, model, approvalConfigPath });
    // Approvals wait on a person, so give the approval tool longer than
    // Claude Code's default MCP tool timeout.
    const env = approvalConfigPath ? { ...agentEnv(), MCP_TOOL_TIMEOUT: String(10 * 60 * 1000) } : agentEnv();
    const child = spawn(binary, args, { cwd: workingDir, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    let sessionId = externalSessionId;
    let answer = '';
    let usage = null;
    let failure = null;
    let stderr = '';
    let buffer = '';
    const openTools = new Map();

    const onAbort = () => child.kill('SIGTERM');
    abortSignal?.addEventListener('abort', onAbort, { once: true });

    const handleClaude = (event) => {
      if (event.type === 'system' && event.subtype === 'init') {
        sessionId = event.session_id || sessionId;
        return;
      }
      if (event.type === 'rate_limit_event' && event.rate_limit_info) {
        recordUsage('claude-code', claudeUsageFromEvent(event.rate_limit_info));
        return;
      }
      if (event.type === 'stream_event') {
        const inner = event.event || {};
        if (inner.type === 'content_block_delta') {
          if (inner.delta?.type === 'text_delta' && inner.delta.text) emit('delta', { content: inner.delta.text });
          if (inner.delta?.type === 'thinking_delta' && inner.delta.thinking) emit('reasoning_delta', { content: inner.delta.thinking });
        }
        return;
      }
      if (event.type === 'assistant') {
        for (const block of event.message?.content || []) {
          if (block.type === 'tool_use') {
            const call = claudeToolCall(block);
            openTools.set(block.id, call);
            emit('tool_start', call);
          } else if (block.type === 'thinking' && block.thinking) {
            emit('thinking', { thought: block.thinking });
          }
        }
        return;
      }
      if (event.type === 'user') {
        for (const block of event.message?.content || []) {
          if (block.type !== 'tool_result') continue;
          const call = openTools.get(block.tool_use_id) || { tool: 'tool', toolCallId: block.tool_use_id };
          openTools.delete(block.tool_use_id);
          const output = toolResultText(block.content);
          emit('tool_result', {
            tool: call.tool,
            toolCallId: block.tool_use_id,
            result: block.is_error ? { success: false, error: output.slice(0, 4000) } : { success: true, output: output.slice(0, 4000) },
          });
        }
        return;
      }
      if (event.type === 'result') {
        sessionId = event.session_id || sessionId;
        usage = event.usage || null;
        if (event.is_error) failure = event.result || 'Claude Code reported an error.';
        else answer = event.result || answer;
      }
    };

    const handleCodex = (event) => {
      if (event.type === 'thread.started') {
        sessionId = event.thread_id || sessionId;
        return;
      }
      if (event.type === 'item.started' || event.type === 'item.completed') {
        const item = event.item || {};
        if (item.type === 'agent_message') {
          if (event.type === 'item.completed' && item.text) {
            // Earlier messages are progress notes; the last one is the answer.
            if (answer) emit('delta', { content: '\n\n' });
            emit('delta', { content: item.text });
            answer = item.text;
          }
          return;
        }
        if (item.type === 'reasoning') {
          if (event.type === 'item.completed' && item.text) emit('thinking', { thought: item.text });
          return;
        }
        if (item.type === 'error') return; // non-fatal notices (e.g. missing model metadata)
        const call = codexToolCall(item);
        if (!call) return;
        // Some items arrive only as item.completed; start them here too.
        if (!openTools.has(item.id)) {
          openTools.set(item.id, call);
          emit('tool_start', call);
        }
        if (event.type === 'item.completed') {
          openTools.delete(item.id);
          const failed = item.status === 'failed' || (item.exit_code != null && item.exit_code !== 0);
          const output = String(item.aggregated_output || '').slice(0, 4000);
          emit('tool_result', {
            tool: call.tool,
            toolCallId: item.id,
            result: failed ? { success: false, error: output || `Exited with code ${item.exit_code}` } : { success: true, output },
          });
        }
        return;
      }
      if (event.type === 'turn.completed') {
        usage = event.usage || null;
        return;
      }
      if (event.type === 'turn.failed' || event.type === 'error') {
        failure = codexErrorMessage(event.error?.message || event.message);
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        try {
          if (engine === 'claude-code') handleClaude(event);
          else handleCodex(event);
        } catch (err) {
          console.warn(`[${engine}] Could not translate event:`, err.message);
        }
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });

    child.on('error', (err) => {
      abortSignal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    child.on('close', (code) => {
      abortSignal?.removeEventListener('abort', onAbort);
      for (const [toolCallId, call] of openTools) {
        emit('tool_result', { tool: call.tool, toolCallId, result: { success: false, error: 'Stopped before it finished.' } });
      }
      if (abortSignal?.aborted) {
        resolve({ answer, externalSessionId: sessionId, stopReason: 'aborted', usage });
        return;
      }
      if (failure || (code !== 0 && !answer)) {
        const detail = failure || stderr.trim().split('\n').slice(-3).join(' ') || `${spec.name} exited with code ${code}.`;
        reject(Object.assign(new Error(friendlyFailure(engine, detail)), { externalSessionId: sessionId }));
        return;
      }
      resolve({ answer, externalSessionId: sessionId, stopReason: 'answer', usage });
    });
  });
}

function codexErrorMessage(raw) {
  if (!raw) return 'Codex reported an error.';
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || parsed?.message || raw;
  } catch {
    return raw;
  }
}

function friendlyFailure(engine, detail) {
  const spec = EXTERNAL_ENGINES[engine];
  if (/not logged in|please run .*login|unauthori[sz]ed|sign in/i.test(detail)) {
    return `${spec.name} isn't signed in. Run \`${spec.signInCommand}\` in a terminal, then try again.`;
  }
  if (/another Claude Code process is refreshing/i.test(detail)) {
    return 'Claude Code was refreshing its sign-in in another window. Try again in a moment.';
  }
  return `${spec.name}: ${detail}`;
}

// ── Approvals for Claude Code ───────────────────────────────────────────────

const APPROVAL_SCRIPT = fileURLToPath(new URL('./claudeApprovalMcp.js', import.meta.url));
const approvalRuns = new Map();

function describeClaudeAction(toolName, input = {}) {
  if (toolName === 'Bash') return input.description || `Run \`${String(input.command || '').slice(0, 200)}\``;
  if (toolName === 'WebFetch') return `Open ${input.url || 'a web page'}`;
  if (toolName === 'WebSearch') return `Search the web for "${input.query || ''}"`;
  if (input.file_path) return `${toolName} ${input.file_path}`;
  return `Use ${toolName}`;
}

/**
 * Let one Claude Code run ask the user before acting. Writes an MCP config
 * (private to this user) naming the approval server, with a URL and secret for
 * this run. `requestPermission` is the route's usual approval prompt.
 */
export function openExternalApprovals({ requestPermission, port, alwaysAllowedTools = [], workingDir = null }) {
  const runId = randomUUID();
  const token = randomBytes(24).toString('hex');
  const dir = runtimeDataPath('tmp');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const configPath = path.join(dir, `claude-approval-${runId}.json`);
  const config = {
    mcpServers: {
      asyncat: {
        type: 'stdio',
        command: process.execPath,
        args: [APPROVAL_SCRIPT],
        env: {
          ASYNCAT_APPROVAL_URL: `http://127.0.0.1:${port}/api/agent/external-approvals/${runId}`,
          ASYNCAT_APPROVAL_TOKEN: token,
        },
      },
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  approvalRuns.set(runId, { token, requestPermission, allowed: new Set(alwaysAllowedTools), workingDir });
  return {
    configPath,
    close() {
      approvalRuns.delete(runId);
      fs.rmSync(configPath, { force: true });
    },
  };
}

function tokensMatch(expected, given) {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(given || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Answer one approval request from the MCP server. Returns null when the run
 * or its secret is unknown, otherwise Claude Code's permission result.
 */
export async function decideExternalApproval(runId, token, { toolName, input = {}, toolUseId = null } = {}) {
  const run = approvalRuns.get(runId);
  if (!run || !tokensMatch(run.token, token)) return null;
  const call = claudeToolCall({ name: toolName, input, id: toolUseId });
  if (run.allowed.has(call.tool)) return { behavior: 'allow' };
  const decision = await run.requestPermission({
    tool: call.tool,
    toolCallId: toolUseId,
    args: call.args,
    permission: 'dangerous',
    description: describeClaudeAction(toolName, input),
    workingDir: run.workingDir,
    engine: 'claude-code',
  });
  const allowed = approvalAllows(decision?.decision);
  if (approvalCoversRun(decision?.decision)) run.allowed.add(call.tool);
  return allowed ? { behavior: 'allow' } : { behavior: 'deny', message: decision?.reason || 'The user declined this action.' };
}
