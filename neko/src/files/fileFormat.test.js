import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSort, diskUsesText, filterChips, formatBytes, groupLogs, isPlace, isPlaceKind, metaLine, openId, pictureDetails, previewKind, runtimeLabel, shortDate,
  steadySizes,
} from './fileFormat.js';

test('sizes read the way the design writes them', () => {
  assert.equal(formatBytes(32), '32 B');
  assert.equal(formatBytes(4 * 1024), '4 KB');
  assert.equal(formatBytes(1.2 * 1024 ** 2), '1.2 MB');
  assert.equal(formatBytes(310 * 1024 ** 2), '310 MB');
  assert.equal(formatBytes(4.9 * 1024 ** 3), '4.9 GB');
  assert.equal(formatBytes(41.2 * 1024 ** 3), '41.2 GB');
  assert.equal(formatBytes(185 * 1024 ** 3), '185 GB');
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(null), '');
});

test('dates leave out this year', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  assert.equal(shortDate('2026-10-12T09:00:00Z', { now, locale: 'en-GB' }), '12 Oct');
  assert.match(shortDate('2025-03-02T09:00:00Z', { now, locale: 'en-GB' }), /^2 Mar 2025$/);
  assert.equal(shortDate('not a date'), '');
  const line = metaLine({ kindLabel: 'Document', bytes: 4096, modifiedAt: '2026-10-12T09:00:00Z', where: 'Balcony garden' }, { now, locale: 'en-GB' });
  assert.equal(line, 'Document · 4 KB · 12 Oct');
});

test('chips: everything first, then the kinds there are; flags are not counted in everything', () => {
  assert.deepEqual(filterChips('made', { picture: 41, document: 22, page: 0 }), [
    { value: '', label: 'Everything', count: 63 },
    { value: 'picture', label: 'Pictures', count: 41 },
    { value: 'document', label: 'Documents', count: 22 },
  ]);
  assert.deepEqual(filterChips('uploads', { 'note-file': 3, unused: 2 }).map((chip) => [chip.label, chip.count]), [['All', 3], ['Note attachments', 3], ['Not used', 2]]);
  assert.deepEqual(filterChips('made', {}), []);
  // A kind asked for by a link shows, picked, even with nothing in it.
  assert.deepEqual(filterChips('made', { document: 5 }, { selected: 'picture' }).map((chip) => [chip.label, chip.count]), [['Everything', 5], ['Pictures', 0], ['Documents', 5]]);
  assert.deepEqual(filterChips('exports', { export: 2 }), [], 'exports has no chips');
  assert.equal(isPlaceKind('made', 'picture'), true);
  assert.equal(isPlaceKind('made', 'language'), false);
  assert.equal(isPlaceKind('models', ''), true);
});

test('models and training list the largest first', () => {
  assert.equal(defaultSort('models'), 'largest');
  assert.equal(defaultSort('made'), 'newest');
});

test('logs & caches are grouped under headings in a fixed order', () => {
  const groups = groupLogs([{ id: 'c', kind: 'cache' }, { id: 'l', kind: 'log' }, { id: 'x', kind: 'mystery' }]);
  assert.deepEqual(groups.map((group) => [group.label, group.items.map((entry) => entry.id)]), [
    ['Logs', ['l']], ['Temporary files and caches', ['c']], ['Other', ['x']],
  ]);
});

test('?open= takes an item id, or a picture by its file name', () => {
  assert.equal(openId('made:chats:plan.md'), 'made:chats:plan.md');
  assert.equal(openId('fox 1.png'), 'picture:fox%201.png');
  assert.equal(openId(''), null);
});

test('the viewer shows each kind its own way, and only what den says it can', () => {
  const can = { preview: true };
  assert.equal(previewKind({ kind: 'picture', can: {} }), 'picture');
  assert.equal(previewKind({ name: 'page.html', can }), 'page');
  assert.equal(previewKind({ name: 'prices.CSV', can }), 'table');
  assert.equal(previewKind({ name: 'plan.md', can }), 'markdown');
  assert.equal(previewKind({ name: 'logo.svg', can }), 'svg');
  assert.equal(previewKind({ name: 'run.py', can }), 'text');
  assert.equal(previewKind({ name: 'app-2026-10-01.log', tail: true, can }), 'log');
  assert.equal(previewKind({ name: 'song.mp3', can }), 'audio');
  assert.equal(previewKind({ name: 'report.pdf', can: { preview: false } }), null);
  assert.equal(previewKind({ name: 'page.html', can: { preview: false } }), null, 'never what den did not offer');
});

test("a picture's details say what made it", () => {
  const details = pictureDetails({ runtime: 'stable-diffusion.cpp', model: 'sd-turbo.gguf', width: 512, height: 512, seed: 42, bytes: 300 * 1024, modifiedAt: '2026-10-12T09:00:00Z' }, { locale: 'en-GB' });
  assert.deepEqual(details, ['On this computer', 'sd-turbo.gguf', '512 × 512', 'Seed 42', '300 KB', '12 Oct 2026']);
  assert.equal(runtimeLabel('openai'), 'OpenAI');
  assert.equal(runtimeLabel('something-new'), 'something-new');
});

test('the seven places', () => {
  assert.equal(isPlace('made'), true);
  assert.equal(isPlace('system'), true);
  assert.equal(isPlace('gallery'), false);
  assert.equal(isPlace(undefined), false);
});

test('a place counted again keeps its last full size until the new count is done', () => {
  const first = { appBytes: 300, places: [{ id: 'made', bytes: 100, partial: false }, { id: 'system', bytes: 200, partial: false }] };
  const recounting = { appBytes: 12, places: [{ id: 'made', bytes: 12, partial: true }, { id: 'system', bytes: null, partial: true }] };
  const steady = steadySizes(first, recounting);
  assert.deepEqual(steady.places.map((place) => [place.bytes, place.partial]), [[100, false], [200, false]]);
  assert.equal(steady.appBytes, 300);
  const done = { appBytes: 250, places: [{ id: 'made', bytes: 50, partial: false }, { id: 'system', bytes: 200, partial: false }] };
  assert.equal(steadySizes(steady, done).appBytes, 250);
  // Nothing counted before: the partial count shows, with its "+".
  assert.deepEqual(steadySizes(null, recounting).places[0], { id: 'made', bytes: 12, partial: true });
});

test('the disk summary counts until the big places have sizes', () => {
  const summary = (places, appBytes = 0) => ({ places, appBytes });
  assert.equal(diskUsesText(null), null);
  assert.equal(diskUsesText(summary([{ id: 'made', bytes: 0 }, { id: 'system', bytes: null }, { id: 'models', bytes: null }])), 'Counting…');
  assert.equal(diskUsesText(summary([{ id: 'made', bytes: 0 }, { id: 'system', bytes: 2_000_000, partial: true }, { id: 'models', bytes: 0 }])), 'Counting…');
  assert.equal(diskUsesText(summary([{ id: 'made', bytes: null }, { id: 'system', bytes: 2_700_000 }, { id: 'models', bytes: 0 }], 2_700_000)), 'Asyncat uses 2.6 MB+');
  assert.equal(diskUsesText(summary([{ id: 'made', bytes: 0 }, { id: 'system', bytes: 2_700_000 }, { id: 'models', bytes: 0 }], 2_700_000)), 'Asyncat uses 2.6 MB');
});
