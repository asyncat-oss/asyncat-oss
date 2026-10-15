import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTRUCTIONS_LIMIT, PREFERENCE_LIMIT, cleanPreference, countLabel, instructionsStatus, nearLimit, preferencesChanged,
} from './personalizationText.js';

test('the count under a field reads like "120 / 1,500"', () => {
  assert.equal(countLabel(120, PREFERENCE_LIMIT), '120 / 1,500');
  assert.equal(countLabel(0, PREFERENCE_LIMIT), '0 / 1,500');
  assert.equal(countLabel(19999, INSTRUCTIONS_LIMIT), '19,999 / 20,000');
});

test('the count is flagged from 90% of the limit', () => {
  assert.equal(nearLimit(1349, 1500), false);
  assert.equal(nearLimit(1350, 1500), true);
  assert.equal(nearLimit(1500, 1500), true);
  assert.equal(nearLimit(5, 0), false);
});

test('a field counts as changed only when saving would change it', () => {
  const saved = { about: 'I keep bees.', answerStyle: '' };
  assert.equal(preferencesChanged(saved, { about: 'I keep bees.', answerStyle: '' }), false);
  assert.equal(preferencesChanged(saved, { about: '  I keep bees.\n', answerStyle: '  ' }), false, 'whitespace den trims');
  assert.equal(preferencesChanged(saved, { about: 'I keep bees.\r\nAnd hens.', answerStyle: '' }), true);
  assert.equal(preferencesChanged(saved, { about: 'I keep bees.', answerStyle: 'Short answers.' }), true);
  assert.equal(preferencesChanged({}, {}), false);
  assert.equal(cleanPreference('a\r\nb\rc '), 'a\nb\nc');
});

test('the instructions file row says whether it was edited', () => {
  assert.equal(instructionsStatus({ edited: true }), 'Edited');
  assert.equal(instructionsStatus({ edited: false }), 'Default');
  assert.equal(instructionsStatus(null), '');
});
