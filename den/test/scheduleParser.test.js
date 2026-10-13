import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSchedule } from '../src/agent/scheduleMath.js';
import { findClockTime, parseScheduleText } from '../src/agent/scheduleParser.js';

// Tuesday 13 October 2026, 13:00 in London (BST).
const now = new Date('2026-10-13T12:00:00Z');
const parse = (text, timezone = 'Europe/London') => parseScheduleText(text, { now, timezone });

test('repeating schedules in plain English', () => {
  assert.deepEqual(parse('every weekday at 8am'), { kind: 'weekdays', time: '08:00' });
  assert.deepEqual(parse('Every weekday morning at 7:30'), { kind: 'weekdays', time: '07:30' });
  assert.deepEqual(parse('every Monday at 9'), { kind: 'weekly', time: '09:00', days: [1] });
  assert.deepEqual(parse('mondays and thursdays at 9:30'), { kind: 'weekly', time: '09:30', days: [1, 4] });
  assert.deepEqual(parse('every monday, wednesday and friday at 7pm'), { kind: 'weekly', time: '19:00', days: [1, 3, 5] });
  assert.deepEqual(parse('mon-fri 7:15'), { kind: 'weekdays', time: '07:15' });
  assert.deepEqual(parse('every weekend at 10'), { kind: 'weekly', time: '10:00', days: [0, 6] });
  assert.deepEqual(parse('weekly on tuesday at 14:00'), { kind: 'weekly', time: '14:00', days: [2] });
  assert.deepEqual(parse('daily 18:00'), { kind: 'daily', time: '18:00' });
  assert.deepEqual(parse('every day at 9 am'), { kind: 'daily', time: '09:00' });
  assert.deepEqual(parse('daily at noon'), { kind: 'daily', time: '12:00' });
  assert.deepEqual(parse('every morning'), { kind: 'daily', time: '08:00' });
  assert.deepEqual(parse('every weekday'), { kind: 'weekdays', time: '09:00' });
});

test('every few hours or minutes', () => {
  assert.deepEqual(parse('every 3 hours'), { kind: 'every_hours', interval: 3 });
  assert.deepEqual(parse('every hour'), { kind: 'every_hours', interval: 1 });
  assert.deepEqual(parse('hourly'), { kind: 'every_hours', interval: 1 });
  assert.deepEqual(parse('every 2h'), { kind: 'every_hours', interval: 2 });
  assert.deepEqual(parse('every 120 minutes'), { kind: 'every_hours', interval: 2 });
  assert.deepEqual(parse('every 30 minutes'), { kind: 'cron', cron: '*/30 * * * *' });
  assert.equal(parse('every 45 minutes'), null);
  // Parsed, but refused by the 15-minute minimum.
  assert.throws(() => normalizeSchedule(parse('every 10 minutes')), /15 minutes/);
});

test('one-off times', () => {
  assert.deepEqual(parse('tomorrow at 7am'), { kind: 'once', date: '2026-10-14', time: '07:00', at: '2026-10-14T06:00:00.000Z' });
  assert.deepEqual(parse('remind me tomorrow'), { kind: 'once', date: '2026-10-14', time: '09:00', at: '2026-10-14T08:00:00.000Z' });
  assert.deepEqual(parse('in 2 hours'), { kind: 'once', date: '2026-10-13', time: '15:00', at: '2026-10-13T14:00:00.000Z' });
  assert.deepEqual(parse('in 3 days at 8am'), { kind: 'once', date: '2026-10-16', time: '08:00', at: '2026-10-16T07:00:00.000Z' });
  assert.deepEqual(parse('at 5pm'), { kind: 'once', date: '2026-10-13', time: '17:00', at: '2026-10-13T16:00:00.000Z' });
  assert.deepEqual(parse('at 9am'), { kind: 'once', date: '2026-10-14', time: '09:00', at: '2026-10-14T08:00:00.000Z' }, 'a time already past today means tomorrow');
  assert.deepEqual(parse('next friday at 3pm'), { kind: 'once', date: '2026-10-16', time: '15:00', at: '2026-10-16T14:00:00.000Z' });
  assert.deepEqual(parse('on 2026-12-24 at 18:00'), { kind: 'once', date: '2026-12-24', time: '18:00', at: '2026-12-24T18:00:00.000Z' });
  assert.deepEqual(parse('2026-10-20T09:00:00Z'), { kind: 'once', date: '2026-10-20', time: '10:00', at: '2026-10-20T09:00:00.000Z' });
});

test('cron expressions pass through', () => {
  assert.deepEqual(parse('0 9 * * 1-5'), { kind: 'cron', cron: '0 9 * * 1-5' });
  assert.deepEqual(parse('cron: 30 18 * * MON'), { kind: 'cron', cron: '30 18 * * MON' });
  assert.deepEqual(parse('@daily'), { kind: 'cron', cron: '@daily' });
  assert.equal(parse('99 9 * * *'), null);
});

test('things that are not schedules', () => {
  assert.equal(parse(''), null);
  assert.equal(parse('every 2 days'), null);
  assert.equal(parse('whenever you like'), null);
});

test('the time zone anchors relative phrases', () => {
  const kolkata = parse('tomorrow at 7am', 'Asia/Kolkata');
  assert.equal(kolkata.at, '2026-10-14T01:30:00.000Z');
});

test('clock times are found among other numbers', () => {
  assert.equal(findClockTime('every 3 hours at 9:15'), '09:15');
  assert.equal(findClockTime('at 12am'), '00:00');
  assert.equal(findClockTime('at 12pm'), '12:00');
  assert.equal(findClockTime('midnight'), '00:00');
  assert.equal(findClockTime('in 20 minutes'), null);
});
