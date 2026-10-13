import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Most route modules start servers, schedulers or the agent when imported,
// so tests don't load them. This checks statically that every relative
// import in the backend points at a file that exists, which catches a
// mistyped path before the backend fails to start.

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const SPECIFIER = /(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(m?js)$/.test(entry.name) ? [full] : [];
  });
}

test('every relative import in den/src resolves to a file', () => {
  const missing = [];
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(SPECIFIER)) {
      const spec = (match[1] || match[2]).split('?')[0];
      if (!fs.existsSync(path.resolve(path.dirname(file), spec))) {
        missing.push(`${path.relative(SRC, file)} → ${spec}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
