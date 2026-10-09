import test from 'node:test';
import assert from 'node:assert/strict';

import { createStreamTextAccumulator, reasoningTextFromDelta } from '../src/agent/reasoningParser.js';

function run(chunks) {
  const acc = createStreamTextAccumulator();
  let shown = '';
  for (const chunk of chunks) shown += acc.push(chunk);
  shown += acc.flush();
  return { text: acc.text(), shown };
}

test('repeated characters across chunk boundaries are kept', () => {
  for (const [chunks, expected] of [
    [['Swap', 'ped the ratio'], 'Swapped the ratio'],
    [['Revenue was 10', '0 million'], 'Revenue was 100 million'],
    [['First paragraph.\n', '\nSecond.'], 'First paragraph.\n\nSecond.'],
    [['console.log(foo(', ')', ')'], 'console.log(foo())'],
    [['**5/9*', '* instead'], '**5/9** instead'],
    [['ha', 'ha'], 'haha'],
  ]) {
    const { text, shown } = run(chunks);
    assert.equal(text, expected);
    assert.equal(shown, expected, 'the streamed text matches the final text');
  }
});

test('a short ambiguous stream is read as ordinary chunks', () => {
  assert.equal(run(['1', '10']).text, '110');
  assert.equal(run(['Done.']).text, 'Done.');
});

test('providers that resend the whole text so far are not doubled', () => {
  const { text, shown } = run(['Hel', 'Hello', 'Hello wor', 'Hello world', 'Hello world', 'Hello world!']);
  assert.equal(text, 'Hello world!');
  assert.equal(shown, 'Hello world!');
});

test('reasoning repeated in several delta fields is used once', () => {
  assert.equal(reasoningTextFromDelta({
    reasoning: 'Check the tests.',
    reasoning_details: [{ type: 'reasoning.text', text: 'Check the tests.' }],
  }), 'Check the tests.');
  assert.equal(reasoningTextFromDelta({ reasoning_content: 'step' }), 'step');
  assert.equal(reasoningTextFromDelta({
    reasoning_details: [{ type: 'reasoning.text', text: 'a' }, { type: 'reasoning.text', text: 'b' }],
  }), 'ab');
  assert.equal(reasoningTextFromDelta({ content: 'answer only' }), '');
});
