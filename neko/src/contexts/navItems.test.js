import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_NAV_ITEMS, migrateNavItems } from './navItems.js';

test('nothing saved shows every destination', () => {
  assert.deepEqual(migrateNavItems(null), { ...DEFAULT_NAV_ITEMS });
  assert.deepEqual(migrateNavItems('garbage'), { ...DEFAULT_NAV_ITEMS });
  assert.equal(DEFAULT_NAV_ITEMS.cats, true);
});

test('saved choices are kept and retired entries dropped', () => {
  const migrated = migrateNavItems({ projects: false, tasks: false, training: false, workflows: false, automations: true, models: 'no' });
  assert.equal(migrated.projects, false);
  assert.equal(migrated.models, true, 'non-boolean values fall back to the default');
  assert.equal('tasks' in migrated, false, 'the removed Tasks entry is dropped');
  assert.equal(migrated.cats, true);
  for (const key of ['training', 'workflows', 'automations', 'scheduled']) assert.equal(key in migrated, false);
});

test('Cats takes over the Scheduled and Automations choices', () => {
  assert.equal(migrateNavItems({ scheduled: false }).cats, false);
  assert.equal(migrateNavItems({ scheduled: true }).cats, true);
  assert.equal(migrateNavItems({ automations: false }).cats, false);
  assert.equal(migrateNavItems({ automations: true }).cats, true);
  // An explicit choice made after the change wins.
  assert.equal(migrateNavItems({ scheduled: false, cats: true }).cats, true);
});

test('Cats stays hidden for people who hid all three old entries', () => {
  assert.equal(migrateNavItems({ workflows: false, schedules: false, activity: false }).cats, false);
  assert.equal(migrateNavItems({ workflows: false, schedules: true, activity: false }).cats, true, 'hiding some of them does not hide it');
  assert.equal(migrateNavItems({ workflows: false, schedules: false, activity: false, cats: true }).cats, true);
});
