import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

// Search inside chats: one full-text index over what the user and the
// assistant said (not tool output, reasoning or JSON keys), kept current
// through saves, trash, restore, deletes and imports, used by both the
// search palette (/api/search) and the All chats page (/chats/search).

const { default: db } = await import('../src/db/client.js');
const { chatService } = await import('../src/ai/controllers/ai/chatService.js');
const { importChats } = await import('../src/importers/chatImport.js');
const {
  MARK_START, MARK_END, visibleText, messageEntries, ftsQuery, titleMatcher, likeSnippet,
  ensureMessageIndex, syncMessageIndex, syncMessageIndexInBackground, indexingChats, searchChats,
} = await import('../src/search/messageIndex.js');

const userId = randomUUID();
const otherUserId = randomUUID();
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Demo')").run(userId, `${userId}@example.test`);
db.prepare("INSERT INTO users (id, email, name) VALUES (?, ?, 'Other')").run(otherUserId, `${otherUserId}@example.test`);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Demo', ?)").run(workspaceId, userId);
db.prepare("INSERT INTO workspaces (id, name, owner_id) VALUES (?, 'Other', ?)").run(otherWorkspaceId, otherUserId);

const save = (messages, options = {}) => chatService.saveConversation(userId, messages, { workspaceId, ...options });
// Everything saved is indexed before these searches look, however slow the
// machine; the long-queue test below checks the short time limit itself.
const search = (query, options = {}) => searchChats(db, { userId, query, indexMs: Infinity, ...options });
const marked = (snippet) => [...snippet.matchAll(new RegExp(`${MARK_START}([^${MARK_END}]*)${MARK_END}`, 'g'))].map((m) => m[1]);
const pending = () => db.prepare('SELECT COUNT(*) AS n FROM messages_fts_pending').get().n;
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test('only the words people saw are indexed', () => {
  assert.equal(visibleText('<think>secret plan</think>**Water** the `basil`'), 'Water the basil');
  assert.equal(visibleText('Sure.<tool_call>{"name":"web_search"}</tool_call> Done'), 'Sure. Done');
  assert.equal(visibleText('Look ![chart](data:image/png;base64,iVBORw0KGgo=) here'), 'Look here');
  assert.equal(visibleText('| Plant | Water |\n|---|---|\n| Basil | Daily |'), 'Plant Water Basil Daily');
  assert.equal(visibleText('```js\nconst x = 1;\n```'), 'const x = 1;');
  assert.equal(visibleText(`a${MARK_START}b${MARK_END}c`), 'a b c', 'no stray markers');
  assert.equal(visibleText(null), '');

  const entries = messageEntries(JSON.stringify([
    { user: 'How deep for tomatoes?', id: 'u1', timestamp: '2026-10-01T10:00:00.000Z' },
    { cat: 'At least 30 cm.', id: 'a1', agentEvents: [{ type: 'tool_start', result: { output: 'hidden tool text' } }] },
    { cat: '<think>only thinking</think>' },
    { cat: 'No id here' },
  ]));
  assert.deepEqual(entries.map((e) => [e.messageId, e.role, e.text, e.at]), [
    ['u1', 'user', 'How deep for tomatoes?', '2026-10-01T10:00:00.000Z'],
    ['a1', 'assistant', 'At least 30 cm.', null],
    ['msg_3', 'assistant', 'No id here', null],
  ]);
  assert.deepEqual(messageEntries('not json'), []);
});

test('what is typed becomes a safe prefix query', () => {
  assert.equal(ftsQuery('deploy kube'), '"deploy"* "kube"*');
  assert.equal(ftsQuery(`don't "drop" NEAR(x) *`), '"don t" "drop"* "NEAR x"');
  assert.equal(ftsQuery('café'), '"café"*');
  assert.equal(ftsQuery('++ --'), '');
  // One letter is a whole word, even while it is being typed: as a prefix
  // it would match nearly every message. The next letter makes it one.
  assert.equal(ftsQuery('c++'), '"c"');
  assert.equal(ftsQuery('c# tips'), '"c" "tips"*');
  assert.equal(ftsQuery('vitamin c'), '"vitamin"* "c"');
  assert.equal(ftsQuery('vitamin ca'), '"vitamin"* "ca"*');
  assert.equal(likeSnippet('The quick brown fox', 'brown'), `The quick ${MARK_START}brown${MARK_END} fox`);
});

test('titles match where words start, as messages do, ignoring case and accents', () => {
  const has = (query, title) => titleMatcher(query)(title);
  assert.ok(has('an', 'Anglesey walks'));
  assert.ok(!has('an', 'Explanation of taxes'), 'not inside a word');
  assert.ok(!has('an', 'Banana bread'));
  assert.ok(has('cafe', 'Café plans'));
  assert.ok(has('PLAN week', 'Plan my week'), 'every word, anywhere');
  assert.ok(!has('plan month', 'Plan my week'));
  assert.ok(has("don't", "Don't panic"));
  // One letter: a whole word, unless it ends what is typed.
  assert.ok(has('c++', 'C++ tips'));
  assert.ok(!has('c++', 'Coastal walk'));
  assert.ok(has('vitamin c', 'Vitamin cocktails'));
  assert.ok(!has('c vitamin', 'Coastal vitamin'));
  // Written without spaces: anywhere in the run.
  assert.ok(has('タワー', '東京タワー'));
  // Nothing but symbols: the title just has to contain them.
  assert.ok(has('++', 'C++ tips'));
  assert.ok(!has('++', 'Coastal walk'));
  assert.ok(!has('', 'Anything'));
});

test('a word only in an answer finds the chat, with a snippet, the message id and its time', async () => {
  const saved = await save([
    { id: 'gm-u1', type: 'user', content: 'What should I grow on a shady balcony?', timestamp: '2026-10-02T09:00:00.000Z' },
    {
      id: 'gm-a1',
      type: 'assistant',
      content: 'Try ferns, mint and the hardy lungwort, which likes shade.',
      timestamp: '2026-10-02T09:00:05.000Z',
      agentEvents: [{ type: 'tool_start', data: { tool: 'web_search' }, result: { output: 'zebrafish aquarium results' } }],
      toolCalls: [{ name: 'web_search', result: 'zebrafish' }],
    },
  ], { title: 'Shady balcony' });

  const [chat, ...rest] = search('lungwort');
  assert.equal(rest.length, 0);
  assert.equal(chat.id, saved.conversationId);
  assert.equal(chat.title_match, false);
  assert.equal(chat.hit_count, 1);
  assert.equal(chat.hits[0].message_id, 'gm-a1');
  assert.equal(chat.hits[0].role, 'assistant');
  assert.equal(chat.hits[0].at, '2026-10-02T09:00:05.000Z');
  assert.deepEqual(marked(chat.hits[0].snippet), ['lungwort']);

  assert.deepEqual(search('lungw').map((c) => c.id), [saved.conversationId], 'prefixes match');
  assert.deepEqual(search('zebrafish'), [], 'tool output is not searched');
  assert.deepEqual(search('timestamp'), [], 'JSON keys are not searched');
  assert.deepEqual(searchChats(db, { userId: otherUserId, query: 'lungwort' }), [], "another person's chats stay theirs");

  // Saving again re-indexes: the old text goes, the new text comes.
  await save([
    { id: 'gm-u1', type: 'user', content: 'What should I grow on a shady balcony?' },
    { id: 'gm-a1', type: 'assistant', content: 'Hostas and begonias do well.' },
  ], { conversationId: saved.conversationId, knownMessageIds: ['gm-u1', 'gm-a1'] });
  assert.deepEqual(search('lungwort'), []);
  assert.equal(search('begonias')[0].hits[0].message_id, 'gm-a1');
});

test('title matches come first, then chats where a message matched', async () => {
  const inMessage = await save([
    { id: 'tm-u1', type: 'user', content: 'Plan my week' },
    { id: 'tm-a1', type: 'assistant', content: 'Monday: repot the rosemary.' },
  ], { title: 'Weekly plan' });
  const inTitle = await save([
    { id: 'tt-u1', type: 'user', content: 'Help with herbs' },
  ], { title: 'Rosemary cuttings' });

  const results = search('rosemary');
  assert.deepEqual(results.map((c) => c.id), [inTitle.conversationId, inMessage.conversationId]);
  assert.equal(results[0].title_match, true);
  assert.deepEqual(results[0].hits, []);
  assert.equal(results[1].title_match, false);
});

test('a short list keeps places for chats found by what was said', async () => {
  const named = [];
  for (let i = 0; i < 3; i += 1) {
    named.push((await save([{ id: `hn-u${i}`, type: 'user', content: 'Birds by the river' }], { title: `Heron ${i}` })).conversationId);
  }
  const said = await save([
    { id: 'hs-u1', type: 'user', content: 'What was that grey bird?' },
    { id: 'hs-a1', type: 'assistant', content: 'Most likely a grey heron.' },
  ], { title: 'Bird by the canal' });

  const titlesOnly = search('heron', { limit: 3 });
  assert.ok(titlesOnly.every((c) => c.title_match), 'names first');
  const kept = search('heron', { limit: 3, messageSlots: 1 });
  assert.equal(kept.length, 3);
  assert.deepEqual(kept.slice(0, 2).map((c) => c.title_match), [true, true]);
  assert.equal(kept[2].id, said.conversationId);
  assert.equal(search('heron', { limit: 10, messageSlots: 1 }).length, 4, 'and no more than it needs');
  assert.ok(named.every((id) => search('heron', { limit: 10 }).some((c) => c.id === id)));
});

test('a word in nearly every message ranks the newest matches only, and says when a count is cut short', async () => {
  const older = await save(Array.from({ length: 5 }, (_, i) => (
    { id: `pm-o${i}`, type: 'user', content: `A pademelon by the fence, day ${i}` }
  )), { title: 'Garden visitors' });
  const newer = await save([
    { id: 'pm-n1', type: 'user', content: 'Was that a pademelon?' },
    { id: 'pm-n2', type: 'assistant', content: 'Yes, a pademelon: a small wallaby.' },
  ], { title: 'Night walk' });
  syncMessageIndex(db);

  const counts = (options) => new Map(search('pademelon', options).map((c) => [c.id, c.hit_count]));
  const all = counts();
  assert.equal(all.get(older.conversationId), 5);
  assert.equal(all.get(newer.conversationId), 2);
  const newest = counts({ ranked: 4 });
  assert.equal(newest.get(newer.conversationId), 2, 'every match of a chat inside the window is counted');
  assert.equal(newest.get(older.conversationId), null, 'the chat at its edge may have more');
});

test('a chat with hundreds of matches never hides one with a single match', async () => {
  const long = [];
  for (let i = 0; i < 230; i += 1) {
    long.push({ id: `zl-u${i}`, type: 'user', content: `Zephyr reading ${i}, 東京タワーは${i}番` });
    long.push({ id: `zl-a${i}`, type: 'assistant', content: `The zephyr reading ${i} looks fine.` });
  }
  const big = await save(long, { title: 'Sensor log' });
  const small = await save([
    { id: 'zs-u1', type: 'user', content: 'What is the soft west wind called in old poems?' },
    { id: 'zs-a1', type: 'assistant', content: 'Poets call it a zephyr, the herald of spring. 東京タワーの話もあります。' },
  ], { title: 'Wind names' });

  // Full-text matches, then words the tokenizer keeps whole (found by LIKE).
  for (const [query, bigCount] of [['zephyr', 460], ['タワー', 230]]) {
    const byId = new Map(search(query, { limit: 50 }).map((chat) => [chat.id, chat]));
    assert.equal(byId.get(big.conversationId)?.hit_count, bigCount, `${query}: every match is counted`);
    assert.equal(byId.get(big.conversationId).hits.length, 3, `${query}: only the best few are sent`);
    assert.equal(byId.get(small.conversationId)?.hit_count, 1, `${query}: the small chat is found`);
    assert.equal(byId.get(small.conversationId).hits[0].message_id, 'zs-a1');
  }
});

test('trashed chats are left out until restored; deleted ones leave the index', async () => {
  const saved = await save([
    { id: 'tr-u1', type: 'user', content: 'Remind me about the quince jam' },
    { id: 'tr-a1', type: 'assistant', content: 'Quince jam needs long, slow cooking.' },
  ], { title: 'Jam' });
  const id = saved.conversationId;
  assert.deepEqual(search('quince').map((c) => c.id), [id]);

  await chatService.deleteConversation(userId, id, workspaceId);
  assert.deepEqual(search('quince'), []);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM message_texts WHERE conversation_id = ?').get(id).n, 0);

  await chatService.restoreConversation(userId, id, workspaceId);
  assert.deepEqual(search('quince').map((c) => c.id), [id]);

  await chatService.deleteConversation(userId, id, workspaceId);
  await chatService.permanentDeleteConversation(userId, id, workspaceId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM message_texts WHERE conversation_id = ?').get(id).n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM messages_fts WHERE messages_fts MATCH 'quince'").get().n, 0);
});

test('imported chats are indexed in the background, and searchable', async () => {
  const result = importChats(userId, {
    format: 'claude',
    chats: [{
      sourceId: 'imp-1',
      title: 'Old chat',
      createdAt: '2025-01-01T00:00:00.000Z',
      messages: [
        { role: 'user', content: 'Name a hardy succulent', at: '2025-01-01T00:00:00.000Z' },
        { role: 'assistant', content: 'Sempervivum, the houseleek.', at: '2025-01-01T00:00:05.000Z' },
      ],
    }],
  }, { workspaceId });
  assert.equal(result.imported, 1);
  assert.ok(pending() > 0, 'the import does not wait for the index');
  for (let turn = 0; turn < 20 && pending() > 0; turn += 1) await nextTurn();
  assert.equal(pending(), 0, 'indexed right after, without a search');
  const [chat] = search('houseleek');
  assert.equal(chat.title, 'Old chat');
  assert.match(chat.hits[0].message_id, /^msg_imp_/);
});

test('a long queue is indexed a few chats at a time, and never holds a search up', async () => {
  await syncMessageIndexInBackground(db); // whatever the tests before left
  for (let i = 0; i < 12; i += 1) {
    await save([{ id: `bg-u${i}`, type: 'user', content: `Where should marigold ${i} go?` }], { title: `Bed ${i}` });
  }
  assert.equal(pending(), 12);
  assert.equal(indexingChats(db), true);
  const done = syncMessageIndexInBackground(db, { budgetMs: 0 });
  assert.equal(syncMessageIndexInBackground(db), done, 'one run at a time');
  await nextTurn();
  assert.equal(pending(), 11, 'the rest waits for a later turn, so requests are answered in between');

  // A search indexes the chat saved last, for a moment only, and answers
  // from what is indexed so far.
  const found = searchChats(db, { userId, query: 'marigold', limit: 50, indexMs: 0 });
  assert.deepEqual(found.map((c) => c.title).sort(), ['Bed 0', 'Bed 11']);
  assert.equal(pending(), 10);
  assert.equal(indexingChats(db), true, 'so it can say some are still to come');

  assert.equal(await done, 11, 'the background does the rest');
  assert.equal(pending(), 0);
  assert.equal(indexingChats(db), false);
  assert.equal(search('marigold', { limit: 50 }).length, 12);
});

test('words the tokenizer keeps whole are still found inside a message', async () => {
  const saved = await save([
    { id: 'jp-u1', type: 'user', content: '東京タワーの高さは?' },
    { id: 'jp-a1', type: 'assistant', content: '東京タワーは333メートルです。' },
  ], { title: 'Tower' });
  const [chat] = search('タワー');
  assert.equal(chat.id, saved.conversationId);
  assert.deepEqual(marked(chat.hits[0].snippet), ['タワー']);
});

test('a word that is one letter and symbols finds that word, not every word with its letter', async () => {
  const code = await save([
    { id: 'cp-u1', type: 'user', content: 'Is C++ hard to learn?' },
    { id: 'cp-a1', type: 'assistant', content: 'It takes a while; start with small programs.' },
  ], { title: 'Learning to code' });
  const walk = await save([
    { id: 'cw-u1', type: 'user', content: 'Check the crows on the cliff path' },
  ], { title: 'Coastal walk' });
  const found = search('c++').map((c) => c.id);
  assert.ok(found.includes(code.conversationId));
  assert.ok(!found.includes(walk.conversationId));
});

test('the first start queues the chats already there, once, and indexes them in the background', async () => {
  const memory = new Database(':memory:');
  memory.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, messages TEXT NOT NULL DEFAULT '[]', deleted_at TEXT,
      last_message_at TEXT, updated_at TEXT, created_at TEXT
    );
    INSERT INTO conversations (id, messages) VALUES ('c1', '[{"user":"Where do peonies grow?","id":"m1"}]');
    INSERT INTO conversations (id, messages, deleted_at) VALUES ('c2', '[{"user":"peonies in the bin","id":"m2"}]', '2026-01-01');
  `);
  assert.equal(ensureMessageIndex(memory), 1, 'the chat in the bin is left out');
  assert.equal(memory.prepare('SELECT COUNT(*) AS n FROM message_texts').get().n, 0, 'starting does not wait for the index');
  assert.equal(await syncMessageIndexInBackground(memory), 1);
  assert.deepEqual(memory.prepare('SELECT message_id FROM message_texts').all(), [{ message_id: 'm1' }]);
  assert.equal(ensureMessageIndex(memory), 0, 'not again');
  memory.close();
  assert.equal(await syncMessageIndexInBackground(memory), 0, 'stops once the database is closed');
});

test('the search palette opens a chat at the message it shows, and one found only by its name as usual', async () => {
  await save([
    { id: 'pal-u1', type: 'user', content: 'Ideas for the allotment' },
    { id: 'pal-a1', type: 'assistant', content: 'Grow some kohlrabi near the beans.' },
  ], { title: 'Allotment' });
  await save([
    { id: 'pal-u2', type: 'user', content: 'When do parsnips go in?' },
    { id: 'pal-a2', type: 'assistant', content: 'Sow parsnips in spring, once the soil is workable.' },
  ], { title: 'Parsnip timing' });
  syncMessageIndex(db);
  const { default: express } = await import('express');
  const { default: searchRouter } = await import('../src/search/searchRouter.js');
  const app = express();
  app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  app.use('/api/search', searchRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const get = (query) => new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${server.address().port}/api/search?q=${query}&types=conversations`, (res) => {
      let text = '';
      res.on('data', (d) => { text += d; });
      res.on('end', () => resolve(JSON.parse(text)));
    }).on('error', reject);
  });
  try {
    const answer = await get('kohlrabi');
    assert.equal(answer.indexing, false, 'every chat is indexed');
    const [hit] = answer.results;
    assert.equal(hit._type, 'conversation');
    assert.equal(hit.title, 'Allotment');
    assert.equal(hit.messageId, 'pal-a1');
    assert.equal(hit.titleMatch, false);
    assert.deepEqual(marked(hit.snippet), ['kohlrabi']);

    // Found by its name and by a message: the row shows that message, so
    // the chat opens there.
    const [named] = (await get('parsnip')).results;
    assert.equal(named.title, 'Parsnip timing');
    assert.equal(named.titleMatch, true);
    assert.equal(named.messageId, 'pal-u2');
    assert.equal(named.snippet, `When do ${MARK_START}parsnips${MARK_END} go in?`);

    // Found only by its name: no snippet, and it opens as usual.
    const [titleOnly] = (await get('timing')).results;
    assert.equal(titleOnly.title, 'Parsnip timing');
    assert.equal(titleOnly.titleMatch, true);
    assert.equal(titleOnly.snippet, '');
    assert.equal(titleOnly.messageId, null);
  } finally {
    server.close();
  }
});
