import assert from 'node:assert/strict';
import { extractReasoningFromText, reasoningTextFromDelta } from '../src/agent/reasoningParser.js';

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
  const result = extractReasoningFromText(item.input);
  assert.equal(result.thinking, item.thinking, `${item.name}: thinking`);
  assert.equal(result.answer, item.answer, `${item.name}: answer`);
}

assert.equal(
  reasoningTextFromDelta({
    reasoning: 'a',
    reasoning_content: 'b',
    reasoning_details: [{ text: 'c' }, { content: 'd' }],
  }),
  'abcd',
  'OpenAI-compatible reasoning delta fields',
);

console.log('reasoning parser smoke passed');
