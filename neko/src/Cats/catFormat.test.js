import test from 'node:test';
import assert from 'node:assert/strict';
import { catStatus, defaultTrigger, groupTimeline, lastRunLine, nextWakeText, triggerText, wakeSummary } from './catFormat.js';

test('triggers read in plain words', () => {
  assert.equal(triggerText(defaultTrigger('schedule')), 'Weekdays at 8:00');
  assert.equal(triggerText({ kind: 'email', config: { from: 'club', subject: '' } }), 'New email from “club”');
  assert.equal(triggerText({ kind: 'rss', config: { url: 'https://blog.example.com/feed' } }), 'New post on blog.example.com');
  assert.equal(triggerText({ kind: 'webpage', config: { url: 'https://shop.example.com/x', contains: 'in stock' } }), 'shop.example.com mentions “in stock”');
  assert.equal(triggerText({ kind: 'folder', config: { path: '/home/me/Downloads' } }), 'Files change in Downloads');
  assert.equal(triggerText({ kind: 'schedule', text: 'Daily at 7:30' }), 'Daily at 7:30', 'saved words win');
});

test('a Cat says what wakes it, and when next', () => {
  const cat = {
    enabled: true,
    nextWakeAt: null,
    triggers: [{ kind: 'chat' }, { kind: 'rss', enabled: true, text: 'New post on blog.example.com' }],
  };
  assert.equal(wakeSummary(cat), 'New post on blog.example.com');
  assert.equal(wakeSummary({ triggers: [{ kind: 'chat' }] }), 'Only when you write to it');
  assert.equal(nextWakeText(cat), 'Watching');
  assert.equal(nextWakeText({ ...cat, enabled: false }), '');
});

test('the state pill puts waiting for you first', () => {
  assert.equal(catStatus({ state: 'waiting', running: true, enabled: true }).label, 'Waiting for you');
  assert.equal(catStatus({ running: true, enabled: true }).label, 'Working…');
  assert.equal(catStatus({ enabled: false }).label, 'Paused');
  assert.equal(catStatus({ enabled: true, limitReached: 'x' }).label, 'Done for today');
  assert.equal(catStatus({ enabled: true }).label, 'On');
});

test('the timeline is grouped by run, steps in order', () => {
  const groups = groupTimeline([
    { id: '4', runId: 'b', title: 'finished' },
    { id: '3', runId: 'b', title: 'woke' },
    { id: '2', runId: null, title: 'watching' },
    { id: '1', runId: 'a', title: 'woke' },
  ]);
  assert.deepEqual(groups.map((group) => group.key), ['b', 'event:2', 'a']);
  assert.deepEqual(groups[0].events.map((event) => event.title), ['woke', 'finished']);
  assert.equal(lastRunLine({ status: 'succeeded', answer: '## Report\n\nAll good' }), 'Report');
  assert.equal(lastRunLine({ status: 'waiting' }), 'Waiting for your answer');
});
