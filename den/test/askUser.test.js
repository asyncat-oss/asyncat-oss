import test from 'node:test';
import assert from 'node:assert/strict';

// ask_user can bring a small form: labelled fields the chat shows as
// inputs, answered as "Label: value" lines.

const { askUserTool, normalizeFields } = await import('../src/agent/tools/askUserTool.js');

test('a question form keeps up to six sensible fields', () => {
  const fields = normalizeFields([
    { label: 'Balcony size', placeholder: 'e.g. 2 x 1 m' },
    { label: 'Sun', choices: ['Morning', 'Afternoon'] },
    { label: 'Budget', kind: 'number' },
    { label: 'Pick one', kind: 'choice' },
    { kind: 'text' },
    { label: 'Notes', kind: 'long_text' },
    { label: 'Seven' }, { label: 'Eight' },
  ]);
  assert.deepEqual(fields.map((f) => [f.label, f.kind]), [
    ['Balcony size', 'text'], ['Sun', 'choice'], ['Budget', 'number'], ['Notes', 'long_text'],
  ], 'a choice without choices and a field without a label are left out; six at most were read');
  assert.equal(fields[0].placeholder, 'e.g. 2 x 1 m');
  assert.deepEqual(normalizeFields('nope'), []);
});

test('ask_user passes the form along and returns the answer', async () => {
  let asked = null;
  const result = await askUserTool.execute(
    { question: 'Tell me about your balcony', fields: [{ label: 'Size' }] },
    { askUser: async (request) => { asked = request; return { success: true, answer: 'Size: 2 x 1 m' }; } },
  );
  assert.equal(result.answer, 'Size: 2 x 1 m');
  assert.equal(asked.fields[0].label, 'Size');
  assert.deepEqual(asked.choices, []);
});
