import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanReasoningAnswer, extractReasoningFromText, normalizeReasoningForDisplay } from './reasoningParser.js';

test('"The short answer:", "Food for thought:" and "Call to action:" stay in the answer', () => {
  const reply = 'Here is the overview of your question. The short answer: yes, it works fine. Food for thought: maybe later. Call to action: try it now.';
  const result = extractReasoningFromText(reply);
  assert.equal(result.thinking, null);
  assert.equal(result.answer, reply);
});

test('a label word inside a line is not a label', () => {
  assert.equal(extractReasoningFromText('Slow answer: word0 word1').answer, 'Slow answer: word0 word1');
  assert.equal(cleanReasoningAnswer('Call to action: try it now. Food for thought: later.'), 'Call to action: try it now. Food for thought: later.');
  assert.equal(normalizeReasoningForDisplay('Food for thought: the plan'), 'Food for thought: the plan');
});

test('a ReAct reply splits on labels that start a line', () => {
  const result = extractReasoningFromText('**Thought:** check the file\nAction: read it\n**Answer:** The short answer: yes.');
  assert.equal(result.thinking, 'check the file');
  assert.equal(result.answer, 'The short answer: yes.');
});

test('a ReAct reply still thinking shows no answer yet', () => {
  const result = extractReasoningFromText('Thought: still working it out');
  assert.equal(result.thinking, 'still working it out');
  assert.equal(result.answer, '');
});

test('a leading Answer: label and a bare trailing Action: are dropped', () => {
  assert.equal(cleanReasoningAnswer('Answer: 42'), '42');
  assert.equal(cleanReasoningAnswer('Let me look.\nAction:\n<tool_call>{"name":"x"}</tool_call>'), 'Let me look.');
});

test('reasoning labels at line starts are removed from the reasoning text', () => {
  assert.equal(normalizeReasoningForDisplay('Thought: first\nAction: read'), 'first\nread');
});
