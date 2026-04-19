// asyncat sessions [list|rm|open]
// List and manage saved AI chat conversations from the den backend.

import { log, ok, warn, err, info, col } from '../lib/colors.js';
import { select, confirm } from '../lib/select.js';
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
  const limit = parseInt(args[0] || '50', 10);

  let data;
  try {
    await getToken();
    data = await apiGet(`/api/ai/chats?limit=${limit}&offset=0`);
  } catch (e) {
    err(e.message);
    return;
  }

  const convos = data.conversations || [];

  if (convos.length === 0) {
    log('');
    info('No conversations yet. Start one with: ' + col('cyan', 'chat'));
    log('');
    return;
  }

  const chosen = await select({
    title:      `Sessions  ${col('dim', `(${convos.length} of ${data.total || convos.length})`)}`,
    searchable: true,
    items: convos.map(c => ({
      name: truncate(c.title, 48) + (c.is_pinned ? ' ⊛' : ''),
      desc: `${relativeTime(c.last_message_at || c.created_at)}  ·  ${c.message_count || 0} msgs  ·  ${c.id.slice(0, 8)}…`,
      tag:  c.is_archived ? 'archived' : '',
      _id:  c.id,
      _title: c.title,
    })),
  });

  if (!chosen) return;

  // Action menu for the selected session
  const action = await select({
    title:      truncate(chosen._title || chosen.name, 55),
    searchable: false,
    items: [
      { name: 'delete', desc: 'Permanently remove this conversation' },
      { name: 'cancel', desc: 'Go back' },
    ],
  });

  if (!action || action.name === 'cancel') return;

  if (action.name === 'delete') {
    const yes = await confirm(col('yellow', `Delete "${truncate(chosen._title || chosen.name, 40)}"?`));
    if (!yes) { info('Cancelled.'); return; }
    try {
      await apiDelete(`/api/ai/chats/${chosen._id}`);
      ok(`Deleted session`);
    } catch (e) {
      err(`Failed to delete: ${e.message}`);
    }
  }
}

async function removeSession(idPrefix) {
  let data;
  try {
    await getToken();
    data = await apiGet('/api/ai/chats?limit=100');
  } catch (e) { err(e.message); return; }

  const convos = data.conversations || [];

  let match;
  if (idPrefix) {
    match = convos.find(c => c.id.startsWith(idPrefix));
    if (!match) { err(`No session found matching: ${col('white', idPrefix)}`); return; }
  } else {
    if (convos.length === 0) { info('No conversations to delete.'); return; }
    const chosen = await select({
      title:      'Select session to delete',
      searchable: true,
      items: convos.map(c => ({
        name: truncate(c.title, 48),
        desc: `${relativeTime(c.last_message_at || c.created_at)}  ·  ${c.id.slice(0, 8)}…`,
        _id: c.id, _title: c.title,
      })),
    });
    if (!chosen) { info('Cancelled.'); return; }
    match = { id: chosen._id, title: chosen._title };
  }

  const yes = await confirm(col('yellow', `Delete "${truncate(match.title || match.id, 40)}"?`));
  if (!yes) { info('Cancelled.'); return; }

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
