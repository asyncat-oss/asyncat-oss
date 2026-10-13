import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXAMPLE_TASKS, describeSchedule, firstLine, formFromTask, formatDuration, formatRunTime, scheduleFromForm,
} from './scheduleForm.js';

test('the editor turns its values into schedules', () => {
  const form = formFromTask(null, { now: new Date(2026, 9, 13, 12) });
  assert.equal(form.kind, 'weekdays');
  assert.equal(form.date, '2026-10-14', 'a one-off defaults to tomorrow');
  assert.deepEqual(scheduleFromForm(form), { kind: 'weekdays', time: '08:00' });
  assert.deepEqual(scheduleFromForm({ ...form, kind: 'weekly', days: [4, 1], time: '09:30' }), { kind: 'weekly', time: '09:30', days: [1, 4] });
  assert.deepEqual(scheduleFromForm({ ...form, kind: 'once', time: '07:00' }), { kind: 'once', date: '2026-10-14', time: '07:00' });
  assert.deepEqual(scheduleFromForm({ ...form, kind: 'every_hours', interval: '3' }), { kind: 'every_hours', interval: 3 });
  assert.deepEqual(scheduleFromForm({ ...form, cron: ' 0 9 * * 1-5 ' }), { kind: 'cron', cron: '0 9 * * 1-5' }, 'a cron expression wins');
  assert.throws(() => scheduleFromForm({ ...form, kind: 'weekly', days: [] }), /at least one day/);
  assert.throws(() => scheduleFromForm({ ...form, kind: 'every_hours', interval: 0 }), /1 to 168/);
});

test('editing a task fills the editor from it', () => {
  const form = formFromTask({
    name: 'Report', prompt: 'Write it', schedule: { kind: 'cron', cron: '0 */4 * * *' }, timezone: 'Europe/Paris',
    projectId: 'p1', allowedTools: ['send_email'],
  });
  assert.equal(form.cron, '0 */4 * * *');
  assert.equal(form.timezone, 'Europe/Paris');
  assert.deepEqual(form.allowedTools, ['send_email']);
  const weekly = formFromTask({ schedule: { kind: 'weekly', time: '18:00', days: [0, 6] } });
  assert.deepEqual(weekly.days, [0, 6]);
  assert.equal(weekly.time, '18:00');
});

test('schedules read as words', () => {
  assert.equal(describeSchedule({ kind: 'weekdays', time: '08:00' }), 'Weekdays at 8:00');
  assert.equal(describeSchedule({ kind: 'weekly', time: '09:00', days: [1] }), 'Every Monday at 9:00');
  assert.equal(describeSchedule({ kind: 'weekly', time: '09:00', days: [0, 1, 4] }), 'Every Mon, Thu and Sun at 9:00');
  assert.equal(describeSchedule({ kind: 'every_hours', interval: 3 }), 'Every 3 hours');
  assert.equal(describeSchedule({ kind: 'once', date: '2026-10-14', time: '07:00' }), 'Once, 14 Oct 2026 at 7:00');
  for (const example of EXAMPLE_TASKS) assert.ok(describeSchedule(example.schedule).length > 0);
});

test('run times are short and friendly', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const zone = { now, timeZone: 'UTC' };
  assert.equal(formatRunTime('2026-10-13T18:00:00Z', zone), 'Today 18:00');
  assert.equal(formatRunTime('2026-10-14T08:00:00Z', zone), 'Tomorrow 8:00');
  assert.equal(formatRunTime('2026-10-12T08:00:00Z', zone), 'Yesterday 8:00');
  assert.equal(formatRunTime('2026-10-19T09:05:00Z', zone), 'Mon 19 Oct, 9:05');
  assert.equal(formatRunTime('2027-01-04T09:00:00Z', zone), '4 Jan 2027, 9:00');
  assert.equal(formatRunTime(null, zone), '');
  assert.equal(formatDuration('2026-10-13T12:00:00Z', '2026-10-13T12:00:42Z'), '42 s');
  assert.equal(formatDuration('2026-10-13T12:00:00Z', '2026-10-13T13:05:00Z'), '1 h 5 min');
});

test('the first line of an answer, cleaned up', () => {
  assert.equal(firstLine('<think>hmm</think>\n\n## **Price** today\nmore'), 'Price today');
  assert.equal(firstLine('- item one\n- item two'), 'item one');
  assert.equal(firstLine('x'.repeat(200), 20).length, 20);
});
