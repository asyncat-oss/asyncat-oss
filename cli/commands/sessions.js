// asyncat sessions [list|rm|open]
// List and manage saved AI chat conversations from the den backend.

import { log, ok, warn, err, info, col } from '../lib/colors.js';
import { getToken, apiGet, apiPost, apiDelete } from '../lib/denApi.js';

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60000);
  const h    = Math.floor(m / 60);
  const d    = Math.floor(h / 24);
  if (d > 0)  return `${d}d ago`;
  if (h > 0)  return `${h}h ago`;
  if (m > 0)  return `${m}m ago`;
  return 'just now';
}

function truncate(str, n) {
  if (!str) return col('dim', '(no title)');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function modeIcon(mode) {
  if (mode === 'build') return col('yellow', '⚙');
  if (mode === 'image') return col('magenta', '⊕');
  return col('cyan', '◈');
}

async function listSessions(args) {
  const limit = parseInt(args[0] || '20', 10);

  let data;
  try {
    await getToken();
    data = await apiGet(`/api/ai/chats?limit=${limit}&offset=0`);
  } catch (e) {
    err(e.message);
    return;
  }

  const convos = data.conversations || [];

  log('');
  log(`  ${col('bold', 'Saved sessions')}  ${col('dim', `(${convos.length} of ${data.total || convos.length})`)}`);
  log(col('dim', '  ' + '─'.repeat(60)));

  if (convos.length === 0) {
    info('No conversations yet. Start one with: ' + col('cyan', 'chat'));
    log('');
    return;
  }

  for (let i = 0; i < convos.length; i++) {
    const c   = convos[i];
    const idx = String(i + 1).padStart(2, ' ');
    const pin = c.is_pinned ? col('yellow', '⊛ ') : '  ';
    const arc = c.is_archived ? col('dim', ' [archived]') : '';
    const ts  = col('dim', relativeTime(c.last_message_at || c.created_at));
    const cnt = col('dim', `${c.message_count || 0} msgs`);
    const ttl = truncate(c.title, 40);

    log(`  ${col('dim', idx)} ${pin}${modeIcon(c.mode)} ${col('white', ttl)}${arc}`);
    log(`      ${ts}  ·  ${cnt}  ·  ${col('dim', c.id.slice(0, 8))}…`);
  }

  log('');
  log(`  ${col('dim', 'Tip: ')}${col('dim', 'sessions rm <id-prefix>')}`);
  log('');
}

async function removeSession(idPrefix) {
  if (!idPrefix) {
    warn('Usage: sessions rm <id-prefix>');
    info('Run ' + col('cyan', 'sessions') + ' to list conversation IDs');
    return;
  }

  let data;
  try {
    await getToken();
    data = await apiGet('/api/ai/chats?limit=100');
  } catch (e) { err(e.message); return; }

  const convos = data.conversations || [];
  const match  = convos.find(c => c.id.startsWith(idPrefix));

  if (!match) {
    err(`No session found matching: ${col('white', idPrefix)}`);
    return;
  }

  try {
    await apiDelete(`/api/ai/chats/${match.id}`);
    ok(`Deleted session: ${col('dim', match.title || match.id)}`);
  } catch (e) {
    err(`Failed to delete: ${e.message}`);
  }
}

async function showStats() {
  let data;
  try {
    await getToken();
    data = await apiGet('/api/ai/chats/stats/summary');
  } catch (e) { err(e.message); return; }

  const s = data.stats || {};
  log('');
  log(`  ${col('bold', 'Session stats')}`);
  log(col('dim', '  ' + '─'.repeat(36)));
  if (s.total     !== undefined) log(`  ${col('cyan', 'total    ')}  ${col('white', String(s.total))}`);
  if (s.pinned    !== undefined) log(`  ${col('cyan', 'pinned   ')}  ${col('white', String(s.pinned))}`);
  if (s.archived  !== undefined) log(`  ${col('cyan', 'archived ')}  ${col('white', String(s.archived))}`);
  log('');
}

export async function run(args = []) {
  const sub = (args[0] || 'list').toLowerCase();

  switch (sub) {
    case 'list':
    case 'ls':
      await listSessions(args.slice(1));
      break;

    case 'rm':
    case 'remove':
    case 'delete':
      await removeSession(args[1]);
      break;

    case 'stats':
      await showStats();
      break;

    default:
      // If it looks like a number, treat as `sessions list <n>`
      if (/^\d+$/.test(sub)) {
        await listSessions([sub]);
      } else {
        warn(`Unknown sessions subcommand: ${col('white', sub)}`);
        log(`  Usage: ${col('cyan', 'sessions')} ${col('dim', '[list [n]|rm <id>|stats]')}`);
      }
  }
}
