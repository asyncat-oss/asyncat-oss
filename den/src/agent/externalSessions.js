// externalSessions.js — read Claude Code and Codex session history from disk.
//
// Both CLIs keep every session as a JSON-lines file:
//   Claude Code: ~/.claude/projects/<folder>/<session id>.jsonl
//   Codex:       ~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<thread id>.jsonl
// These files can be many megabytes, so listing reads only the start and end
// of the newest ones. Opening a session reads it fully and turns it into
// Asyncat chat messages; Asyncat then continues it with --resume / exec resume.

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { claudeToolCall } from './externalAgents.js';

const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 256 * 1024;
const MAX_TEXT = 20000;
const MAX_TOOL_TEXT = 1500;
const MAX_TOOLS_PER_TURN = 80;

export function claudeHome(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

export function codexHome(env = process.env) {
  return env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

// ── Reading pieces of large files ───────────────────────────────────────────

function readSlice(file, start, length) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, start);
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/** Parsed JSON lines from the first and last parts of a file. */
function headAndTail(file, size) {
  if (size <= HEAD_BYTES + TAIL_BYTES) {
    const lines = parseLines(readSlice(file, 0, size));
    return { head: lines, tail: lines };
  }
  const head = parseLines(readSlice(file, 0, HEAD_BYTES), { dropLast: true });
  const tail = parseLines(readSlice(file, size - TAIL_BYTES, TAIL_BYTES), { dropFirst: true });
  return { head, tail };
}

function parseLines(text, { dropFirst = false, dropLast = false } = {}) {
  const raw = text.split('\n');
  if (dropFirst) raw.shift();
  if (dropLast) raw.pop();
  const out = [];
  for (const line of raw) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a line cut by the slice */ }
  }
  return out;
}

async function* jsonLines(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* skip a broken line */ }
  }
}

function clip(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function clipArgs(args) {
  const out = {};
  for (const [key, value] of Object.entries(args || {})) {
    out[key] = typeof value === 'string' ? clip(value, MAX_TOOL_TEXT) : value;
  }
  return out;
}

function oneLine(text, max = 90) {
  return clip(String(text || '').replace(/\s+/g, ' ').trim(), max);
}

// ── Prompt clean-up ─────────────────────────────────────────────────────────

// Text the CLIs add to the user's turn that the user didn't type.
const CODEX_INJECTED = /^\s*(<environment_context>|<user_instructions>|<permissions instructions>|<INSTRUCTIONS>|# AGENTS\.md instructions|<turn_aborted>|<user_shell_command>)/;

function cleanClaudePrompt(text) {
  let value = String(text || '');
  if (/^\s*<local-command-(stdout|stderr|caveat)>/.test(value) || /^Caveat: The messages below/.test(value)) return '';
  const command = value.match(/<command-name>([^<]*)<\/command-name>/);
  if (command) {
    const args = value.match(/<command-args>([^<]*)<\/command-args>/);
    return `${command[1].trim()}${args && args[1].trim() ? ` ${args[1].trim()}` : ''}`;
  }
  value = value.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  return value.trim();
}

function claudeUserText(message) {
  const content = message?.content;
  if (typeof content === 'string') return cleanClaudePrompt(content);
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (block?.type === 'text') parts.push(cleanClaudePrompt(block.text));
    else if (block?.type === 'image') parts.push('[image]');
  }
  return parts.filter(Boolean).join('\n\n');
}

function codexUserText(payload) {
  const parts = [];
  for (const part of payload?.content || []) {
    const text = part?.text || '';
    if (part?.type === 'input_text' && text && !CODEX_INJECTED.test(text)) parts.push(text.trim());
    if (part?.type === 'input_image') parts.push('[image]');
  }
  return parts.filter(Boolean).join('\n\n');
}

// ── Listing ─────────────────────────────────────────────────────────────────

// Sessions started by programs (scripts, Asyncat itself) rather than a person:
// `claude -p` through the SDK entry point and `codex exec`.
const AUTOMATED_SOURCES = new Set(['sdk-cli', 'sdk-ts', 'sdk-py', 'codex_exec']);

function newestFiles(files, limit) {
  return files
    .map((file) => {
      try {
        const stat = fs.statSync(file);
        return { file, size: stat.size, mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((entry) => entry && entry.size > 0)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);
}

function claudeSessionFiles(env) {
  const root = path.join(claudeHome(env), 'projects');
  let folders = [];
  try { folders = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return []; }
  const files = [];
  for (const folder of folders) {
    const dir = path.join(root, folder.name);
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

export function summarizeClaudeSession({ file, size, mtimeMs }) {
  const { head, tail } = headAndTail(file, size);
  let cwd = null;
  let firstPrompt = '';
  let entrypoint = null;
  for (const line of head) {
    if (!cwd && line.cwd) cwd = line.cwd;
    if (!entrypoint && line.entrypoint) entrypoint = line.entrypoint;
    if (!firstPrompt && line.type === 'user' && !line.isMeta && !line.isSidechain) firstPrompt = claudeUserText(line.message);
  }
  let lastPrompt = '';
  for (const line of tail) {
    if (line.type === 'last-prompt' && line.lastPrompt) lastPrompt = line.lastPrompt;
    if (!cwd && line.cwd) cwd = line.cwd;
  }
  // The newest title wins; a name the user gave beats Claude's own.
  const titleOf = (lines, type, key) => {
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i].type === type && lines[i][key]) return lines[i][key];
    return '';
  };
  const title = titleOf(tail, 'custom-title', 'customTitle') || titleOf(head, 'custom-title', 'customTitle')
    || titleOf(tail, 'ai-title', 'aiTitle') || titleOf(head, 'ai-title', 'aiTitle');
  if (!firstPrompt && !title && !lastPrompt) return null;
  return {
    engine: 'claude-code',
    id: path.basename(file, '.jsonl'),
    title: oneLine(title || firstPrompt || lastPrompt) || 'Untitled session',
    cwd,
    updatedAt: new Date(mtimeMs).toISOString(),
    source: entrypoint,
    automated: AUTOMATED_SOURCES.has(entrypoint),
    sizeBytes: size,
  };
}

function codexSessionFiles(env, limit) {
  // Folders are named by date, so walking them newest first finds recent
  // sessions without stat-ing the whole history.
  const root = path.join(codexHome(env), 'sessions');
  const files = [];
  const walk = (dir, depth) => {
    if (files.length >= limit) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (files.length >= limit) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < 3) walk(full, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
    }
  };
  walk(root, 0);
  return files;
}

function codexThreadNames(env) {
  const names = new Map();
  try {
    const text = fs.readFileSync(path.join(codexHome(env), 'session_index.jsonl'), 'utf8');
    for (const line of parseLines(text)) {
      if (line.id && line.thread_name) names.set(line.id, line.thread_name);
    }
  } catch { /* older Codex versions have no index */ }
  return names;
}

export function summarizeCodexSession({ file, size, mtimeMs }, threadNames = new Map()) {
  const { head } = headAndTail(file, size);
  const meta = head.find((line) => line.type === 'session_meta')?.payload || {};
  const idFromName = path.basename(file, '.jsonl').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1];
  // The file name carries this rollout's own thread id; a forked thread's file
  // can begin with a copy of its parent's session_meta.
  const id = idFromName || meta.id;
  if (!id) return null;
  let firstPrompt = '';
  for (const line of head) {
    const payload = line.payload || {};
    if (line.type === 'response_item' && payload.type === 'message' && payload.role === 'user') {
      firstPrompt = codexUserText(payload);
      if (firstPrompt) break;
    }
    if (line.type === 'event_msg' && payload.type === 'user_message' && payload.message) {
      firstPrompt = String(payload.message).trim();
      break;
    }
  }
  const title = threadNames.get(id) || firstPrompt;
  if (!title) return null;
  return {
    engine: 'codex',
    id,
    title: oneLine(title) || 'Untitled session',
    cwd: meta.cwd || null,
    updatedAt: new Date(mtimeMs).toISOString(),
    source: meta.originator || meta.source || null,
    automated: AUTOMATED_SOURCES.has(meta.originator) || meta.source === 'exec',
    sizeBytes: size,
  };
}

function isInside(child, parent) {
  if (!child || !parent) return false;
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The newest sessions of one or both engines, newest first.
 * `hideCwd` drops sessions Asyncat itself ran in its scratch folder.
 */
export function listExternalSessions({ engine = 'all', limit = 30, hideCwd = null, env = process.env } = {}) {
  const sessions = [];
  if (engine === 'all' || engine === 'claude-code') {
    for (const entry of newestFiles(claudeSessionFiles(env), limit * 2)) {
      try {
        const session = summarizeClaudeSession(entry);
        if (session) sessions.push(session);
      } catch { /* unreadable file */ }
    }
  }
  if (engine === 'all' || engine === 'codex') {
    const names = codexThreadNames(env);
    for (const entry of newestFiles(codexSessionFiles(env, limit * 2), limit * 2)) {
      try {
        const session = summarizeCodexSession(entry, names);
        if (session) sessions.push(session);
      } catch { /* unreadable file */ }
    }
  }
  const temp = os.tmpdir();
  const seen = new Set();
  return sessions
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    // The same session can exist twice (Claude Code copies a session it
    // resumes from another folder); keep the newest copy.
    .filter((session) => {
      const key = `${session.engine}:${session.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((session) => !hideCwd || !isInside(session.cwd, hideCwd))
    // Sessions in the temp folder are throwaway runs; lists hide them by default.
    .map((session) => ({ ...session, temporary: isInside(session.cwd, temp) || isInside(session.cwd, '/tmp') }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/** Where a session's file is, or null. Ids are checked so they can't escape the folder. */
export function findSessionFile(engine, id, env = process.env) {
  if (!/^[0-9a-zA-Z-]{8,80}$/.test(String(id || ''))) return null;
  if (engine === 'claude-code') {
    const matches = claudeSessionFiles(env).filter((file) => path.basename(file, '.jsonl') === id);
    return newestFiles(matches, 1)[0]?.file || null;
  }
  if (engine === 'codex') {
    const root = path.join(codexHome(env), 'sessions');
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile() && entry.name.endsWith(`${id}.jsonl`)) return full;
      }
    }
  }
  return null;
}

// ── Transcripts ─────────────────────────────────────────────────────────────

function newTurnCollector() {
  const turns = [];
  let current = null;
  const tools = new Map();
  return {
    user(text, timestamp) {
      current = { user: { text, timestamp }, assistant: { text: [], tools: [], timestamp } };
      turns.push(current);
    },
    assistantText(text, timestamp) {
      if (!current) this.user('', timestamp);
      if (text) current.assistant.text.push(text);
      current.assistant.timestamp = timestamp || current.assistant.timestamp;
    },
    toolStart(call, timestamp) {
      if (!current) this.user('', timestamp);
      const event = {
        type: 'tool_start',
        data: { tool: call.tool, toolCallId: call.toolCallId, args: clipArgs(call.args) },
        completedAt: timestamp ? Date.parse(timestamp) || undefined : undefined,
      };
      current.assistant.tools.push(event);
      if (call.toolCallId) tools.set(call.toolCallId, event);
    },
    toolResult(id, output, failed) {
      const event = tools.get(id);
      if (!event) return;
      const text = clip(output, MAX_TOOL_TEXT);
      event.result = failed ? { success: false, error: text || 'Failed' } : { success: true, output: text };
    },
    turns,
  };
}

async function claudeTurns(file) {
  const collector = newTurnCollector();
  let cwd = null;
  let title = '';
  for await (const line of jsonLines(file)) {
    if (!cwd && line.cwd) cwd = line.cwd;
    if (line.type === 'custom-title' && line.customTitle) title = line.customTitle;
    else if (line.type === 'ai-title' && line.aiTitle && !title) title = line.aiTitle;
    if (line.isSidechain || line.isMeta) continue;
    if (line.type === 'user') {
      const content = line.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'tool_result') {
            const output = typeof block.content === 'string'
              ? block.content
              : (Array.isArray(block.content) ? block.content.map((part) => part?.text || '').join('\n') : '');
            collector.toolResult(block.tool_use_id, output, Boolean(block.is_error));
          }
        }
      }
      const text = claudeUserText(line.message);
      if (text) collector.user(clip(text, MAX_TEXT), line.timestamp);
    } else if (line.type === 'assistant') {
      for (const block of line.message?.content || []) {
        if (block?.type === 'text' && block.text?.trim()) collector.assistantText(block.text.trim(), line.timestamp);
        else if (block?.type === 'tool_use') collector.toolStart(claudeToolCall(block), line.timestamp);
      }
    }
  }
  return { turns: collector.turns, cwd, title };
}

function parseJsonMaybe(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function codexCall(payload) {
  const name = payload.name || 'tool';
  const args = parseJsonMaybe(payload.arguments) || {};
  if (['shell', 'exec_command', 'container.exec', 'local_shell'].includes(name)) {
    const command = Array.isArray(args.command)
      ? (args.command[0] === 'bash' && args.command[1] === '-lc' ? args.command[2] : args.command.join(' '))
      : (args.cmd || args.command || '');
    return { tool: 'run_command', toolCallId: payload.call_id, args: { command: String(command) } };
  }
  if (name === 'apply_patch') {
    const patch = String(payload.input || args.input || '');
    const file = patch.match(/\*\*\* (?:Update|Add|Delete) File: (.+)/)?.[1] || '';
    return { tool: /\*\*\* Add File:/.test(patch) ? 'write_file' : 'edit_file', toolCallId: payload.call_id, args: { path: file.trim() } };
  }
  if (name === 'update_plan') return { tool: 'todo_write', toolCallId: payload.call_id, args };
  return { tool: name, toolCallId: payload.call_id, args };
}

function codexOutputText(output) {
  const parsed = parseJsonMaybe(output);
  if (parsed && typeof parsed === 'object') {
    const failed = parsed.metadata?.exit_code != null && parsed.metadata.exit_code !== 0;
    return { text: String(parsed.output ?? ''), failed };
  }
  if (Array.isArray(output)) return { text: output.map((part) => part?.text || '').join('\n'), failed: false };
  const text = String(output ?? '');
  const exit = text.match(/Process exited with code (\d+)/);
  return { text, failed: Boolean(exit && exit[1] !== '0') };
}

async function codexTurns(file) {
  const collector = newTurnCollector();
  let cwd = null;
  for await (const line of jsonLines(file)) {
    const payload = line.payload || {};
    if (line.type === 'session_meta') { cwd = payload.cwd || cwd; continue; }
    if (line.type !== 'response_item') continue;
    if (payload.type === 'message') {
      if (payload.role === 'user') {
        const text = codexUserText(payload);
        if (text) collector.user(clip(text, MAX_TEXT), line.timestamp);
      } else if (payload.role === 'assistant') {
        const text = (payload.content || []).map((part) => part?.text || '').join('').trim();
        if (text) collector.assistantText(text, line.timestamp);
      }
    } else if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
      collector.toolStart(codexCall(payload), line.timestamp);
    } else if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
      const { text, failed } = codexOutputText(payload.output);
      collector.toolResult(payload.call_id, text, failed);
    } else if (payload.type === 'web_search_call') {
      collector.toolStart({ tool: 'web_search', toolCallId: payload.id, args: { query: payload.action?.query || '' } }, line.timestamp);
    }
  }
  return { turns: collector.turns, cwd, title: '' };
}

function messageId(time, role) {
  return `msg_${time}_${role}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Messages in the shape the chat save route takes, from parsed turns, newest `maxTurns` only. */
export function turnsToMessages(turns, { maxTurns = 200 } = {}) {
  const kept = turns.filter((turn) => turn.user.text || turn.assistant.text.length || turn.assistant.tools.length).slice(-maxTurns);
  const messages = [];
  const base = { toolsEnabled: true, agentMode: 'action', branchId: 'main' };
  for (const turn of kept) {
    const userTime = Date.parse(turn.user.timestamp) || Date.now();
    if (turn.user.text) {
      messages.push({ ...base, type: 'user', content: turn.user.text, id: messageId(userTime, 'user'), timestamp: new Date(userTime).toISOString(), agentMentions: [] });
    }
    const answerTime = Date.parse(turn.assistant.timestamp) || userTime;
    const text = clip(turn.assistant.text.join('\n\n'), MAX_TEXT);
    if (text || turn.assistant.tools.length) {
      messages.push({
        ...base,
        type: 'assistant',
        content: text,
        id: messageId(answerTime, 'assistant'),
        timestamp: new Date(answerTime).toISOString(),
        // Long agent turns keep their latest steps so the chat stays light.
        agentEvents: turn.assistant.tools.slice(-MAX_TOOLS_PER_TURN),
      });
    }
  }
  return { messages, skippedTurns: Math.max(0, turns.length - kept.length) };
}

/** The whole session as Asyncat messages, with its folder and title. */
export async function readExternalSession(engine, id, { env = process.env, maxTurns = 200 } = {}) {
  const file = findSessionFile(engine, id, env);
  if (!file) throw Object.assign(new Error('That session is no longer on this computer.'), { status: 404 });
  const stat = fs.statSync(file);
  const parsed = engine === 'claude-code' ? await claudeTurns(file) : await codexTurns(file);
  const { messages, skippedTurns } = turnsToMessages(parsed.turns, { maxTurns });
  let title = parsed.title;
  if (!title && engine === 'codex') title = codexThreadNames(env).get(id) || '';
  if (!title) title = messages.find((message) => message.type === 'user')?.content || 'Untitled session';
  return { engine, id, cwd: parsed.cwd, title: oneLine(title), messages, skippedTurns, modifiedAt: stat.mtimeMs };
}
