import test from 'node:test';
import assert from 'node:assert/strict';

import { computeNextRun } from '../src/agent/scheduleMath.js';
import { scheduleFromLegacyJob, taskFromLegacyJob } from '../src/agent/scheduledTaskMigration.js';

const now = new Date('2026-10-13T12:00:00Z');
const job = (fields) => ({
  id: 'j1', user_id: 'u1', workspace_id: 'w1', name: 'Job', goal: 'Do it', timezone: 'UTC',
  enabled: 1, run_count: 0, working_dir: '.', next_run_at: '2026-10-13T15:00:00.000Z', ...fields,
});
test('old schedule strings map to the new kinds', () => {
  assert.deepEqual(scheduleFromLegacyJob(job({ schedule: 'daily:07:30' }), { now }), { kind: 'daily', time: '07:30' });
  assert.deepEqual(scheduleFromLegacyJob(job({ schedule: 'hourly' }), { now }), { kind: 'cron', cron: '0 * * * *' });
  // "Once a day" was a drifting 24-hour timer: it becomes daily at its last time of day.
  assert.deepEqual(scheduleFromLegacyJob(job({ schedule: 'interval:86400000' }), { now }), { kind: 'daily', time: '15:00' });
  assert.deepEqual(scheduleFromLegacyJob(job({ schedule: 'interval:1800000' }), { now }), { kind: 'cron', cron: '*/30 * * * *' });
  // Below the 15-minute minimum it is slowed down to it.
  assert.deepEqual(scheduleFromLegacyJob(job({ schedule: 'interval:60000' }), { now }), { kind: 'cron', cron: '*/15 * * * *' });
  assert.deepEqual(scheduleFromLegacyJob(job({ schedule: 'at:2026-10-20T09:00:00.000Z' }), { now }), { kind: 'once', at: '2026-10-20T09:00:00.000Z' });
  assert.equal(scheduleFromLegacyJob(job({ schedule: 'nonsense' }), { now }), null);
});

test('an every-N-hours job keeps its next run time', () => {
  const task = taskFromLegacyJob(job({ schedule: 'interval:7200000' }), { now });
  assert.equal(task.schedule.kind, 'every_hours');
  assert.equal(task.schedule.interval, 2);
  assert.equal(task.nextRunAt, '2026-10-13T15:00:00.000Z');
  assert.equal(computeNextRun(task.schedule, new Date('2026-10-13T15:00:00Z')).toISOString(), '2026-10-13T17:00:00.000Z');
});

test('one-offs: waiting ones keep their time, finished ones are done', () => {
  const waiting = taskFromLegacyJob(job({ schedule: 'once:60000' }), { now });
  assert.equal(waiting.enabled, true);
  assert.equal(waiting.nextRunAt, '2026-10-13T15:00:00.000Z');
  const ran = taskFromLegacyJob(job({ schedule: 'once:60000', run_count: 1 }), { now });
  assert.equal(ran.enabled, false);
  assert.equal(ran.nextRunAt, null);
});

test('jobs keep their profile tools as pre-approved tools and map folders to projects', () => {
  const task = taskFromLegacyJob(job({ schedule: 'daily:09:00', profile_id: 'p1', working_dir: '/work/site', workspace_id: 'default' }), {
    now,
    profileTools: (id) => (id === 'p1' ? ['send_email'] : []),
    projectForFolder: (folder) => (folder === '/work/site' ? 'project-1' : null),
  });
  assert.deepEqual(task.allowedTools, ['send_email']);
  assert.equal(task.projectId, 'project-1');
  assert.equal(task.workspaceId, null, 'the placeholder workspace is dropped');
  assert.equal(task.migratedFrom, 'job:j1');
});

