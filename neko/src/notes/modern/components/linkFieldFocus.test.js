import test from 'node:test';
import assert from 'node:assert/strict';

import { initialLinkFieldState, shouldFocusLinkField } from './linkFieldFocus.js';

// The focus decisions over a run of `editing` values, as the hook makes them.
function run(active, values) {
  let was = initialLinkFieldState(values[0], active);
  return values.map((editing) => {
    const focus = shouldFocusLinkField(was, editing);
    was = editing;
    return focus;
  });
}

test('an empty block in a note being opened leaves focus alone', () => {
  assert.deepEqual(run(false, [true]), [false]);
  // React may run the effect twice on mount; still no focus.
  assert.deepEqual(run(false, [true, true]), [false, false]);
});

test('an empty block someone just added takes focus once', () => {
  assert.deepEqual(run(true, [true, true]), [true, false]);
});

test('pressing Edit on a filled block focuses the field', () => {
  assert.deepEqual(run(false, [false, true]), [false, true]);
  assert.deepEqual(run(false, [true, false, true]), [false, false, true]);
});
