import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVersions } from './validate-release.js';

const packages = {
  'package.json': '0.7.4',
  'den/package.json': '0.7.4',
  'neko/package.json': '0.7.4',
};

test('matching packages and tag pass release validation', () => {
  assert.equal(validateVersions(packages, 'v0.7.4'), '0.7.4');
});

test('package version drift fails release validation', () => {
  assert.throws(
    () => validateVersions({ ...packages, 'den/package.json': '0.7.3' }, 'v0.7.4'),
    /Package versions must match/,
  );
});

test('tag mismatch and malformed tags fail release validation', () => {
  assert.throws(() => validateVersions(packages, 'v0.7.5'), /does not match/);
  assert.throws(() => validateVersions(packages, 'release-0.7.4'), /strict SemVer/);
});
