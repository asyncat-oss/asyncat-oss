import test from 'node:test';
import assert from 'node:assert/strict';
import {
  keyAction, pushHistory, loadHistory, saveHistory, stepHistory, canBrowseHistory, modelNotice,
  sendBlockReason, windowState, conversationHistory, chatMessages, handOffText, newTurnId, shouldStartFresh,
  modLabel, HISTORY_KEY, HISTORY_LIMIT, KEEP_CHAT_MS,
} from './quickAsk.js';

test('Enter sends, Shift+Enter adds a line, Ctrl or Cmd+Enter opens the app', () => {
  assert.equal(keyAction({ key: 'Enter' }), 'send');
  assert.equal(keyAction({ key: 'Enter', shiftKey: true }), 'newline');
  assert.equal(keyAction({ key: 'Enter', ctrlKey: true }), 'open-in-app');
  assert.equal(keyAction({ key: 'Enter', metaKey: true }), 'open-in-app');
  assert.equal(keyAction({ key: 'a' }), null);
});

test('Enter while an IME is composing never sends', () => {
  assert.equal(keyAction({ key: 'Enter', isComposing: true }), null);
  assert.equal(keyAction({ key: 'Enter', keyCode: 229 }), null);
});

test('history keeps the newest 50 prompts without repeats', () => {
  assert.deepEqual(pushHistory(['a', 'b'], ' a '), ['b', 'a']);
  assert.deepEqual(pushHistory(['a'], '   '), ['a']);
  assert.deepEqual(pushHistory(null, 'x'), ['x']);
  const long = Array.from({ length: 60 }, (_, i) => `p${i}`);
  const next = pushHistory(long, 'new');
  assert.equal(next.length, HISTORY_LIMIT);
  assert.equal(next.at(-1), 'new');
  assert.equal(next[0], 'p11');
});

test('history is read and written safely', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(loadHistory(storage), []);
  saveHistory(storage, ['one', 'two']);
  assert.deepEqual(loadHistory(storage), ['one', 'two']);
  store.set(HISTORY_KEY, '{not json');
  assert.deepEqual(loadHistory(storage), []);
  store.set(HISTORY_KEY, JSON.stringify(['ok', 3, null]));
  assert.deepEqual(loadHistory(storage), ['ok']);
  assert.deepEqual(loadHistory(null), []);
  saveHistory({ setItem: () => { throw new Error('full'); } }, ['x']);
});

test('↑ walks back through prompts and ↓ returns to the draft', () => {
  const history = ['first', 'second', 'third'];
  let at = { history, index: null, draft: '', text: 'my draft' };
  at = { ...at, ...stepHistory(at, -1) };
  assert.equal(at.text, 'third');
  assert.equal(at.draft, 'my draft');
  at = { ...at, ...stepHistory(at, -1) };
  at = { ...at, ...stepHistory(at, -1) };
  assert.equal(at.text, 'first');
  assert.equal(stepHistory(at, -1), null);
  at = { ...at, ...stepHistory(at, 1) };
  assert.equal(at.text, 'second');
  at = { ...at, ...stepHistory(at, 1) };
  at = { ...at, ...stepHistory(at, 1) };
  assert.equal(at.index, null);
  assert.equal(at.text, 'my draft');
  assert.equal(stepHistory(at, 1), null);
  assert.equal(stepHistory({ history: [], index: null, text: '' }, -1), null);
});

test('arrows only browse history from an empty input, the start, or a recalled prompt', () => {
  assert.equal(canBrowseHistory({ text: '' }), true);
  assert.equal(canBrowseHistory({ text: 'abc', selectionStart: 0, selectionEnd: 0 }), true);
  assert.equal(canBrowseHistory({ text: 'abc', selectionStart: 3, selectionEnd: 3 }), false);
  assert.equal(canBrowseHistory({ text: 'abc', selectionStart: 0, selectionEnd: 3 }), false);
  assert.equal(canBrowseHistory({ text: 'abc', selectionStart: 3, selectionEnd: 3, recalled: 'abc' }), true);
  assert.equal(canBrowseHistory({ text: 'abcd', selectionStart: 4, selectionEnd: 4, recalled: 'abc' }), false);
});

const brain = (patch) => ({ isBuiltin: true, loading: false, isReady: false, status: 'idle', model: '', rawModel: '', providerId: 'llamacpp-builtin', ...patch });

test('model notices use the composer wording and offer the right buttons', () => {
  assert.equal(modelNotice(brain({ isReady: true, status: 'ready' })), null);
  assert.equal(modelNotice(brain({ isBuiltin: false })), null);
  assert.equal(modelNotice(brain({ loading: true })), null);
  assert.equal(modelNotice(null), null);

  const notLoaded = modelNotice(brain({ model: 'Qwen3 4B', rawModel: 'qwen3-4b.gguf' }));
  assert.equal(notLoaded.text, "Qwen3 4B isn't loaded right now.");
  assert.deepEqual(notLoaded.actions, ['load', 'models']);
  assert.equal(notLoaded.modelsLabel, 'Change model');

  const mlx = modelNotice(brain({ providerId: 'mlx-builtin', model: 'Gemma', rawModel: '/m/gemma' }));
  assert.deepEqual(mlx.actions, ['models']);

  const loading = modelNotice(brain({ isLoadingModel: true, model: 'Qwen3 4B' }));
  assert.equal(loading.text, 'Model Qwen3 4B is still loading.');
  assert.equal(loading.busy, true);
  assert.deepEqual(loading.actions, []);

  assert.equal(modelNotice(brain({ status: 'error', rawModel: 'x' })).modelsLabel, 'Choose a model');
  assert.equal(modelNotice(brain({})).text, 'No model yet. Choose one to start chatting.');
});

test('Send explains why it is off', () => {
  assert.equal(sendBlockReason({ server: 'down' }), "Asyncat's local server isn't running.");
  assert.equal(sendBlockReason({ server: 'starting' }), 'Starting…');
  assert.equal(sendBlockReason({ server: 'ok', brain: brain({ loading: true }) }), 'Checking which model is ready…');
  assert.equal(sendBlockReason({ server: 'ok', brain: brain({ isReady: true }), notice: null }), '');
  assert.equal(sendBlockReason({ server: 'ok', notice: { text: 'No model yet.' } }), 'No model yet.');
});

test('an empty popup may close on blur; text, a chat or a stream keep it open', () => {
  assert.equal(windowState({}), 'empty');
  assert.equal(windowState({ text: '  ' }), 'empty');
  assert.equal(windowState({ text: 'hi' }), 'thread');
  assert.equal(windowState({ thread: [{}] }), 'thread');
  assert.equal(windowState({ busy: true }), 'busy');
});

const thread = [
  { id: 'msg_1_a', question: 'Q1', answer: 'A1', status: 'done', askedAt: 't1', answeredAt: 't2' },
  { id: 'msg_2_b', question: 'Q2', answer: '', status: 'error', error: 'boom', askedAt: 't3' },
  { id: 'msg_3_c', question: 'Q3', answer: 'partial', status: 'stopped', askedAt: 't4' },
  { id: 'msg_4_d', question: 'Q4', answer: 'half', status: 'error', askedAt: 't5' },
];

test('the model sees only answered turns', () => {
  assert.deepEqual(conversationHistory(thread), [
    { role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' },
    { role: 'user', content: 'Q3' }, { role: 'assistant', content: 'partial' },
  ]);
});

test('the saved chat has a question and an answer per answered turn', () => {
  const messages = chatMessages(thread);
  assert.deepEqual(messages.map((m) => m.id), ['msg_1_a_user', 'msg_1_a_assistant', 'msg_3_c_user', 'msg_3_c_assistant']);
  assert.deepEqual(messages.map((m) => m.type), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(messages[1].timestamp, 't2');
  assert.equal(messages[3].timestamp, 't4');
  assert.ok(messages.every((m) => m.branchId === 'main'));
  assert.deepEqual(chatMessages([]), []);
});

test('with nothing saved, the app gets the typed text or else the question that failed', () => {
  const failed = [{ id: 'msg_5_e', question: ' Q5 ', answer: '', status: 'error', error: 'offline' }];
  assert.equal(handOffText({ text: '  typed  ', thread: failed }), 'typed');
  assert.equal(handOffText({ text: '', thread: failed }), 'Q5');
  assert.equal(handOffText({ text: '', thread: [...failed, { id: 'msg_6_f', question: 'Q6', answer: '', status: 'stopped' }] }), '');
  assert.equal(handOffText({ text: '', thread: [] }), '');
  assert.equal(handOffText(), '');
});

test('turn ids are unique and shaped like the app\'s', () => {
  assert.match(newTurnId(123, () => 0.5), /^msg_123_[a-z0-9]+$/);
  assert.notEqual(newTurnId(1), newTurnId(1));
});

test('a popup reopened after ten minutes starts fresh, unless it is still answering', () => {
  const now = 1_000_000_000;
  assert.equal(shouldStartFresh({ hiddenAt: now - KEEP_CHAT_MS - 1, now }), true);
  assert.equal(shouldStartFresh({ hiddenAt: now - 60_000, now }), false);
  assert.equal(shouldStartFresh({ hiddenAt: now - KEEP_CHAT_MS - 1, now, busy: true }), false);
  assert.equal(shouldStartFresh({ hiddenAt: 0, now }), false);
  assert.equal(shouldStartFresh({ hiddenAt: undefined, now }), false);
});

test('hints say Cmd on macOS and Ctrl elsewhere', () => {
  assert.equal(modLabel(true), 'Cmd');
  assert.equal(modLabel(false), 'Ctrl');
});
