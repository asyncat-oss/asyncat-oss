import test from 'node:test';
import assert from 'node:assert/strict';

import { extractLocalhostUrl } from './localhostUrl.js';

test('finds dev servers announced in command output', () => {
  const cases = [
    ['  ➜  Local:   http://localhost:5173/', 'http://localhost:5173/'],
    ['Running on http://127.0.0.1:5000', 'http://127.0.0.1:5000'],
    ['Server listening on port 3000', 'http://localhost:3000'],
    ['PORT=4000 node server.js', 'http://localhost:4000'],
    ['listening on :8080', 'http://localhost:8080'],
    ['Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...', 'http://localhost:8000'],
    ['ready on [::]:3001', 'http://localhost:3001'],
  ];
  for (const [output, expected] of cases) assert.equal(extractLocalhostUrl(output), expected, output);
});

test('ignores numbers that are not server addresses', () => {
  for (const output of [
    'at Test.run (node:internal/test_runner/test:1047:25)',
    'TypeError: x is not a function\n    at main (/app/src/index.js:1203:7)',
    'running 1200 tests',
    'available 2048 MB',
    'finished at 12:30:45',
    '# pass 4\n# fail 0',
    '',
  ]) {
    assert.equal(extractLocalhostUrl(output), null, output);
  }
});
