import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanConfirm, cleanedMessage, lockHint, manageLabel, menuItems, placeCleans, removeConfirm, removedMessage, removeLabel,
} from './fileActions.js';

const can = (over = {}) => ({ preview: false, open: false, reveal: false, download: false, delete: false, chat: false, manage: false, ...over });
const ids = (items) => items.map((entry) => (entry.separator ? '—' : entry.id));

const plan = {
  id: 'made:chats:plan.md', place: 'made', kind: 'document', title: 'plan.md', name: 'plan.md', path: '/data/plan.md',
  badges: [], can: can({ preview: true, open: true, reveal: true, download: true, delete: true }), deleteVerb: 'trash',
};

test('a file the desktop app can trash offers everything, with Move to Trash last', () => {
  const items = menuItems(plan, { desktop: true });
  assert.deepEqual(ids(items), ['open', 'reveal', 'download', 'copy', '—', 'remove']);
  assert.equal(items.at(-1).label, 'Move to Trash');
  assert.equal(items.at(-1).danger, true);
});

test('without the desktop app it says Delete, and Show in folder and Open are hidden', () => {
  const items = menuItems(plan, { desktop: false });
  assert.deepEqual(ids(items), ['download', 'copy', '—', 'remove']);
  assert.equal(items.at(-1).label, 'Delete');
  assert.equal(removeLabel(plan, { desktop: false }), 'Delete');
  assert.deepEqual(removeConfirm(plan, { desktop: false }), { title: 'Delete “plan.md”?', message: 'It is removed from this computer.', confirmLabel: 'Delete' });
  assert.deepEqual(removeConfirm(plan, { desktop: true }), {
    title: 'Move “plan.md” to the Trash?', message: "You can put it back from your computer's Trash.", confirmLabel: 'Move to Trash',
  });
});

test('a loaded model has a greyed-out Delete that says why', () => {
  const model = {
    id: 'model:llm:qwen.gguf', place: 'models', kind: 'language', title: 'Qwen3-8B-Q4_K_M', path: '/m/qwen.gguf', bytes: 5261334938,
    badges: [{ tone: 'success', label: 'Loaded' }], can: can({ reveal: true, manage: true }), manageRoute: '/models?tab=chat&view=local',
    deleteVerb: 'delete', lockedReason: 'That model is loaded. Unload it in Models first.',
  };
  const items = menuItems(model, { desktop: true });
  assert.deepEqual(ids(items), ['reveal', 'copy', 'manage', '—', 'remove']);
  assert.equal(items[2].label, 'Manage in Models');
  assert.deepEqual(items.at(-1), { id: 'remove', label: 'Delete', hint: 'Loaded now', disabled: true });
  assert.equal(lockHint({ badges: [{ label: 'Downloading 42%' }] }), 'Downloading');
  assert.equal(lockHint({ badges: [{ label: 'Drawing' }] }), 'Drawing now');
  assert.equal(lockHint({ kind: 'log', badges: [{ label: 'Today' }] }), 'Writing to it now');
});

test('a model from another folder has no delete, only why', () => {
  const external = {
    id: 'model-ext:llm:abc', place: 'models', kind: 'language', title: 'my-llama', path: '/home/you/llms/my-llama.gguf',
    badges: [{ tone: 'neutral', label: 'Another folder' }], can: can({ reveal: true, manage: true }), manageRoute: '/models?tab=chat&view=local',
    deleteVerb: 'delete', lockedReason: 'Added from another folder',
  };
  const items = menuItems(external, { desktop: true });
  assert.ok(!items.some((entry) => entry.id === 'remove'), 'no delete');
  assert.deepEqual(items.at(-1), { id: 'locked', label: 'Added from another folder', disabled: true });
});

test('a model to delete says how much room it frees', () => {
  const model = { place: 'models', kind: 'language', title: 'Qwen3-8B-Q4_K_M', bytes: 5261334938, deleteVerb: 'delete', badges: [] };
  assert.deepEqual(removeConfirm(model), {
    title: 'Delete Qwen3-8B-Q4_K_M?', message: 'Frees 4.9 GB. Download it again from Models to use it.', confirmLabel: 'Delete',
  });
});

test('pictures, notes, knowledge, adapters and links get their own words', () => {
  const picture = { kind: 'picture', place: 'made', name: 'fox.png', title: 'A red fox', path: '/g/fox.png', can: can({ preview: true, open: true, reveal: true, download: true, delete: true, chat: true }), deleteVerb: 'trash', badges: [] };
  assert.ok(menuItems(picture).some((entry) => entry.id === 'chat' && entry.label === 'Change it in a chat'));
  assert.equal(removeConfirm(picture, { desktop: true }).title, 'Move this picture to the Trash?');
  assert.equal(removeConfirm(picture, { desktop: false }).title, 'Delete this picture?');

  const note = { kind: 'note', place: 'made', title: 'Garden notes', conversationId: 'c1', can: can({ chat: true }), deleteVerb: 'delete', badges: [] };
  assert.deepEqual(ids(menuItems(note)), ['source'], 'notes are managed as notes: no delete');

  const knowledge = { kind: 'knowledge', place: 'uploads', title: 'spec.pdf', where: 'Research', manageRoute: '/agents', can: can({ delete: true, manage: true }), deleteVerb: 'remove', badges: [] };
  assert.equal(removeLabel(knowledge), 'Remove');
  assert.equal(manageLabel(knowledge), 'Manage in Research');
  assert.equal(removeConfirm(knowledge).title, 'Remove “spec.pdf” from Research\'s knowledge?');
  assert.equal(removedMessage(knowledge, { mode: 'delete' }), 'Removed');

  assert.equal(removeConfirm({ kind: 'adapter', title: 'Friendly tone', badges: [] }).title, 'Delete the adapter “Friendly tone”?');
  assert.equal(removeConfirm({ kind: 'document', title: 'x.md', badges: [{ tone: 'neutral', label: 'Link' }], deleteVerb: 'delete' }).message, 'Only the link goes; what it points to stays.');

  const attached = { kind: 'note-file', place: 'uploads', title: 'a.png', badges: [], can: can({ download: true }), lockedReason: 'Its note still uses it.', deleteVerb: 'delete' };
  assert.deepEqual(menuItems(attached).at(-1), { id: 'remove', label: 'Delete', hint: 'Its note uses it', disabled: true });
});

test('the toast says where it went', () => {
  assert.equal(removedMessage(plan, { mode: 'trash' }), 'Moved to the Trash');
  assert.equal(removedMessage(plan, { mode: 'delete' }), 'Deleted');
});

test('clean-ups: which place has which, and what they say', () => {
  assert.deepEqual(placeCleans('logs').map((clean) => clean.action), ['old-logs', 'caches']);
  assert.deepEqual(placeCleans('models').map((clean) => clean.label), ['Delete unfinished downloads']);
  assert.deepEqual(placeCleans('made'), []);
  assert.deepEqual(cleanConfirm('unfinished-downloads', { files: 2, bytes: 3.1 * 1024 ** 3 }), {
    title: 'Delete 2 unfinished downloads?', message: "Frees 3.1 GB. Downloads that are still running aren't touched.", confirmLabel: 'Delete',
  });
  assert.equal(cleanConfirm('unused-attachments', { files: 1, bytes: 0 }).title, 'Delete 1 attachment no note uses?');
  assert.equal(cleanConfirm('old-logs', { files: 3, bytes: 120 * 1024 ** 2 }).message, "Frees 120 MB. Today's logs stay because Asyncat is writing to them.");
  assert.equal(cleanedMessage({ files: 3, freedBytes: 120 * 1024 ** 2 }), 'Cleared 120 MB');
  assert.equal(cleanedMessage({ files: 0, freedBytes: 0 }), 'Nothing to clear');
});
