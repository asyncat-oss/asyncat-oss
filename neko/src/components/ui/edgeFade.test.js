import test from 'node:test';
import assert from 'node:assert/strict';

import { edgeFades } from './edgeFade.js';

test('a scrolling row fades only at an edge with more beyond it', () => {
  assert.deepEqual(edgeFades({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 }), { left: 0, right: 0 }, 'fits: no fade');
  assert.deepEqual(edgeFades({ scrollLeft: 0, scrollWidth: 500, clientWidth: 300 }), { left: 0, right: 24 });
  assert.deepEqual(edgeFades({ scrollLeft: 100, scrollWidth: 500, clientWidth: 300 }), { left: 24, right: 24 });
  assert.deepEqual(edgeFades({ scrollLeft: 200, scrollWidth: 500, clientWidth: 300 }), { left: 24, right: 0 });
});
