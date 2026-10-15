import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanReasoningAnswer, extractReasoningFromText, reasoningTextFromDelta } from '../src/agent/reasoningParser.js';

const cases = [
  {
    name: 'closed think tag',
    input: '<think>reason</think>answer',
    thinking: 'reason',
    answer: 'answer',
  },
  {
    name: 'incomplete think tag',
    input: '<think>reason so far',
    thinking: 'reason so far',
    answer: '',
  },
  {
    name: 'markdown thought and answer',
    input: '**Thought:** reason\n**Answer:** answer',
    thinking: 'reason',
    answer: 'answer',
  },
  {
    name: 'gemma channel thought',
    input: '<|channel>thought\nreason<channel|>answer',
    thinking: 'reason',
    answer: 'answer',
  },
  {
    name: 'tool call stripped from answer',
    input: '<think>reason</think><tool_call>{"name":"x","arguments":{}}</tool_call>answer',
    thinking: 'reason',
    answer: 'answer',
  },
];

for (const item of cases) {
  test(`extracts reasoning: ${item.name}`, () => {
    const result = extractReasoningFromText(item.input);
    assert.equal(result.thinking, item.thinking);
    assert.equal(result.answer, item.answer);
  });
}

test('reads one OpenAI-compatible reasoning delta field', () => {
  // Providers repeat the same text across fields, so joining them doubles it.
  assert.equal(
    reasoningTextFromDelta({
      reasoning: 'a',
      reasoning_content: 'a',
      reasoning_details: [{ text: 'a' }],
    }),
    'a',
  );
  assert.equal(reasoningTextFromDelta({ reasoning_details: [{ text: 'c' }, { content: 'd' }] }), 'cd');
});

test('words like answer, thought and action inside a sentence are not labels', () => {
  const reply = 'Here is the overview of your question. The short answer: yes, it works fine. Food for thought: maybe later. Call to action: try it now.';
  const result = extractReasoningFromText(reply);
  assert.equal(result.thinking, null);
  assert.equal(result.answer, reply);
  assert.equal(extractReasoningFromText('Slow answer: word0 word1').answer, 'Slow answer: word0 word1');
  assert.equal(cleanReasoningAnswer('Call to action: try it now.'), 'Call to action: try it now.');
});

test('a ReAct reply still splits on labels at the start of a line', () => {
  const result = extractReasoningFromText('Thought: check the file\nAction: read it\nAnswer: The short answer: yes.');
  assert.equal(result.thinking, 'check the file');
  assert.equal(result.answer, 'The short answer: yes.');
});
