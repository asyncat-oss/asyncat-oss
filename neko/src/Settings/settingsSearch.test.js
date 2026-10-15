import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SETTINGS_INDEX, resultRoute, searchSettings } from './settingsSearch.js';
import { SETTINGS_TABS, TAB_ALIASES, resolveTab } from './settingsTabs.js';

const tabs = SETTINGS_TABS;
const first = (query) => searchSettings(query, tabs)[0];
const opens = (query) => resultRoute(first(query));

test('settings search finds where a setting lives now', () => {
  assert.deepEqual(first('quiet'), { tab: 'notifications', view: null, section: null, route: null, label: 'Notifications', term: 'quiet hours' });
  assert.equal(first('mcp').label, 'Connections · Connectors');
  assert.equal(opens('mcp'), '/settings/connectors');
  assert.equal(opens('rss'), '/settings/integrations');
  assert.equal(opens('sandbox'), '/settings/privacy');
  assert.equal(opens('dark'), '/settings/appearance');
  assert.equal(opens('avatar'), '/settings/general', 'Profile is at the top of General');
  assert.equal(opens('plan mode'), '/settings/general#new-chats', 'the mode new chats start in moved to General');
  assert.equal(opens('start at login'), '/settings/general#window', 'Background moved to General');
  assert.equal(opens('tray'), '/settings/general#window');
  assert.equal(opens('setup'), '/settings/general#setup', 'Run setup again');
  assert.equal(opens('keyboard'), '/settings/shortcuts');
  assert.equal(opens('wayland'), '/settings/shortcuts');
  assert.equal(opens('pet'), '/settings/desktop#pet', 'the pet moved to Desktop');
  assert.equal(opens('quick ask'), '/settings/desktop#quick-ask');
  assert.equal(opens('uninstall'), '/settings/desktop#app-data');
  assert.equal(opens('update'), '/settings/about');
  assert.equal(opens('server'), '/settings/about#developer', 'Advanced moved to About');
  assert.equal(opens('export'), '/settings/privacy#data');
  assert.equal(opens('about me'), '/settings/personalization');
  assert.equal(opens('custom instructions'), '/settings/personalization');
  assert.equal(opens('soul'), '/settings/personalization#instructions', 'the Soul tab became the instructions file');
  assert.equal(opens('system prompt'), '/settings/personalization#instructions');
  assert.equal(opens('logs'), '/files/logs', 'Storage and logs are in Files');
  assert.equal(opens('engines'), '/models?view=local', 'engines are managed in Models');
  assert.deepEqual(searchSettings('', tabs), []);
  assert.deepEqual(searchSettings('zzzz', tabs), []);
});

test('every search entry points at a page and a section that exist', () => {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  for (const entry of SETTINGS_INDEX) {
    if (entry.route) {
      assert.match(entry.route, /^\/(files|models)/, entry.label);
      continue;
    }
    const tab = byId.get(entry.tab);
    assert.ok(tab, `no page ${entry.tab}`);
    if (entry.section) assert.ok(tab.sections?.includes(entry.section), `${entry.tab} has no section ${entry.section}`);
  }
  // Each page can be found by its own name.
  for (const tab of tabs) assert.equal(searchSettings(tab.label, tabs)[0]?.label.startsWith(tab.label), true, tab.label);
});

test('every section a link can scroll to is marked on its page', () => {
  // SettingsPage scrolls to [data-settings-section="<id>"]; without it the
  // page stays at its top.
  const folder = new URL('./', import.meta.url);
  const source = fs.readdirSync(folder)
    .filter((name) => name.endsWith('.jsx'))
    .map((name) => fs.readFileSync(new URL(name, folder), 'utf8'))
    .join('\n');
  for (const tab of tabs) {
    for (const section of tab.sections || []) {
      assert.ok(source.includes(`data-settings-section="${section}"`), `${tab.id}#${section} has no anchor`);
    }
  }
});

test('old Settings addresses still lead somewhere sensible', () => {
  const ids = new Set(tabs.map((tab) => tab.id));
  assert.deepEqual(resolveTab('profile'), { tab: 'general', view: null, section: null }, 'Ctrl+, opens General at its top');
  assert.deepEqual(resolveTab('background'), { tab: 'general', view: null, section: 'window' });
  assert.deepEqual(resolveTab('connectors'), { tab: 'connections', view: 'connectors', section: null });
  assert.deepEqual(resolveTab('integrations'), { tab: 'connections', view: 'services', section: null });
  assert.deepEqual(resolveTab('advanced'), { tab: 'about', view: null, section: 'developer' });
  assert.deepEqual(resolveTab('runtime'), { redirect: '/models?view=local' });
  assert.deepEqual(resolveTab('engines'), { redirect: '/models?view=local' });
  assert.deepEqual(resolveTab('storage'), { redirect: '/files/logs' });
  assert.deepEqual(resolveTab('privacy'), { tab: 'privacy', view: null, section: null });
  assert.deepEqual(resolveTab('soul'), { tab: 'personalization', view: null, section: 'instructions' });
  assert.deepEqual(resolveTab('personalisation'), { tab: 'personalization', view: null, section: null });
  assert.equal(resolveTab(undefined).tab, 'general', 'Ctrl+, and /settings open General');
  assert.equal(resolveTab('nonsense').tab, 'general');
  for (const old of ['profile', 'account', 'security', 'background', 'runtime', 'engines', 'advanced', 'storage', 'server', 'updates', 'safety', 'data', 'notify', 'integrations', 'connectors', 'mcp']) {
    const where = resolveTab(old);
    assert.ok(where.redirect || ids.has(where.tab), old);
  }
  for (const [old, alias] of Object.entries(TAB_ALIASES)) {
    if (alias.redirect) continue;
    const tab = tabs.find((item) => item.id === alias.tab);
    assert.ok(tab, old);
    if (alias.section) assert.ok(tab.sections?.includes(alias.section), `${old} → ${alias.tab}#${alias.section}`);
  }
});
