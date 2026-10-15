import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineTokens, parseMarkdownBlocks } from './markdownBlocks.js';

test('blocks: headings, numbered and bulleted items, and joined paragraphs', () => {
  const text = [
    '---',
    'name: plan-a-bed',
    '---',
    '# Steps',
    'Measure the bed',
    'before buying seed.',
    '',
    '1. Ask how much sun it gets.',
    '- Keep tall plants to the north.',
    '* Leave paths.',
    '### Notes',
  ].join('\n');
  assert.deepEqual(parseMarkdownBlocks(text), [
    { type: 'heading', depth: 1, text: 'Steps' },
    { type: 'paragraph', text: 'Measure the bed before buying seed.' },
    { type: 'numbered', number: '1', text: 'Ask how much sun it gets.' },
    { type: 'bullet', text: 'Keep tall plants to the north.' },
    { type: 'bullet', text: 'Leave paths.' },
    { type: 'heading', depth: 3, text: 'Notes' },
  ]);
});

test('blocks: nothing for empty or missing text, and Windows line ends work', () => {
  assert.deepEqual(parseMarkdownBlocks(''), []);
  assert.deepEqual(parseMarkdownBlocks('   \n '), []);
  assert.deepEqual(parseMarkdownBlocks(undefined), []);
  assert.deepEqual(parseMarkdownBlocks('one\r\ntwo\r\n\r\nthree'), [
    { type: 'paragraph', text: 'one two' },
    { type: 'paragraph', text: 'three' },
  ]);
});

test('inline: code and bold between plain text', () => {
  assert.deepEqual(inlineTokens('Run `ls -la` **first**, then look.'), [
    { type: 'text', text: 'Run ' },
    { type: 'code', text: 'ls -la' },
    { type: 'text', text: ' ' },
    { type: 'strong', text: 'first' },
    { type: 'text', text: ', then look.' },
  ]);
  assert.deepEqual(inlineTokens('plain'), [{ type: 'text', text: 'plain' }]);
  assert.deepEqual(inlineTokens(''), []);
  assert.deepEqual(inlineTokens('an `unclosed tick'), [{ type: 'text', text: 'an `unclosed tick' }]);
});
