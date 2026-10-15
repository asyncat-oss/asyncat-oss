import test from "node:test";
import assert from "node:assert/strict";
import { wrapFocusIndex } from "./focusWrap.js";

test("wrapFocusIndex wraps Tab from the last item to the first", () => {
  assert.equal(wrapFocusIndex(3, 2), 0);
  assert.equal(wrapFocusIndex(1, 0), 0);
});

test("wrapFocusIndex wraps Shift+Tab from the first item to the last", () => {
  assert.equal(wrapFocusIndex(3, 0, true), 2);
  assert.equal(wrapFocusIndex(1, 0, true), 0);
});

test("wrapFocusIndex leaves moves between items to the browser", () => {
  assert.equal(wrapFocusIndex(3, 0), -1);
  assert.equal(wrapFocusIndex(3, 1), -1);
  assert.equal(wrapFocusIndex(3, 2, true), -1);
});

test("wrapFocusIndex brings focus back in from outside", () => {
  assert.equal(wrapFocusIndex(3, -1), 0);
  assert.equal(wrapFocusIndex(3, -1, true), 2);
});

test("wrapFocusIndex does nothing with nothing to focus", () => {
  assert.equal(wrapFocusIndex(0, -1), -1);
  assert.equal(wrapFocusIndex(0, -1, true), -1);
});
