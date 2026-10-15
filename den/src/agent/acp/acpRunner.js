// den/src/agent/acp/acpRunner.js
// One chat turn with an ACP agent: start it, introduce Asyncat, open or
// resume its session in the chat's folder, send the message, and turn what
// it streams back (text, thoughts, tool calls, plans) into Asyncat's run
// events. Its permission questions become approval cards; it may read and
// write files only inside the chat's folder, and in Plan mode only read.

import fs from 'fs';
import path from 'path';
import { approvalAllows, approvalCoversRun, normalizeApprovalDecision } from '../approvalDecisions.js';
import { ACP_PROTOCOL_VERSION, AcpConnection, AcpError } from './acpConnection.js';
import { acpEnv } from './acpAgents.js';
import { downloadCheck, offlineEnv, onlineEnv } from '../../connectors/launchers.js';
import { findBinary } from '../externalAgents.js';

// What an ACP tool kind looks like in Asyncat's step list.
const KIND_TOOL = {
  read: 'read_file',
  edit: 'edit_file',
  delete: 'delete_file',
  move: 'move_file',
  search: 'search_files',
  execute: 'run_command',
  fetch: 'fetch_url',
  think: 'think',
};
const READ_KINDS = new Set(['read', 'search', 'think', 'fetch']);
const PLAN_MODE = /plan|ask|read[\s_-]?only|architect/i;
const MAX_HISTORY = 12;

function text(block) {
  if (!block) return '';
  if (typeof block === 'string') return block;
  if (block.type === 'text') return String(block.text || '');
  if (block.type === 'resource_link') return `[${block.title || block.name || block.uri}]`;
  if (block.type === 'resource') return String(block.resource?.text || '');
  return '';
}

/** Text of a tool call's content list (messages, diffs, terminals). */
export function toolContentText(content = []) {
  return (Array.isArray(content) ? content : []).map((item) => {
    if (item?.type === 'content') return text(item.content);
    if (item?.type === 'diff') return `Changed ${item.path}`;
    if (item?.type === 'terminal') return `[terminal ${item.terminalId}]`;
    return '';
  }).filter(Boolean).join('\n').slice(0, 4000);
}

function unifiedDiff(filePath, oldText, newText = '') {
  if (oldText === newText) return null;
  // No old text: a new file, diffed against /dev/null without an empty
  // "removed" line.
  const a = oldText ? String(oldText).split('\n') : [];
  const b = newText ? String(newText).split('\n') : [];
  const lines = [oldText == null ? '--- /dev/null' : `--- a/${filePath}`, `+++ b/${filePath}`];
  for (let i = 0; i < Math.max(a.length, b.length) && lines.length < 120; i += 1) {
    if (a[i] === b[i]) lines.push(` ${a[i] ?? ''}`);
    else {
      if (a[i] !== undefined) lines.push(`-${a[i]}`);
      if (b[i] !== undefined) lines.push(`+${b[i]}`);
    }
  }
  return lines.join('\n').slice(0, 12000);
}

/**
 * A path the agent may touch: absolute (ACP sends absolute paths) and
 * inside the chat's folder, also after following links.
 */
export function insideFolder(rawPath, folder) {
  const root = fs.realpathSync(folder);
  const resolved = path.resolve(root, String(rawPath || ''));
  let real = resolved;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    // A new file: its folder must be inside.
    try { real = path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved)); } catch { real = resolved; }
  }
  const relative = path.relative(root, real);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AcpError(`${rawPath} is outside this chat's folder, so Asyncat won't open it.`, { code: -32602 });
  }
  return real;
}

function historyText(history = []) {
  const lines = (Array.isArray(history) ? history : [])
    .filter((item) => (item?.role === 'user' || item?.role === 'assistant') && String(item.content || '').trim())
    .slice(-MAX_HISTORY)
    .map((item) => `${item.role === 'user' ? 'User' : 'You'}: ${String(item.content).slice(0, 2000)}`);
  return lines.length ? `Earlier in this conversation:\n${lines.join('\n\n')}\n\n---\n\n` : '';
}

function friendly(agent, err) {
  const message = String(err?.message || err || '');
  if (/auth/i.test(message) && /required|sign|login|log in/i.test(message)) {
    return `${agent.title} needs you to sign in first: run \`${agent.command}\` in a terminal and sign in, then try again.`;
  }
  return message || `${agent.title} stopped with an error.`;
}

/**
 * Run one turn. `requestPermission(request)` resolves to the user's
 * decision; `emit(type, data)` gets Asyncat run events. Resolves to
 * { answer, externalSessionId, stopReason }.
 */
export async function runAcpAgent({
  agent, goal, history = [], workingDir, externalSessionId = null, agentMode = 'action', autoApprove = false,
  requestPermission = null, emit = () => {}, abortSignal = null,
}) {
  const download = downloadCheck(agent.command, agent.args);
  if (download.needed && agent.approvedDownload?.spec !== download.launcher.spec) {
    throw new Error(`${agent.title} would download ${download.launcher.name} first. Give the OK in Customize → Agents → Coding agents.`);
  }
  const binary = path.isAbsolute(agent.command) ? agent.command : findBinary(agent.command);
  if (!binary) throw new Error(`${agent.title} isn't installed on this computer (no "${agent.command}" found).`);
  const launchEnv = download.launcher ? (download.needed ? onlineEnv(download.launcher) : offlineEnv(download.launcher)) : {};
  const canWrite = agentMode === 'action';
  const tools = new Map(); // toolCallId → { tool, title, kind, done }
  const sessionApproved = new Set();
  let answer = '';
  let sessionId = null;
  let planMode = agentMode === 'plan';
  let modePicked = false;

  const startTool = (update) => {
    const kind = update.kind || 'other';
    const call = { tool: KIND_TOOL[kind] || 'agent_tool', title: update.title || kind, kind, done: false };
    tools.set(update.toolCallId, call);
    emit('tool_start', {
      tool: call.tool,
      toolCallId: update.toolCallId,
      args: update.rawInput || { title: call.title },
      description: call.title,
      permission: READ_KINDS.has(kind) ? 'safe' : 'moderate',
      permissionDecision: 'allowed',
      workingDir,
    });
    return call;
  };

  const finishTool = (toolCallId, update) => {
    const call = tools.get(toolCallId);
    if (!call || call.done) return;
    call.done = true;
    const output = toolContentText(update.content) || (update.rawOutput ? JSON.stringify(update.rawOutput).slice(0, 4000) : '');
    emit('tool_result', {
      tool: call.tool,
      toolCallId,
      result: update.status === 'failed' ? { success: false, error: output || `${call.title} failed.` } : { success: true, output },
    });
  };

  const onUpdate = (params) => {
    if (sessionId && params.sessionId && params.sessionId !== sessionId) return;
    const update = params.update || {};
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const chunk = text(update.content);
        if (chunk) {
          answer += chunk;
          emit('delta', { content: chunk });
        }
        break;
      }
      case 'agent_thought_chunk': {
        const chunk = text(update.content);
        if (chunk) emit('reasoning_delta', { content: chunk });
        break;
      }
      case 'tool_call': {
        startTool(update);
        if (update.status === 'completed' || update.status === 'failed') finishTool(update.toolCallId, update);
        break;
      }
      case 'tool_call_update': {
        const call = tools.get(update.toolCallId) || startTool({ ...update, title: update.title || 'Tool' });
        if (update.title) call.title = update.title;
        if (update.status === 'completed' || update.status === 'failed') finishTool(update.toolCallId, update);
        break;
      }
      case 'plan': {
        const plan = (update.entries || []).map((entry, index) => ({
          id: `acp_${index}`,
          content: String(entry.content || ''),
          activeForm: String(entry.content || ''),
          status: ['pending', 'in_progress', 'completed'].includes(entry.status) ? entry.status : 'pending',
        }));
        if (plan.length) emit('plan_update', { plan, round: 1 });
        break;
      }
      default:
        break;
    }
  };

  const askPermission = async (params) => {
    const call = params.toolCall || {};
    const kind = call.kind || tools.get(call.toolCallId)?.kind || 'other';
    const options = Array.isArray(params.options) ? params.options : [];
    const pick = (kinds) => options.find((option) => kinds.includes(option.kind));
    const allow = () => {
      const option = pick(['allow_once', 'allow_always']);
      return option ? { outcome: { outcome: 'selected', optionId: option.optionId } } : { outcome: { outcome: 'cancelled' } };
    };
    const reject = () => {
      const option = pick(['reject_once', 'reject_always']);
      return option ? { outcome: { outcome: 'selected', optionId: option.optionId } } : { outcome: { outcome: 'cancelled' } };
    };
    if (abortSignal?.aborted) return { outcome: { outcome: 'cancelled' } };
    // Plan mode only reads.
    if (planMode && !READ_KINDS.has(kind)) return reject();
    if (autoApprove || sessionApproved.has(kind)) return allow();
    if (!requestPermission) return reject();
    const diffItem = (call.content || []).find((item) => item?.type === 'diff');
    const decision = await requestPermission({
      tool: KIND_TOOL[kind] || 'agent_tool',
      toolCallId: call.toolCallId,
      args: call.rawInput || { title: call.title },
      permission: READ_KINDS.has(kind) ? 'moderate' : 'dangerous',
      description: `${agent.title}: ${call.title || kind}`,
      diff: diffItem ? unifiedDiff(path.relative(workingDir, diffItem.path || '') || diffItem.path, diffItem.oldText, diffItem.newText) : null,
      workingDir,
      round: 1,
    });
    if (abortSignal?.aborted) return { outcome: { outcome: 'cancelled' } };
    const name = normalizeApprovalDecision(decision?.decision);
    if (!approvalAllows(name)) return reject();
    // "For this chat" covers this kind of step for the rest of the turn.
    if (approvalCoversRun(name)) sessionApproved.add(kind);
    return allow();
  };

  const onRequest = async (method, params) => {
    if (method === 'session/request_permission') return askPermission(params);
    if (method === 'fs/read_text_file') {
      const file = insideFolder(params.path, workingDir);
      const content = fs.readFileSync(file, 'utf8');
      if (!params.line && !params.limit) return { content };
      const lines = content.split('\n');
      const start = Math.max(0, (Number(params.line) || 1) - 1);
      const end = params.limit ? start + Number(params.limit) : lines.length;
      return { content: lines.slice(start, end).join('\n') };
    }
    if (method === 'fs/write_text_file') {
      if (!canWrite || planMode) throw new AcpError('Plan mode: Asyncat only lets the agent read files.', { code: -32602 });
      const file = insideFolder(params.path, workingDir);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, String(params.content ?? ''));
      return null;
    }
    throw new AcpError(`Method not found: ${method}`, { code: -32601 });
  };

  const connection = new AcpConnection({
    command: binary,
    args: agent.args,
    cwd: workingDir,
    env: { ...acpEnv(agent), ...launchEnv },
    onNotification: (method, params) => { if (method === 'session/update') onUpdate(params); },
    onRequest,
  });

  const onAbort = () => {
    if (sessionId) connection.notify('session/cancel', { sessionId });
    setTimeout(() => connection.close(), 3000).unref?.();
  };
  abortSignal?.addEventListener('abort', onAbort, { once: true });

  try {
    try {
      await connection.start();
    } catch (err) {
      throw new Error(err.code === 'ENOENT' ? `${agent.title} isn't installed (no "${agent.command}" found).` : err.message);
    }
    const init = await connection.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: canWrite }, terminal: false },
      clientInfo: { name: 'Asyncat', version: '1' },
    }, { timeoutMs: download.needed ? 300_000 : 30_000 });

    let resumed = false;
    let modes = null;
    if (externalSessionId && init?.agentCapabilities?.loadSession) {
      try {
        // Loading replays the past conversation as updates; don't show it again.
        const replaying = { on: true };
        const original = connection.onNotification;
        connection.onNotification = (method, params) => { if (!replaying.on) original(method, params); };
        const loaded = await connection.request('session/load', { sessionId: externalSessionId, cwd: workingDir, mcpServers: [] });
        replaying.on = false;
        connection.onNotification = original;
        sessionId = externalSessionId;
        modes = loaded?.modes || null;
        resumed = true;
      } catch {
        resumed = false;
      }
    }
    if (!resumed) {
      const created = await connection.request('session/new', { cwd: workingDir, mcpServers: [] });
      sessionId = created?.sessionId;
      modes = created?.modes || null;
      if (!sessionId) throw new Error(`${agent.title} didn't open a session.`);
    }

    // Plan mode: the agent's own read-only mode when it has one; Asyncat
    // refuses changes either way.
    if (agentMode === 'plan' && Array.isArray(modes?.availableModes)) {
      const mode = modes.availableModes.find((item) => PLAN_MODE.test(`${item.id} ${item.name}`));
      if (mode && mode.id !== modes.currentModeId) {
        await connection.request('session/set_mode', { sessionId, modeId: mode.id }).then(() => { modePicked = true; }).catch(() => {});
      }
    }
    planMode = agentMode === 'plan' || modePicked;

    const promptText = `${resumed || !externalSessionId ? '' : historyText(history)}${goal}`;
    const result = await connection.request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: promptText }],
    }, { timeoutMs: 0 });

    for (const [toolCallId, call] of tools) {
      if (!call.done) finishTool(toolCallId, { status: 'completed' });
    }
    const stopReason = abortSignal?.aborted || result?.stopReason === 'cancelled' ? 'aborted' : (result?.stopReason || 'end_turn');
    if (stopReason === 'refusal' && !answer) throw new Error(`${agent.title} declined to do this.`);
    return { answer, externalSessionId: sessionId, stopReason: stopReason === 'end_turn' ? 'answer' : stopReason };
  } catch (err) {
    for (const [toolCallId, call] of tools) {
      if (!call.done) finishTool(toolCallId, { status: 'failed', content: [] });
    }
    if (abortSignal?.aborted) return { answer, externalSessionId: sessionId, stopReason: 'aborted' };
    throw Object.assign(new Error(friendly(agent, err)), { externalSessionId: sessionId });
  } finally {
    abortSignal?.removeEventListener('abort', onAbort);
    await connection.close();
  }
}
