import test from 'node:test';
import assert from 'node:assert/strict';
import { searchSettings } from './settingsSearch.js';

const tabs = [
  { id: 'connections', label: 'Connections', description: 'Connectors and services' },
  { id: 'notifications', label: 'Notifications', description: 'Desktop notifications' },
  { id: 'privacy', label: 'Privacy & safety', description: 'What agents may do' },
  { id: 'appearance', label: 'Appearance', description: 'Theme' },
  { id: 'profile', label: 'Profile', description: 'Your name' },
];

test('settings search finds where a setting lives', () => {
  assert.deepEqual(searchSettings('quiet', tabs)[0], { tab: 'notifications', view: null, label: 'Notifications', term: 'quiet hours' });
  assert.equal(searchSettings('mcp', tabs)[0].label, 'Connections · Connectors');
  assert.equal(searchSettings('mcp', tabs)[0].view, 'connectors');
  assert.equal(searchSettings('sandbox', tabs)[0].tab, 'privacy');
  assert.equal(searchSettings('dark', tabs)[0].tab, 'appearance');
  assert.equal(searchSettings('setup', tabs)[0].tab, 'profile', 'Run setup again');
  assert.deepEqual(searchSettings('', tabs), []);
  assert.deepEqual(searchSettings('zzzz', tabs), []);
});

test('a result opens the right page and view', async () => {
  const { resultRoute } = await import('./settingsSearch.js');
  assert.equal(resultRoute({ tab: 'connections', view: 'connectors' }), 'connectors');
  assert.equal(resultRoute({ tab: 'connections', view: 'services' }), 'integrations');
  assert.equal(resultRoute({ tab: 'privacy', view: null }), 'privacy');
});
