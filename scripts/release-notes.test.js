import test from 'node:test';
import assert from 'node:assert/strict';

import { buildReleaseNotes, parseSubject } from './release-notes.js';

test('strips conventional-commit prefixes', () => {
  assert.deepEqual(parseSubject('feat(neko): one chat box'), { type: 'feat', text: 'One chat box' });
  assert.deepEqual(parseSubject('fix: loading-screen cat'), { type: 'fix', text: 'Loading-screen cat' });
  assert.deepEqual(parseSubject('Update README'), { type: 'other', text: 'Update README' });
});

test('groups commits into sections with a changelog link', () => {
  const notes = buildReleaseNotes([
    'feat(agent): open Claude Code and Codex sessions',
    'fix(browser): agent can fill React forms',
    'docs: coding-agent sessions',
    'Merge branch x',
    'tweak spacing',
  ], { tag: 'v0.8.0-beta.7', previousTag: 'v0.8.0-beta.6' });
  assert.match(notes, /^## New\n\n- Open Claude Code and Codex sessions\n/);
  assert.match(notes, /## Fixes\n\n- Agent can fill React forms\n/);
  assert.match(notes, /## Other changes\n\n- Coding-agent sessions\n/);
  assert.match(notes, /## More\n\n- Tweak spacing\n/);
  assert.doesNotMatch(notes, /Merge branch/);
  assert.match(notes, /compare\/v0\.8\.0-beta\.6\.\.\.v0\.8\.0-beta\.7/);
});
