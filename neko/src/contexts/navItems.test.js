import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_NAV_ITEMS, migrateNavItems } from './navItems.js';

test('nothing saved shows every destination', () => {
  assert.deepEqual(migrateNavItems(null), { ...DEFAULT_NAV_ITEMS });
  assert.deepEqual(migrateNavItems('garbage'), { ...DEFAULT_NAV_ITEMS });
});

test('saved choices are kept and retired entries dropped', () => {
  const migrated = migrateNavItems({ tasks: false, training: false, workflows: false, models: 'no' });
  assert.equal(migrated.tasks, false);
  assert.equal(migrated.models, true, 'non-boolean values fall back to the default');
  assert.equal(migrated.automations, true, 'hiding one old automation page does not hide the group');
  assert.equal('training' in migrated, false);
  assert.equal('workflows' in migrated, false);
});

test('Automations stays hidden for people who hid all three old entries', () => {
  assert.equal(migrateNavItems({ workflows: false, schedules: false, activity: false }).automations, false);
  // An explicit choice made after the change wins.
  assert.equal(migrateNavItems({ workflows: false, schedules: false, activity: false, automations: true }).automations, true);
});
