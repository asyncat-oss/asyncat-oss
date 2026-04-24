// cli/commands/memory.js
// ─── Manage agent memories ──────────────────────────────────────────────────
//   asyncat memory list
//   asyncat memory search <query>
//   asyncat memory show <key>
//   asyncat memory forget <key>

import { col, log, ok, warn } from '../lib/colors.js';
import { getToken, apiGet, apiDelete } from '../lib/denApi.js';

async function ensureBackend() {
  try {
    await getToken();
    return true;
  } catch (e) {
    warn(`  ${e.message}`);
    warn(`  Run ${col('cyan', 'asyncat start')} first.`);
    return false;
  }
}

function formatTags(tags) {
  return Array.isArray(tags) && tags.length ? col('dim', ` #${tags.join(' #')}`) : '';
}

function formatMemory(m, verbose = false) {
  const kind = m.kind || m.memory_type || 'fact';
  const key = m.key || '(no key)';
  const importance = Number(m.importance ?? 0.5).toFixed(2);
  log(`  ${col('bold', key)}  ${col('cyan', `[${kind}]`)}${formatTags(m.tags)}`);
  log(`    ${col('dim', `importance=${importance}  access=${m.access_count || 0}  updated=${m.updated_at || 'unknown'}`)}`);
  if (m.last_accessed_at) log(`    ${col('dim', `last accessed=${m.last_accessed_at}`)}`);
  if (verbose) {
    log('');
    for (const line of String(m.content || '').split('\n')) log(`    ${line}`);
  } else {
    const content = String(m.content || '');
    log(`    ${content.length > 160 ? `${content.slice(0, 157)}...` : content}`);
  }
}

async function listMemories(args = []) {
  if (!await ensureBackend()) return;
  const kindIdx = args.indexOf('--kind');
  const limitIdx = args.indexOf('--limit');
  const params = new URLSearchParams();
  if (kindIdx >= 0 && args[kindIdx + 1]) params.set('kind', args[kindIdx + 1]);
  if (limitIdx >= 0 && args[limitIdx + 1]) params.set('limit', args[limitIdx + 1]);

  const suffix = params.toString() ? `?${params}` : '';
  const res = await apiGet(`/api/agent/memory${suffix}`);
  const memories = res.memories || [];

  if (memories.length === 0) {
    log(`  ${col('dim', 'No memories stored yet.')}`);
    return;
  }

  log('');
  log(`  ${col('bold', `Agent memories (${memories.length})`)}`);
  log('');
  for (const m of memories) {
    formatMemory(m);
    log('');
  }
}

async function searchMemories(queryParts = []) {
  if (!await ensureBackend()) return;
  const query = queryParts.join(' ').trim();
  if (!query) {
    warn(`  Usage: ${col('cyan', 'asyncat memory search <query>')}`);
    return;
  }

  const res = await apiGet(`/api/agent/memory?q=${encodeURIComponent(query)}`);
  const memories = res.memories || [];
  if (memories.length === 0) {
    log(`  ${col('dim', `No memories matched "${query}".`)}`);
    return;
  }

  log('');
  log(`  ${col('bold', `Memory search: ${query}`)}`);
  log('');
  for (const m of memories) {
    formatMemory(m);
    log('');
  }
}

async function showMemory(key) {
  if (!await ensureBackend()) return;
  if (!key) {
    warn(`  Usage: ${col('cyan', 'asyncat memory show <key>')}`);
    return;
  }

  try {
    const res = await apiGet(`/api/agent/memory/${encodeURIComponent(key)}`);
    log('');
    formatMemory(res.memory, true);
    log('');
  } catch (e) {
    warn(`  ${e.message}`);
  }
}

async function forgetMemory(key) {
  if (!await ensureBackend()) return;
  if (!key) {
    warn(`  Usage: ${col('cyan', 'asyncat memory forget <key>')}`);
    return;
  }

  try {
    await apiDelete(`/api/agent/memory/${encodeURIComponent(key)}`);
    ok(`  Forgotten: ${key}`);
  } catch (e) {
    warn(`  ${e.message}`);
  }
}

export async function run(args = []) {
  const sub = (args[0] || 'list').toLowerCase();
  const rest = args.slice(1);

  switch (sub) {
    case 'list':
    case 'ls':
      await listMemories(rest);
      break;
    case 'search':
    case 'find':
      await searchMemories(rest);
      break;
    case 'show':
    case 'get':
      await showMemory(rest[0]);
      break;
    case 'forget':
    case 'rm':
    case 'remove':
    case 'delete':
      await forgetMemory(rest[0]);
      break;
    case 'help':
    case '?':
      log('');
      log(`  ${col('bold', 'asyncat memory')} — inspect agent memories`);
      log('');
      log(`    list [--kind kind] [--limit n]       list memories`);
      log(`    search <query>                       fuzzy search memories`);
      log(`    show <key>                           show one memory`);
      log(`    forget <key>                         delete one memory`);
      log('');
      break;
    default:
      await searchMemories(args);
      break;
  }
}
