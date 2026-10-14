// den/src/search/messageIndex.js
// Search inside chats: what you and the assistant said, not tool output,
// hidden reasoning or the JSON a chat is stored in. Each message is a row in
// message_texts, indexed by messages_fts (SQLite FTS5).
//
// Triggers on `conversations` queue every chat that is saved, imported,
// trashed or restored (whoever wrote it: chat saves, Cats, imports, an
// agent's db_write). Chats deleted for good leave the index right away.
// A search first indexes the chats saved since, newest first, for a moment
// only, so a chat is found right after it changed. A long queue (every
// chat, the first start after an update, or a large import) never holds a
// search up: it is indexed in the background, a few chats at a time, and
// the search answers from what is indexed so far (indexingChats() says
// whether some are still to come).

// Around each match in a snippet. Control characters never occur in indexed
// text (visibleText() removes them), so the app can split on them safely.
export const MARK_START = '\u0002';
export const MARK_END = '\u0003';

const MAX_TEXT = 200_000;
const MAX_WORDS = 8;
const SNIPPET_TOKENS = 14;
// How long a search indexes what was saved last before it looks.
const SEARCH_INDEX_MS = 25;
// How many matches a search ranks, newest first: a word in nearly every
// message would otherwise mean scoring all of them on every keystroke.
const MAX_RANKED = 2000;

/** A message's text as it was shown, as plain words for the index. */
export function visibleText(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  const text = raw
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, ' ')
    .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/gi, ' ')
    .replace(/!\[[^\]]*\]\(data:[^)]*\)/gi, ' ')
    .replace(/data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/gi, ' ')
    // Code fences, table rules and rules: the markup, not the words.
    .replace(/^\s*```.*$/gm, ' ')
    .replace(/^[\s|:-]{3,}$/gm, ' ')
    .replace(/^\s{0,3}(?:#{1,6}|>)\s?/gm, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/\|/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
}

/**
 * The searchable messages of a stored chat (its `messages` JSON): one entry
 * per message with words in it, with the id the app shows it under.
 */
export function messageEntries(messages) {
  let list = messages;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  const entries = [];
  list.forEach((message, index) => {
    if (!message || typeof message !== 'object') return;
    const isUser = 'user' in message;
    const text = visibleText(isUser ? message.user : message.cat);
    if (!text) return;
    entries.push({
      // Same fallback as chatService.convertFromJsonbFormat, so a hit opens
      // the message the chat shows.
      messageId: String(message.id || `msg_${index}`),
      role: isUser ? 'user' : 'assistant',
      position: index,
      at: typeof message.timestamp === 'string' ? message.timestamp : null,
      text,
    });
  });
  return entries;
}

// A word is a run of letters and digits, as the index's tokenizer reads
// it: "don't" is the phrase "don t".
const WORD = /[\p{L}\p{N}\p{M}]+/gu;
// Scripts written without spaces: the tokenizer keeps a whole run as one
// word, so what is typed in them may start anywhere inside one.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/**
 * What was typed, as phrases: the words of each part between spaces, and
 * whether the last one matches as a prefix ("deploy" finds "deployment").
 *
 * One letter as a prefix matches almost anything ("c++" keeps only the
 * "c"), so it matches as a whole word, unless it ends the query and may be
 * the start of a word still being typed. That is for titles: in messages,
 * it would mean looking through nearly all of them (see ftsQuery()).
 */
export function queryPhrases(query) {
  const parts = String(query || '').normalize('NFKC').trim().split(/\s+/);
  const phrases = [];
  for (const [index, part] of parts.entries()) {
    const tokens = part.match(WORD);
    if (!tokens) continue;
    const last = tokens[tokens.length - 1];
    const typing = index === parts.length - 1 && part.endsWith(last);
    phrases.push({ tokens, prefix: [...last].length > 1 || typing });
    if (phrases.length >= MAX_WORDS) break;
  }
  return phrases;
}

/**
 * An FTS5 query for what was typed: every word must appear. Words are
 * quoted, so nothing typed is read as query syntax. Empty when there is
 * nothing to look for. A word of one letter is a whole word here, even
 * while it is being typed: the next letter makes it a prefix again.
 */
export function ftsQuery(query) {
  return queryPhrases(query)
    .map(({ tokens }) => `"${tokens.join(' ')}"${[...tokens[tokens.length - 1]].length > 1 ? '*' : ''}`)
    .join(' ');
}

// Case and accents don't count, as in the index.
function fold(text) {
  return String(text).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Whether a chat's title has what was typed, matched the way messages are:
 * every word, where a word starts ("an" finds "Anglesey", not "Explanation").
 * With no letters or digits typed, the title just has to contain it.
 */
export function titleMatcher(query) {
  const patterns = queryPhrases(query).map(({ tokens, prefix }) => {
    const words = tokens.map(fold).filter(Boolean);
    if (!words.length) return null;
    const body = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\p{L}\\p{N}]+');
    if (UNSPACED.test(body)) return new RegExp(body, 'u');
    return new RegExp(`(?<![\\p{L}\\p{N}])${body}${prefix ? '' : '(?![\\p{L}\\p{N}])'}`, 'u');
  }).filter(Boolean);
  if (!patterns.length) {
    const text = fold(String(query || '').trim());
    return (title) => Boolean(text) && fold(title || '').includes(text);
  }
  return (title) => {
    const folded = fold(title || '');
    return patterns.every((pattern) => pattern.test(folded));
  };
}

function likePattern(text) {
  return `%${String(text).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** A snippet around the first place `needle` occurs, marked like FTS5's. */
export function likeSnippet(text, needle, width = 90) {
  const source = String(text || '');
  const at = source.toLowerCase().indexOf(String(needle || '').toLowerCase());
  if (at < 0 || !needle) return source.slice(0, width) + (source.length > width ? '…' : '');
  const start = Math.max(0, at - Math.floor((width - needle.length) / 2));
  const end = Math.min(source.length, start + width);
  return (start > 0 ? '…' : '')
    + source.slice(start, at)
    + MARK_START + source.slice(at, at + needle.length) + MARK_END
    + source.slice(at + needle.length, end)
    + (end < source.length ? '…' : '');
}

/**
 * Creates the index and its triggers (safe on every start). The first time,
 * it queues every chat already there, to be indexed once the server is up
 * (syncMessageIndexInBackground). Returns how many chats it queued.
 *
 * A chat's messages are indexed together, so they have neighbouring row ids,
 * and the queue is worked through in order (a chat saved again goes to the
 * back): the newest row ids are the chats indexed last, which after the
 * first start's backlog (oldest first) are the ones used last.
 */
export function ensureMessageIndex(db) {
  const existed = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'message_texts'").get();
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_texts (
      id               INTEGER PRIMARY KEY,
      conversation_id  TEXT NOT NULL,
      message_id       TEXT NOT NULL,
      role             TEXT NOT NULL,
      position         INTEGER NOT NULL DEFAULT 0,
      at               TEXT,
      text             TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_message_texts_conversation ON message_texts(conversation_id);

    -- Prefixes of two and three letters are indexed too: they are what is
    -- in the box while a word is typed, and match the most words.
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      text,
      content = 'message_texts',
      content_rowid = 'id',
      tokenize = 'unicode61 remove_diacritics 2',
      prefix = '2 3'
    );

    CREATE TABLE IF NOT EXISTS messages_fts_pending (
      conversation_id TEXT PRIMARY KEY
    );

    CREATE TRIGGER IF NOT EXISTS message_texts_ai AFTER INSERT ON message_texts BEGIN
      INSERT INTO messages_fts(rowid, text) VALUES (new.id, new.text);
    END;

    CREATE TRIGGER IF NOT EXISTS message_texts_ad AFTER DELETE ON message_texts BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.id, old.text);
    END;

    CREATE TRIGGER IF NOT EXISTS conversations_messages_ai AFTER INSERT ON conversations BEGIN
      INSERT OR REPLACE INTO messages_fts_pending(conversation_id) VALUES (new.id);
    END;

    CREATE TRIGGER IF NOT EXISTS conversations_messages_au AFTER UPDATE OF messages, deleted_at ON conversations BEGIN
      INSERT OR REPLACE INTO messages_fts_pending(conversation_id) VALUES (new.id);
    END;

    CREATE TRIGGER IF NOT EXISTS conversations_messages_ad AFTER DELETE ON conversations BEGIN
      DELETE FROM message_texts WHERE conversation_id = old.id;
      DELETE FROM messages_fts_pending WHERE conversation_id = old.id;
    END;
  `);
  if (existed) return 0;
  return db.prepare(`
    INSERT OR IGNORE INTO messages_fts_pending(conversation_id)
    SELECT id FROM conversations WHERE deleted_at IS NULL
    ORDER BY COALESCE(last_message_at, updated_at, created_at)
  `).run().changes;
}

/** Whether chats are waiting to be indexed, so a search may miss some. */
export function indexingChats(db) {
  return Boolean(db.prepare('SELECT 1 FROM messages_fts_pending LIMIT 1').get());
}

/**
 * Indexes queued chats, the longest waiting first, or with `newestFirst`
 * the one saved last. Stops after `limit` chats, or once `budgetMs` has
 * passed (after one chat at least). Returns how many it indexed.
 */
export function syncMessageIndex(db, { limit = Infinity, budgetMs = Infinity, newestFirst = false } = {}) {
  const next = db.prepare(`SELECT conversation_id FROM messages_fts_pending ORDER BY rowid ${newestFirst ? 'DESC' : 'ASC'} LIMIT ?`);
  const read = db.prepare('SELECT messages, deleted_at FROM conversations WHERE id = ?');
  const clear = db.prepare('DELETE FROM message_texts WHERE conversation_id = ?');
  const insert = db.prepare(`
    INSERT INTO message_texts (conversation_id, message_id, role, position, at, text)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const done = db.prepare('DELETE FROM messages_fts_pending WHERE conversation_id = ?');
  const indexBatch = db.transaction((ids) => {
    for (const id of ids) {
      clear.run(id);
      const row = read.get(id);
      // Trashed chats leave the index; restoring one queues it again.
      if (row && !row.deleted_at) {
        for (const entry of messageEntries(row.messages)) {
          insert.run(id, entry.messageId, entry.role, entry.position, entry.at, entry.text);
        }
      }
      done.run(id);
    }
  });
  const until = Date.now() + budgetMs;
  // With a time limit, one chat per transaction, so it stops soon after.
  const batch = Number.isFinite(budgetMs) ? 1 : 200;
  let indexed = 0;
  while (indexed < limit) {
    const ids = next.all(Math.min(batch, limit - indexed)).map((row) => row.conversation_id);
    if (!ids.length) break;
    indexBatch(ids);
    indexed += ids.length;
    if (Date.now() >= until) break;
  }
  return indexed;
}

const backgroundRuns = new WeakMap();

/**
 * Indexes the queue until it is empty, a few chats at a time (`budgetMs` of
 * work, then the server answers what came in meanwhile): years of chats can
 * take a while. One run at a time: asking again while one is going joins
 * it. Resolves to how many chats the run indexed.
 */
export function syncMessageIndexInBackground(db, { budgetMs = 20 } = {}) {
  if (backgroundRuns.has(db)) return backgroundRuns.get(db);
  const run = new Promise((resolve, reject) => {
    let indexed = 0;
    // Ends the run in the same turn it finds the queue empty, so a chat
    // queued after that starts a new run instead of joining this one.
    const finish = (settle, value) => {
      backgroundRuns.delete(db);
      settle(value);
    };
    const step = () => {
      try {
        // The server closes the database when it shuts down.
        if (!db.open) return finish(resolve, indexed);
        const count = syncMessageIndex(db, { budgetMs });
        if (!count) return finish(resolve, indexed);
        indexed += count;
      } catch (err) {
        return finish(reject, err);
      }
      setImmediate(step);
    };
    setImmediate(step);
  });
  backgroundRuns.set(db, run);
  return run;
}

const CHAT_COLUMNS = `
  c.id, c.title, c.mode, c.message_count, c.last_message_at, c.created_at, c.updated_at,
  c.is_pinned, c.is_archived, c.folder_id, c.project_ids,
  json_extract(c.metadata, '$.engine') AS engine,
  json_extract(c.metadata, '$.agentProfileId') AS agent_profile_id,
  json_extract(c.metadata, '$.catId') AS cat_id,
  json_extract(c.metadata, '$.workingContext') AS working_context
`;

function parseJson(value, fallback) {
  if (value == null) return fallback;
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
}

function chatResult(row, titleMatch) {
  const { engine, agent_profile_id: agentProfileId, cat_id: catId, working_context: workingContext, project_ids: projectIds, ...rest } = row;
  const metadata = {};
  if (engine) metadata.engine = engine;
  if (agentProfileId) metadata.agentProfileId = agentProfileId;
  if (catId) metadata.catId = catId;
  const context = parseJson(workingContext, null);
  if (context && typeof context === 'object') metadata.workingContext = context;
  return {
    ...rest,
    is_pinned: Boolean(row.is_pinned),
    is_archived: Boolean(row.is_archived),
    project_ids: parseJson(projectIds, []),
    engine: engine || null,
    agent_profile_id: agentProfileId || null,
    metadata,
    title_match: titleMatch,
    hits: [],
    hit_count: 0,
  };
}

// Rows of (id, conversation_id, total, first, seen, lowest), best chat first
// and each chat's best messages first, as a map of chat id to its hit count
// and message row ids. A chat's messages have neighbouring row ids, so when
// the matches filled the window (`seen`), only the chat at its edge (the one
// with its `lowest` row) can have more further back: its count is unknown.
function groupHits(rows, window) {
  const byChat = new Map();
  for (const row of rows) {
    let entry = byChat.get(row.conversation_id);
    if (!entry) {
      const cut = row.seen >= window && row.first === row.lowest;
      entry = { count: cut ? null : row.total, ids: [] };
      byChat.set(row.conversation_id, entry);
    }
    entry.ids.push(row.id);
  }
  return byChat;
}

/**
 * The chats a search finds: chats whose title has every word come first
 * (newest first), then chats whose messages do (best match first). Each
 * message hit carries its message id, time and a snippet with the match
 * between MARK_START and MARK_END. Trashed chats never show.
 *
 * With `messageSlots`, that many places are kept for chats found by what was
 * said, when there are some, so names can't fill a short list. A search
 * ranks the newest matches only (`ranked`), so a word found in nearly every
 * message costs no more than a rare one; a chat's hit count is null when
 * some of its matches were further back.
 */
export function searchChats(db, {
  userId, query, limit = 20, hitsPerChat = 3, messageSlots = 0,
  indexMs = SEARCH_INDEX_MS, ranked = MAX_RANKED,
} = {}) {
  const q = String(query || '').trim();
  if (!q || !userId) return [];
  // What was saved last can be found right away. A longer queue is left to
  // the background (started here if need be); indexingChats() says so.
  syncMessageIndex(db, { newestFirst: true, budgetMs: indexMs });
  if (indexingChats(db)) syncMessageIndexInBackground(db).catch(() => { /* the next search starts it again */ });
  const max = Math.min(50, Math.max(1, Number(limit) || 20));
  const perChat = Math.min(10, Math.max(1, Number(hitsPerChat) || 3));
  const window = Math.max(1, Number(ranked) || MAX_RANKED);

  const hasTitle = titleMatcher(q);
  const titled = db.prepare(`
    SELECT id, title FROM conversations
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY COALESCE(last_message_at, updated_at) DESC
  `).all(userId).filter((row) => hasTitle(row.title)).slice(0, max).map((row) => row.id);

  // The newest matches are ranked and counted in SQL, per chat, so a chat
  // with a few hits is never crowded out by one with hundreds.
  let byChat = new Map();
  let snippets = null;
  const match = ftsQuery(q);
  if (match) {
    try {
      byChat = groupHits(db.prepare(`
        WITH newest AS (
          SELECT rowid AS id, bm25(messages_fts) AS score
          FROM messages_fts
          WHERE messages_fts MATCH ?
          ORDER BY rowid DESC
          LIMIT ?
        ),
        hits AS (
          SELECT w.id, m.conversation_id, w.score
          FROM newest w
          JOIN message_texts m ON m.id = w.id
          JOIN conversations c ON c.id = m.conversation_id
          WHERE c.user_id = ? AND c.deleted_at IS NULL
        )
        SELECT id, conversation_id, total, first,
               (SELECT COUNT(*) FROM newest) AS seen, (SELECT MIN(id) FROM newest) AS lowest
        FROM (
          SELECT id, conversation_id,
                 ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY score, id) AS n,
                 COUNT(*) OVER (PARTITION BY conversation_id) AS total,
                 MIN(score) OVER (PARTITION BY conversation_id) AS best,
                 MIN(id) OVER (PARTITION BY conversation_id) AS first
          FROM hits
        )
        WHERE n <= ?
        ORDER BY best, conversation_id, n
      `).all(match, window, userId, perChat), window);
      // One pass over the matches between the first and last id shown (the
      // `+` keeps FTS5 from running the match once per id, much slower for a
      // common word), and snippets for those ids only.
      snippets = (ids) => db.prepare(`
        SELECT m.id, m.message_id, m.role, m.at,
               snippet(messages_fts, 0, char(2), char(3), '…', ${SNIPPET_TOKENS}) AS snippet
        FROM messages_fts
        JOIN message_texts m ON m.id = messages_fts.rowid
        WHERE messages_fts MATCH ? AND messages_fts.rowid BETWEEN ? AND ?
          AND +messages_fts.rowid IN (${ids.map(() => '?').join(', ')})
      `).all(match, Math.min(...ids), Math.max(...ids), ...ids);
    } catch {
      byChat = new Map();
    }
  }
  // Words the tokenizer keeps whole (Chinese or Japanese runs, say) or
  // nothing it can index: look for the text itself, newest chats first.
  // eslint-disable-next-line no-control-regex
  if (!byChat.size && (!match || /[^\u0000-\u007f]/.test(q))) {
    byChat = groupHits(db.prepare(`
      WITH newest AS (
        SELECT id, conversation_id, position
        FROM message_texts
        WHERE text LIKE ? ESCAPE '\\'
        ORDER BY id DESC
        LIMIT ?
      ),
      hits AS (
        SELECT w.id, w.conversation_id, w.position,
               COALESCE(c.last_message_at, c.updated_at) AS recent
        FROM newest w
        JOIN conversations c ON c.id = w.conversation_id
        WHERE c.user_id = ? AND c.deleted_at IS NULL
      )
      SELECT id, conversation_id, total, first,
             (SELECT COUNT(*) FROM newest) AS seen, (SELECT MIN(id) FROM newest) AS lowest
      FROM (
        SELECT id, conversation_id, recent,
               ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY position DESC, id DESC) AS n,
               COUNT(*) OVER (PARTITION BY conversation_id) AS total,
               MIN(id) OVER (PARTITION BY conversation_id) AS first
        FROM hits
      )
      WHERE n <= ?
      ORDER BY recent DESC, conversation_id, n
    `).all(likePattern(q), window, userId, perChat), window);
    snippets = (ids) => db.prepare(`
      SELECT id, message_id, role, at, text FROM message_texts
      WHERE id IN (${ids.map(() => '?').join(', ')})
    `).all(...ids).map(({ text, ...hit }) => ({ ...hit, snippet: likeSnippet(text, q) }));
  }

  // Found by name first, keeping `messageSlots` places for the others.
  const named = new Set(titled);
  const said = [...byChat.keys()].filter((id) => !named.has(id));
  const nameCount = Math.min(titled.length, max - Math.min(messageSlots, said.length, max));
  const shown = [...titled.slice(0, nameCount), ...said.slice(0, max - nameCount)];
  const rows = shown.length ? db.prepare(`
    SELECT ${CHAT_COLUMNS} FROM conversations c
    WHERE c.user_id = ? AND c.id IN (${shown.map(() => '?').join(', ')})
  `).all(userId, ...shown) : [];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const results = shown.filter((id) => rowsById.has(id)).map((id) => chatResult(rowsById.get(id), named.has(id)));

  // Snippets are only made for the messages that will be shown.
  const ids = results.flatMap((chat) => byChat.get(chat.id)?.ids || []);
  const hitsById = new Map(ids.length && snippets
    ? snippets(ids).map(({ id, ...hit }) => [id, hit])
    : []);
  for (const chat of results) {
    const entry = byChat.get(chat.id);
    if (!entry) continue;
    chat.hits = entry.ids.map((id) => hitsById.get(id)).filter(Boolean);
    chat.hit_count = entry.count;
  }
  return results;
}
