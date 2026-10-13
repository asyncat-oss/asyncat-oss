import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATCH_UP_WINDOW_MS, ScheduleError, computeNextRun, cronMinimumGapMinutes, describeSchedule,
  normalizeSchedule, parseCron, planDueRun, simplifyCron, wallClockToUtc,
} from '../src/agent/scheduleMath.js';

const at = (iso) => new Date(iso);
const next = (schedule, after, timezone) => computeNextRun(schedule, at(after), timezone)?.toISOString() ?? null;
const HOUR = 3_600_000;

test('daily runs at the wall-clock time in the task time zone', () => {
  assert.equal(next({ kind: 'daily', time: '08:00' }, '2026-10-13T05:00:00Z', 'Asia/Kolkata'), '2026-10-14T02:30:00.000Z');
  assert.equal(next({ kind: 'daily', time: '08:00' }, '2026-10-13T01:00:00Z', 'Asia/Kolkata'), '2026-10-13T02:30:00.000Z');
  assert.equal(next({ kind: 'daily', time: '18:00' }, '2026-10-13T12:00:00Z', 'UTC'), '2026-10-13T18:00:00.000Z');
});

test('a time skipped by the spring clock change runs just after the gap, then normally', () => {
  // New York: 2026-03-08 02:00 EST jumps to 03:00 EDT, so 02:30 doesn't exist.
  assert.equal(next({ kind: 'daily', time: '02:30' }, '2026-03-07T17:00:00Z', 'America/New_York'), '2026-03-08T07:30:00.000Z');
  assert.equal(next({ kind: 'daily', time: '02:30' }, '2026-03-08T07:30:00Z', 'America/New_York'), '2026-03-09T06:30:00.000Z');
  // London: 2026-03-29 01:00 GMT jumps to 02:00 BST.
  assert.equal(next({ kind: 'daily', time: '01:30' }, '2026-03-28T12:00:00Z', 'Europe/London'), '2026-03-29T01:30:00.000Z');
  // An ordinary time keeps its local hour across the change.
  assert.equal(next({ kind: 'daily', time: '09:00' }, '2026-03-28T12:00:00Z', 'Europe/London'), '2026-03-29T08:00:00.000Z');
});

test('a time that happens twice in autumn runs once, at the first of the two', () => {
  // New York: 2026-11-01 02:00 EDT falls back to 01:00 EST, so 01:30 happens twice.
  assert.equal(next({ kind: 'daily', time: '01:30' }, '2026-10-31T17:00:00Z', 'America/New_York'), '2026-11-01T05:30:00.000Z');
  assert.equal(next({ kind: 'daily', time: '01:30' }, '2026-11-01T05:30:00Z', 'America/New_York'), '2026-11-02T06:30:00.000Z');
  assert.equal(wallClockToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York').toISOString(), '2026-11-01T05:30:00.000Z');
});

test('weekdays skip the weekend and weekly runs on the chosen days', () => {
  // Friday 16 Oct 2026, 13:00 UTC → Monday 08:00.
  assert.equal(next({ kind: 'weekdays', time: '08:00' }, '2026-10-16T13:00:00Z', 'UTC'), '2026-10-19T08:00:00.000Z');
  assert.equal(next({ kind: 'weekdays', time: '08:00' }, '2026-10-14T07:00:00Z', 'UTC'), '2026-10-14T08:00:00.000Z');
  // Monday and Thursday at 9:30 from Tuesday.
  assert.equal(next({ kind: 'weekly', time: '09:30', days: [1, 4] }, '2026-10-13T12:00:00Z', 'UTC'), '2026-10-15T09:30:00.000Z');
  assert.equal(next({ kind: 'weekly', time: '09:30', days: [1, 4] }, '2026-10-15T09:30:00Z', 'UTC'), '2026-10-19T09:30:00.000Z');
  // Sunday given as 7 is Sunday.
  assert.equal(next({ kind: 'weekly', time: '10:00', days: [7] }, '2026-10-13T12:00:00Z', 'UTC'), '2026-10-18T10:00:00.000Z');
});

test('every N hours keeps its rhythm from the anchor, even after a long gap', () => {
  const schedule = { kind: 'every_hours', interval: 3, anchor: '2026-10-13T09:00:00.000Z' };
  assert.equal(next(schedule, '2026-10-13T09:00:00Z'), '2026-10-13T12:00:00.000Z');
  assert.equal(next(schedule, '2026-10-13T10:15:00Z'), '2026-10-13T12:00:00.000Z');
  assert.equal(next(schedule, '2026-10-20T13:00:00Z'), '2026-10-20T15:00:00.000Z');
});

test('cron is evaluated in the task time zone', () => {
  assert.equal(next({ kind: 'cron', cron: '0 9 * * 1-5' }, '2026-10-16T13:00:00Z', 'Asia/Kolkata'), '2026-10-19T03:30:00.000Z');
  assert.equal(next({ kind: 'cron', cron: '*/30 * * * *' }, '2026-10-13T10:10:00Z', 'UTC'), '2026-10-13T10:30:00.000Z');
  assert.equal(next({ kind: 'cron', cron: '0 0 1 * *' }, '2026-10-13T10:10:00Z', 'UTC'), '2026-11-01T00:00:00.000Z');
  assert.equal(next({ kind: 'cron', cron: '@weekly' }, '2026-10-13T10:10:00Z', 'UTC'), '2026-10-18T00:00:00.000Z');
  // Day-of-month and day-of-week both set: either matches (classic cron).
  assert.equal(next({ kind: 'cron', cron: '0 12 15 * MON' }, '2026-10-13T13:00:00Z', 'UTC'), '2026-10-15T12:00:00.000Z');
});

test('schedules can repeat at most every 15 minutes', () => {
  assert.equal(cronMinimumGapMinutes(parseCron('*/15 * * * *')), 15);
  assert.equal(cronMinimumGapMinutes(parseCron('0 9 * * *')), 24 * 60);
  assert.throws(() => normalizeSchedule({ kind: 'cron', cron: '*/5 * * * *' }), ScheduleError);
  assert.throws(() => normalizeSchedule({ kind: 'cron', cron: '0,10 * * * *' }), /15 minutes/);
  assert.throws(() => normalizeSchedule({ kind: 'every_hours', interval: 0 }), ScheduleError);
  assert.throws(() => normalizeSchedule({ kind: 'cron', cron: '0 9 * *' }), /five fields/);
  assert.throws(() => normalizeSchedule({ kind: 'cron', cron: '61 9 * * *' }), ScheduleError);
});

test('normalising fills in what the clock needs and rejects bad input', () => {
  const now = at('2026-10-13T12:00:00Z');
  assert.deepEqual(normalizeSchedule({ kind: 'daily', time: '8:05' }), { kind: 'daily', time: '08:05' });
  assert.deepEqual(normalizeSchedule({ kind: 'weekly', time: '9', days: [4, 1, 1] }), { kind: 'weekly', time: '09:00', days: [1, 4] });
  assert.equal(normalizeSchedule({ kind: 'every_hours', interval: 2 }, { now }).anchor, '2026-10-13T12:00:00.000Z');
  const once = normalizeSchedule({ kind: 'once', date: '2026-10-14', time: '07:00' }, { now, timezone: 'Europe/Paris' });
  assert.equal(once.at, '2026-10-14T05:00:00.000Z');
  assert.throws(() => normalizeSchedule({ kind: 'once', date: '2026-10-12', time: '07:00' }, { now, requireFuture: true }), /already passed/);
  assert.throws(() => normalizeSchedule({ kind: 'weekly', time: '09:00', days: [] }), /day of the week/);
  assert.throws(() => normalizeSchedule({ kind: 'daily', time: '25:00' }), /time of day/);
  assert.throws(() => normalizeSchedule({ kind: 'sometimes' }), ScheduleError);
});

test('a one-off runs once and then has no next run', () => {
  const schedule = { kind: 'once', at: '2026-10-14T07:00:00.000Z' };
  assert.equal(next(schedule, '2026-10-13T12:00:00Z'), '2026-10-14T07:00:00.000Z');
  assert.equal(next(schedule, '2026-10-14T07:00:00Z'), null);
});

test('a run on time, or missed by less than 12 hours, runs once', () => {
  const daily = { kind: 'daily', time: '08:00' };
  const onTime = planDueRun({ schedule: daily, timezone: 'UTC', nextRunAt: '2026-10-13T08:00:00.000Z', now: at('2026-10-13T08:00:20Z') });
  assert.equal(onTime.action, 'run');
  assert.equal(onTime.late, false);
  assert.equal(onTime.next.toISOString(), '2026-10-14T08:00:00.000Z');

  // Asleep from 07:00 to 14:00: the 08:00 run happens once at 14:00.
  const late = planDueRun({ schedule: daily, timezone: 'UTC', nextRunAt: '2026-10-13T08:00:00.000Z', now: at('2026-10-13T14:00:00Z') });
  assert.equal(late.action, 'run');
  assert.equal(late.late, true);
  assert.equal(late.next.toISOString(), '2026-10-14T08:00:00.000Z');
});

test('a run missed by more than 12 hours is skipped and the next one comes from now', () => {
  const daily = { kind: 'daily', time: '08:00' };
  const plan = planDueRun({ schedule: daily, timezone: 'UTC', nextRunAt: '2026-10-13T08:00:00.000Z', now: at('2026-10-13T21:00:00Z') });
  assert.equal(plan.action, 'skip');
  assert.equal(plan.next.toISOString(), '2026-10-14T08:00:00.000Z');

  const once = planDueRun({ schedule: { kind: 'once', at: '2026-10-13T08:00:00.000Z' }, nextRunAt: '2026-10-13T08:00:00.000Z', now: at('2026-10-14T08:00:00Z') });
  assert.equal(once.action, 'skip');
  assert.equal(once.next, null);
});

test('after a long sleep an hourly task runs once, not once per missed hour', () => {
  const hourly = { kind: 'every_hours', interval: 1, anchor: '2026-10-10T00:00:00.000Z' };
  const now = at('2026-10-13T10:30:00Z');
  const plan = planDueRun({ schedule: hourly, nextRunAt: '2026-10-11T01:00:00.000Z', now });
  assert.equal(plan.action, 'run');
  assert.equal(plan.next.toISOString(), '2026-10-13T11:00:00.000Z');
  assert.ok(now.getTime() - plan.scheduledFor.getTime() <= CATCH_UP_WINDOW_MS);
});

test('nothing is due before its time', () => {
  assert.deepEqual(planDueRun({ schedule: { kind: 'daily', time: '08:00' }, nextRunAt: '2026-10-13T08:00:00Z', now: at('2026-10-13T07:59:00Z') }), { action: 'wait' });
  assert.deepEqual(planDueRun({ schedule: { kind: 'daily', time: '08:00' }, nextRunAt: null, now: at('2026-10-13T07:59:00Z') }), { action: 'wait' });
});

test('resuming works out the next run from now', () => {
  // Paused on Monday, resumed on Thursday afternoon: next is Friday morning,
  // not the runs missed in between.
  assert.equal(next({ kind: 'weekdays', time: '08:00' }, '2026-10-15T15:00:00Z', 'UTC'), '2026-10-16T08:00:00.000Z');
});

test('schedules are described in words', () => {
  assert.equal(describeSchedule({ kind: 'weekdays', time: '08:00' }), 'Weekdays at 8:00');
  assert.equal(describeSchedule({ kind: 'daily', time: '18:00' }), 'Daily at 18:00');
  assert.equal(describeSchedule({ kind: 'weekly', time: '09:00', days: [1] }), 'Every Monday at 9:00');
  assert.equal(describeSchedule({ kind: 'weekly', time: '09:30', days: [1, 4] }), 'Every Mon and Thu at 9:30');
  assert.equal(describeSchedule({ kind: 'weekly', time: '10:00', days: [0, 6] }), 'Weekends at 10:00');
  assert.equal(describeSchedule({ kind: 'every_hours', interval: 1 }), 'Every hour');
  assert.equal(describeSchedule({ kind: 'every_hours', interval: 3 }), 'Every 3 hours');
  assert.equal(describeSchedule({ kind: 'once', date: '2026-10-14', time: '07:00' }), 'Once, 14 Oct 2026 at 7:00');
  assert.equal(describeSchedule({ kind: 'cron', cron: '0 9 1 * *' }), 'Cron: 0 9 1 * *');
});

test('simple cron expressions become friendlier schedules', () => {
  assert.deepEqual(simplifyCron('0 9 * * *'), { kind: 'daily', time: '09:00' });
  assert.deepEqual(simplifyCron('30 7 * * 1-5'), { kind: 'weekdays', time: '07:30' });
  assert.deepEqual(simplifyCron('0 9 * * 1'), { kind: 'weekly', time: '09:00', days: [1] });
  assert.deepEqual(simplifyCron('0 */3 * * *'), { kind: 'cron', cron: '0 */3 * * *' });
  assert.equal(simplifyCron('not cron'), null);
});

test('wall-clock conversion handles zones with odd offsets', () => {
  assert.equal(wallClockToUtc({ year: 2026, month: 1, day: 1, hour: 0, minute: 0 }, 'Asia/Kathmandu').toISOString(), '2025-12-31T18:15:00.000Z');
  assert.equal(wallClockToUtc({ year: 2026, month: 6, day: 1, hour: 12, minute: 0 }, 'UTC').getTime(), Date.UTC(2026, 5, 1, 12));
  assert.ok(HOUR > 0);
});
