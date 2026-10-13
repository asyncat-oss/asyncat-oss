import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFromTag, buildsBehind, buildsNewerText, profileForCapability } from './engineVersions.js';

test('a newer llama.cpp build is an update only when it really is newer', () => {
  assert.equal(buildFromTag('b6123'), 6123);
  assert.equal(buildFromTag(6123), 6123);
  assert.equal(buildFromTag('latest'), null);
  assert.equal(buildsBehind('b6123', 'b6163'), 40);
  assert.equal(buildsBehind('b6163', 'b6163'), 0);
  assert.equal(buildsBehind('b6200', 'b6163'), 0, 'an installed build newer than the list is not behind');
  assert.equal(buildsBehind(null, 'b6163'), 0);
  assert.equal(buildsBehind('latest', 'b6163'), 0);
  assert.equal(buildsNewerText(1), '1 build newer');
  assert.equal(buildsNewerText(40), '40 builds newer');
  assert.equal(profileForCapability('nvidia'), 'nvidia_gpu');
  assert.equal(profileForCapability('unknown'), 'cpu_safe');
});
