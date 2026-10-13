// den/src/agent/acp/acpAgents.js
// The coding agents Asyncat talks to over the Agent Client Protocol (Gemini
// CLI, Goose, Qwen Code or any other ACP agent), saved in
// data/acp-agents.json with their keys sealed. Each one is a chat engine
// "acp:<name>" next to Asyncat, Claude Code and Codex. Asyncat never
// installs them; commands that download first (npx…) wait for an OK, with
// the size, like connectors.

import fs from 'fs';
import path from 'path';
import { runtimeDataPath } from '../../config/runtimeConfig.js';
import { isSealed, openSecret, sealSecret } from '../../lib/secretBox.js';
import { agentEnv, findBinary } from '../externalAgents.js';
import { detectLauncher, downloadCheck } from '../../connectors/launchers.js';
import { ACP_PROTOCOL_VERSION, AcpConnection } from './acpConnection.js';

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export const ACP_CATALOG = [
  {
    id: 'gemini',
    title: 'Gemini CLI',
    command: 'gemini',
    args: ['--experimental-acp'],
    install: 'npm install -g @google/gemini-cli',
    docs: 'https://github.com/google-gemini/gemini-cli',
    note: "Google's coding agent. Sign in by running `gemini` in a terminal once.",
  },
  {
    id: 'qwen',
    title: 'Qwen Code',
    command: 'qwen',
    args: ['--experimental-acp'],
    install: 'npm install -g @qwen-code/qwen-code',
    docs: 'https://github.com/QwenLM/qwen-code',
    note: "Qwen's coding agent, based on Gemini CLI.",
  },
  {
    id: 'goose',
    title: 'Goose',
    command: 'goose',
    args: ['acp'],
    install: null,
    docs: 'https://block.github.io/goose/',
    note: "Block's open-source agent; it works with many model providers.",
  },
];

function acpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function acpConfigPath() {
  return runtimeDataPath('acp-agents.json');
}

export function acpEngineId(name) {
  return `acp:${name}`;
}

export function acpNameFromEngine(engine) {
  return String(engine || '').startsWith('acp:') ? String(engine).slice(4) : null;
}

function readFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(acpConfigPath(), 'utf8'));
    return { agents: parsed?.agents && typeof parsed.agents === 'object' ? parsed.agents : {} };
  } catch (err) {
    if (err.code === 'ENOENT') return { agents: {} };
    throw acpError(`data/acp-agents.json can't be read: ${err.message}`, 409);
  }
}

function writeFile(config) {
  const file = acpConfigPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function normalize(name, raw = {}) {
  const env = {};
  for (const [key, value] of Object.entries(raw.env || {})) {
    if (key && value !== null && value !== undefined) env[key] = openSecret(String(value));
  }
  return {
    name,
    engine: acpEngineId(name),
    title: String(raw.title || name).slice(0, 60),
    command: String(raw.command || '').trim(),
    args: Array.isArray(raw.args) ? raw.args.map(String) : [],
    env,
    catalogId: raw.catalogId || null,
    approvedDownload: raw.approvedDownload?.spec ? raw.approvedDownload : null,
  };
}

/** The resolved program for an agent, and whether it can start without a download. */
function startCheck(agent) {
  const binary = path.isAbsolute(agent.command) ? (fs.existsSync(agent.command) ? agent.command : null) : findBinary(agent.command);
  const download = downloadCheck(agent.command, agent.args);
  const approved = download.needed && agent.approvedDownload?.spec === download.launcher?.spec;
  return {
    binary,
    installed: Boolean(binary),
    needsDownload: Boolean(download.needed && !approved),
    download: download.needed ? { name: download.launcher.name, spec: download.launcher.spec, kind: download.launcher.kind } : null,
  };
}

/** Every saved ACP agent, with whether it can run here. */
export function listAcpAgents() {
  const { agents } = readFile();
  return Object.entries(agents).map(([name, raw]) => {
    const agent = normalize(name, raw);
    const check = startCheck(agent);
    return {
      name,
      engine: agent.engine,
      title: agent.title,
      command: agent.command,
      args: agent.args,
      env: Object.fromEntries(Object.keys(agent.env).map((key) => [key, '********'])),
      catalogId: agent.catalogId,
      installed: check.installed,
      needsDownload: check.needsDownload,
      download: check.download,
    };
  });
}

/** One agent with its keys opened, for running it. */
export function getAcpAgent(name) {
  const { agents } = readFile();
  if (!Object.hasOwn(agents, name)) return null;
  return normalize(name, agents[name]);
}

/**
 * Add or change an agent: { name?, title, command, args, env, catalogId,
 * approveDownload }. Env values sent as ******** keep what is saved.
 */
export function saveAcpAgent(input = {}, { existing = null } = {}) {
  const config = readFile();
  const catalog = input.catalogId ? ACP_CATALOG.find((item) => item.id === input.catalogId) : null;
  const command = String(input.command || catalog?.command || '').trim();
  if (!command) throw acpError('Give the command that starts the agent.');
  const name = existing || String(input.name || catalog?.id || path.basename(command).replace(/\.(cmd|exe)$/i, '')).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 40);
  if (!NAME.test(name)) throw acpError('Use letters, numbers, dots, dashes or underscores for its name.');
  if (!existing && Object.hasOwn(config.agents, name)) throw acpError(`There's already an agent called "${name}".`, 409);
  const saved = config.agents[name] || {};
  const env = {};
  for (const [key, value] of Object.entries(input.env || {})) {
    const k = String(key).trim();
    if (!k) continue;
    if (value === '********') {
      if (saved.env?.[k]) env[k] = saved.env[k];
    } else if (value !== null && value !== undefined && value !== '') {
      env[k] = isSealed(String(value)) ? String(value) : sealSecret(String(value));
    }
  }
  const args = Array.isArray(input.args) ? input.args.map(String) : (catalog?.args || saved.args || []);
  const entry = {
    title: String(input.title || catalog?.title || saved.title || name).slice(0, 60),
    command,
    args,
    ...(Object.keys(env).length ? { env } : {}),
    ...(input.catalogId || saved.catalogId ? { catalogId: input.catalogId || saved.catalogId } : {}),
  };
  if (input.approveDownload) {
    const launcher = detectLauncher(command, args);
    if (launcher) entry.approvedDownload = { spec: launcher.spec, approvedAt: new Date().toISOString() };
  } else if (saved.approvedDownload) {
    entry.approvedDownload = saved.approvedDownload;
  }
  config.agents[name] = entry;
  writeFile(config);
  return listAcpAgents().find((agent) => agent.name === name);
}

export function removeAcpAgent(name) {
  const config = readFile();
  if (!Object.hasOwn(config.agents, name)) return false;
  delete config.agents[name];
  writeFile(config);
  return true;
}

/** The environment an agent runs with: the usual tool folders and its own keys. */
export function acpEnv(agent) {
  return { ...agentEnv(), ...agent.env };
}

/** Start an agent, introduce Asyncat, and stop it: what it says about itself. */
export async function checkAcpAgent(name, { cwd = process.cwd() } = {}) {
  const agent = getAcpAgent(name);
  if (!agent) throw acpError('No ACP agent by that name.', 404);
  const check = startCheck(agent);
  if (check.needsDownload) throw acpError(`${agent.title} would download ${check.download.name} first. Give the OK in Customize → Agents.`, 409);
  if (!check.installed && !check.download) throw acpError(`${agent.title} isn't installed (no "${agent.command}" found).`, 409);
  const connection = new AcpConnection({ command: check.binary || agent.command, args: agent.args, cwd, env: acpEnv(agent) });
  try {
    await connection.start();
    const init = await connection.request('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
      clientInfo: { name: 'Asyncat', version: '1' },
    }, { timeoutMs: 20_000 });
    return {
      protocolVersion: init?.protocolVersion ?? null,
      agent: init?.agentInfo || null,
      loadSession: Boolean(init?.agentCapabilities?.loadSession),
      images: Boolean(init?.agentCapabilities?.promptCapabilities?.image),
      authMethods: (init?.authMethods || []).map((method) => ({ id: method.id, name: method.name })),
    };
  } finally {
    await connection.close();
  }
}
