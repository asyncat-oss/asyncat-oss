import test from "node:test";
import assert from "node:assert/strict";
import { ensureNoteRangeStyle, rangeFill } from "./mediaRange.js";

test("rangeFill fills with the accent up to the value and the rest after it", () => {
  assert.equal(
    rangeFill(40, "var(--as-line-strong)"),
    "linear-gradient(to right, var(--as-accent) 0%, var(--as-accent) 40%, var(--as-line-strong) 40%, var(--as-line-strong) 100%)",
  );
});

test("rangeFill keeps the value between 0 and 100", () => {
  assert.match(rangeFill(-5, "x"), /accent\) 0%, x 0%/);
  assert.match(rangeFill(250, "x"), /accent\) 100%, x 100%/);
  assert.match(rangeFill(Number.NaN, "x"), /accent\) 0%, x 0%/);
});

test("ensureNoteRangeStyle adds its style once", () => {
  const added = [];
  const doc = {
    getElementById: (id) => added.find((node) => node.id === id) || null,
    createElement: () => ({}),
    head: { appendChild: (node) => added.push(node) },
  };
  ensureNoteRangeStyle(doc);
  ensureNoteRangeStyle(doc);
  assert.equal(added.length, 1);
  assert.match(added[0].textContent, /input\[type="range"\]\.note-range/);
});
