import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_KEYBOARD_SHORTCUTS, assignShortcut, findConflict, keysFromEvent, mergeSavedShortcuts } from './keyboardShortcutsUtils.js';

test('shortcut labels use the names the sidebar uses', () => {
  const labels = Object.fromEntries(Object.entries(DEFAULT_KEYBOARD_SHORTCUTS).map(([id, item]) => [id, item.label]));
  assert.equal(labels.newChat, 'New chat');
  assert.equal(labels.dock1, 'Chat');
  assert.equal(labels.dock2, 'All chats');
  assert.equal(labels.dock8, 'Agents');
  for (const label of Object.values(labels)) {
    assert.doesNotMatch(label, /Command Center|Chat History|Gallery/, label);
    // Sentence case: no capital after the first word, except names like Tools & Skills.
    if (label !== 'Tools & Skills') assert.doesNotMatch(label.slice(1), /\s[A-Z]/, label);
  }
});

test('saved shortcuts keep their keys but take labels and actions from the defaults', () => {
  const saved = {
    dock1: { key: '9', ctrl: true, meta: true, label: 'Command Center', action: 'navHome' },
    dock2: { key: '2', ctrl: true, meta: true, label: 'Chat History', action: 'somethingOld' },
    dock7: { key: '7', ctrl: true, meta: true, label: 'Gallery', action: 'navMade' },
    search: { label: 'Search' },
  };
  const merged = mergeSavedShortcuts(saved);
  assert.deepEqual(merged.dock1, { ...DEFAULT_KEYBOARD_SHORTCUTS.dock1, key: '9' });
  assert.equal(merged.dock2.label, 'All chats');
  assert.equal(merged.dock2.action, 'navChat');
  assert.equal(merged.dock7, undefined, 'ids that are gone are dropped');
  assert.deepEqual(merged.search, DEFAULT_KEYBOARD_SHORTCUTS.search, 'an entry without a key keeps the default');
  assert.deepEqual(mergeSavedShortcuts(null), DEFAULT_KEYBOARD_SHORTCUTS);
  assert.deepEqual(mergeSavedShortcuts('nonsense'), DEFAULT_KEYBOARD_SHORTCUTS);
});

test('taking keys another shortcut has swaps the two', () => {
  const shortcuts = mergeSavedShortcuts(null);
  assert.equal(findConflict(shortcuts, 'dock3', { key: 'k', ctrl: true }), 'search');
  assert.equal(findConflict(shortcuts, 'search', { key: 'K', ctrl: true }), null, 'its own keys are no conflict');
  assert.equal(findConflict(shortcuts, 'dock3', { key: 'j', ctrl: true }), null);
  const next = assignShortcut(shortcuts, 'dock3', { key: 'k', ctrl: true, meta: true });
  assert.equal(next.dock3.key, 'k');
  assert.equal(next.search.key, '3');
  assert.equal(next.dock3.label, 'Projects');
  const plain = assignShortcut(shortcuts, 'dock3', { key: 'j', ctrl: true, meta: true });
  assert.equal(plain.dock3.key, 'j');
  assert.equal(plain.search.key, 'k');
});

test('recording takes Ctrl or ⌘ and one key, never a plain key', () => {
  assert.deepEqual(keysFromEvent({ key: 'J', ctrlKey: true, metaKey: false }), { key: 'j', ctrl: true, meta: true });
  assert.deepEqual(keysFromEvent({ key: '7', ctrlKey: false, metaKey: true }), { key: '7', ctrl: true, meta: true });
  assert.equal(keysFromEvent({ key: 'j', ctrlKey: false, metaKey: false }), null);
  assert.equal(keysFromEvent({ key: 'Control', ctrlKey: true, metaKey: false }), null);
  assert.equal(keysFromEvent({ key: 'Shift', ctrlKey: true, metaKey: false }), null);
});
