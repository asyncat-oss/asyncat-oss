import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE, GAP, MIN_ROOM, PANEL_Z, backdropCloses, insideLayerAbove, isTopLayer, openLayer, panelZIndex, placeFloating, placeOpenPanel, floatingStyle, scrollMovesAnchor } from './floating.js';

const viewport = { width: 1000, height: 800 };
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const panel = (width, height) => ({ width, height });

test('a bottom panel opens below its anchor, lined up with its left edge', () => {
  const place = placeFloating(rect(100, 100, 120, 36), panel(200, 240), 'bottom-start', viewport);
  assert.equal(place.placement, 'bottom-start');
  assert.equal(place.left, 100);
  assert.equal(place.top, 136 + GAP);
});

test('bottom-end lines the panel up with the anchor right edge', () => {
  const place = placeFloating(rect(600, 100, 120, 36), panel(200, 100), 'bottom-end', viewport);
  assert.equal(place.left, 720 - 200);
});

test('a bottom panel flips above an anchor near the bottom edge', () => {
  const place = placeFloating(rect(100, 700, 120, 36), panel(200, 240), 'bottom-start', viewport);
  assert.equal(place.placement, 'top-start');
  assert.equal(place.top, 700 - GAP - 240);
  assert.equal(place.maxHeight, 700 - GAP - EDGE);
});

test('it stays below when there is less room above than below', () => {
  const place = placeFloating(rect(100, 300, 120, 36), panel(200, 600), 'bottom-start', viewport);
  assert.equal(place.placement, 'bottom-start');
  assert.equal(place.maxHeight, 800 - 336 - GAP - EDGE);
  // It is cut to the room below and so never covers the anchor.
  assert.equal(place.top, 336 + GAP);
});

test('a top panel flips below when it does not fit above', () => {
  const place = placeFloating(rect(100, 40, 120, 36), panel(200, 240), 'top-start', viewport);
  assert.equal(place.placement, 'bottom-start');
  assert.equal(place.top, 76 + GAP);
});

test('a flipped panel cut to the room above sits right on top of the anchor', () => {
  const place = placeFloating(rect(100, 420, 120, 36), panel(200, 600), 'bottom-start', viewport);
  assert.equal(place.placement, 'top-start');
  assert.equal(place.maxHeight, 420 - GAP - EDGE);
  assert.equal(place.top, EDGE);
});

test('panels are kept inside the viewport sideways', () => {
  assert.equal(placeFloating(rect(900, 100, 80, 36), panel(240, 100), 'bottom-start', viewport).left, 1000 - 240 - EDGE);
  assert.equal(placeFloating(rect(2, 100, 80, 36), panel(240, 100), 'bottom-end', viewport).left, EDGE);
});

test('right placements open beside the anchor', () => {
  const start = placeFloating(rect(100, 100, 120, 36), panel(200, 150), 'right-start', viewport);
  assert.equal(start.left, 220 + GAP);
  assert.equal(start.top, 100);
  const end = placeFloating(rect(100, 400, 120, 36), panel(200, 150), 'right-end', viewport);
  assert.equal(end.top, 436 - 150);
});

test('a panel already open keeps its side while it still has room there', () => {
  // Opened above an anchor near the bottom, then filtered short enough to fit below.
  const anchor = rect(100, 560, 300, 36);
  assert.equal(placeFloating(anchor, panel(300, 100), 'bottom-start', viewport).placement, 'bottom-start');
  const kept = placeFloating(anchor, panel(300, 100), 'top-start', viewport, { keepSide: true });
  assert.equal(kept.placement, 'top-start');
  assert.equal(kept.top, 560 - GAP - 100);
  // Less room above than it needs, but more than MIN_ROOM: it stays and gets shorter.
  const shorter = placeFloating(rect(100, 214, 300, 36), panel(300, 288), 'top-start', viewport, { keepSide: true });
  assert.equal(shorter.placement, 'top-start');
  assert.equal(shorter.maxHeight, 214 - GAP - EDGE);
  assert.equal(shorter.top, EDGE);
  assert.equal(placeFloating(rect(100, 214, 300, 36), panel(300, 288), 'top-start', viewport).placement, 'bottom-start');
});

test('a kept side is given up once it has almost no room left', () => {
  const place = placeFloating(rect(100, 60, 300, 36), panel(300, 240), 'top-start', viewport, { keepSide: true });
  assert.ok(60 - GAP - EDGE < MIN_ROOM);
  assert.equal(place.placement, 'bottom-start');
  assert.equal(place.top, 96 + GAP);
});

test('an open list that gets shorter stays above its anchor, against it', () => {
  const anchor = rect(100, 560, 300, 36);
  const first = placeOpenPanel(anchor, panel(300, 288), null, {}, viewport);
  assert.equal(first.position.placement, 'top-start');
  assert.equal(first.position.top, 560 - GAP - 288);
  const filtered = placeOpenPanel(anchor, panel(300, 100), first.opened, {}, viewport);
  assert.equal(filtered.position.placement, 'top-start');
  assert.equal(filtered.position.top, 560 - GAP - 100);
  assert.equal(filtered.position.minHeight, 0);
  // Placed afresh, the short list would go below. Remembering where it opened
  // (kept while a Combobox hides its list because nothing matches) keeps it above.
  assert.equal(placeOpenPanel(anchor, panel(300, 100), null, {}, viewport).position.placement, 'bottom-start');
});

test('with holdHeight a list above its anchor keeps its height, so its search field stays still', () => {
  const anchor = rect(100, 560, 300, 36);
  const first = placeOpenPanel(anchor, panel(300, 288), null, { holdHeight: true }, viewport);
  const filtered = placeOpenPanel(anchor, panel(300, 100), first.opened, { holdHeight: true }, viewport);
  assert.equal(filtered.position.top, first.position.top);
  assert.equal(filtered.position.minHeight, 288);
  // Below its anchor it simply gets shorter: its top, where the search field is, doesn't move.
  const low = rect(100, 100, 300, 36);
  const below = placeOpenPanel(low, panel(300, 100), placeOpenPanel(low, panel(300, 288), null, { holdHeight: true }, viewport).opened, { holdHeight: true }, viewport);
  assert.equal(below.position.placement, 'bottom-start');
  assert.equal(below.position.minHeight, 0);
});

test('an open panel follows its anchor when the page moves it', () => {
  // A dialog grows around the field while its list is open: the list moves down with it.
  const first = placeOpenPanel(rect(100, 266, 300, 36), panel(300, 170), null, {}, viewport);
  assert.equal(first.position.top, 302 + GAP);
  const moved = placeOpenPanel(rect(100, 308, 300, 36), panel(300, 170), first.opened, {}, viewport);
  assert.equal(moved.position.placement, 'bottom-start');
  assert.equal(moved.position.top, 344 + GAP);
  // Pushed almost to the bottom edge, it goes above.
  const low = placeOpenPanel(rect(100, 720, 300, 36), panel(300, 170), moved.opened, {}, viewport);
  assert.equal(low.position.placement, 'top-start');
  assert.equal(low.position.top, 720 - GAP - 170);
});

test('floatingStyle hides an unmeasured panel and caps its height', () => {
  assert.equal(floatingStyle(null).visibility, 'hidden');
  const style = floatingStyle({ left: 10, top: 20, maxHeight: 150 }, { width: 240, maxHeight: 288 });
  assert.deepEqual(style, { position: 'fixed', left: 10, top: 20, visibility: 'visible', width: 240, maxHeight: 150 });
  assert.equal(floatingStyle({ left: 0, top: 0, maxHeight: 500 }, { maxHeight: 288 }).maxHeight, 288);
});

test('floatingStyle takes the width measured from the anchor and keeps a held height within the room', () => {
  const style = floatingStyle({ left: 0, top: 0, maxHeight: 200, width: 320, minHeight: 288 }, { width: 200, maxHeight: 288 });
  assert.equal(style.width, 320);
  assert.equal(style.minHeight, 200);
  assert.equal(floatingStyle({ left: 0, top: 0, maxHeight: 400, minHeight: 0 }, { maxHeight: 288 }).minHeight, undefined);
});

test('only the newest layer is on top, and clicks in layers above are known', () => {
  const dialogNode = { name: 'dialog' };
  const listNode = { name: 'list' };
  const dialog = { contains: (node) => node === dialogNode };
  const list = { contains: (node) => node === listNode };
  const closeDialog = openLayer(dialog);
  const closeList = openLayer(list);
  assert.equal(isTopLayer(list), true);
  assert.equal(isTopLayer(dialog), false);
  assert.equal(insideLayerAbove(dialog, listNode), true);
  assert.equal(insideLayerAbove(list, dialogNode), false);
  closeList();
  assert.equal(isTopLayer(dialog), true);
  closeDialog();
  assert.equal(isTopLayer(dialog), false);
});

test('a backdrop click with a Select open in the dialog leaves the dialog open', () => {
  const backdrop = { name: 'backdrop' };
  const field = { name: 'field' };
  const dialog = { contains: () => false };
  const list = { contains: () => false };
  const closeDialog = openLayer(dialog);
  const closeList = openLayer(list);
  assert.equal(backdropCloses({ target: backdrop, currentTarget: backdrop }, dialog), false);
  // useDismiss closes the list on that press; the next one closes the dialog.
  closeList();
  assert.equal(backdropCloses({ target: backdrop, currentTarget: backdrop }, dialog), true);
  // A press inside the panel bubbles up to the backdrop but isn't on it.
  assert.equal(backdropCloses({ target: field, currentTarget: backdrop }, dialog), false);
  closeDialog();
  assert.equal(backdropCloses({ target: backdrop, currentTarget: backdrop }, null), false);
});

test('only scrolls that move the anchor close a panel', () => {
  const anchor = { name: 'trigger' };
  const page = { nodeType: 9 };
  const dialogBody = { nodeType: 1, contains: (node) => node === anchor };
  const textField = { nodeType: 1, contains: () => false };
  assert.equal(scrollMovesAnchor(page, anchor), true);
  assert.equal(scrollMovesAnchor(dialogBody, anchor), true);
  assert.equal(scrollMovesAnchor(textField, anchor), false);
  assert.equal(scrollMovesAnchor(anchor, anchor), false);
});

test('a panel goes above the highest overlay its anchor sits in', () => {
  const chain = (...zs) => zs.reduceRight((parentElement, z) => ({ z, parentElement }), null);
  const zOf = (node) => node.z;
  assert.equal(panelZIndex(chain(NaN, NaN, 200), zOf), PANEL_Z);
  assert.equal(panelZIndex(chain(NaN, 10, 9998, NaN), zOf), 9999);
  assert.equal(panelZIndex(null, zOf), PANEL_Z);
  assert.equal(floatingStyle({ left: 0, top: 0, zIndex: PANEL_Z }).zIndex, undefined);
  assert.equal(floatingStyle({ left: 0, top: 0, zIndex: 9999 }).zIndex, 9999);
});
