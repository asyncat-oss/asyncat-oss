import test from 'node:test';
import assert from 'node:assert/strict';
import { formAnswer, formHasAnswer } from './askForm.js';

test('a filled-in question form answers in "Label: value" lines', () => {
  const fields = [{ id: 'f0', label: 'Balcony size' }, { id: 'f1', label: 'Sun' }, { id: 'f2', label: 'Budget' }];
  assert.equal(formAnswer(fields, { f0: ' 2 × 1 m ', f1: 'Afternoon' }), 'Balcony size: 2 × 1 m\nSun: Afternoon\nBudget: (no answer)');
  assert.equal(formHasAnswer(fields, { f2: '  ' }), false);
  assert.equal(formHasAnswer(fields, { f2: '40' }), true);
});
