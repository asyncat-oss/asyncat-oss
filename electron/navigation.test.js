import test from 'node:test';
import assert from 'node:assert/strict';

import { navigationTarget, guardNavigation } from './navigation.js';

test('app pages, web links and everything else are told apart', () => {
  assert.equal(navigationTarget('http://127.0.0.1:8717/quick', 8717), 'app');
  assert.equal(navigationTarget('http://localhost:8717/conversations/1', 8717), 'app');
  assert.equal(navigationTarget('http://127.0.0.1:8716/api', 8717), 'external');
  assert.equal(navigationTarget('https://example.com', 8717), 'external');
  assert.equal(navigationTarget('file:///etc/passwd', 8717), 'blocked');
  assert.equal(navigationTarget('javascript:alert(1)', 8717), 'blocked');
  assert.equal(navigationTarget('not a url', 8717), 'blocked');
});

function fakeWebContents() {
  const listeners = {};
  return {
    openHandler: null,
    setWindowOpenHandler(fn) { this.openHandler = fn; },
    on(name, fn) { listeners[name] = fn; },
    navigate(url) {
      let prevented = false;
      listeners['will-navigate']({ preventDefault: () => { prevented = true; } }, url);
      return prevented;
    },
  };
}

test('new windows never open inside the app; web links go to the browser', () => {
  const opened = [];
  const contents = fakeWebContents();
  guardNavigation(contents, { frontendPort: 8717, openExternal: (url) => { opened.push(url); } });
  assert.deepEqual(contents.openHandler({ url: 'https://example.com/a' }), { action: 'deny' });
  assert.deepEqual(contents.openHandler({ url: 'file:///tmp/x' }), { action: 'deny' });
  assert.deepEqual(opened, ['https://example.com/a']);
});

test('navigating away from the app is stopped and sent to the browser', () => {
  const opened = [];
  const contents = fakeWebContents();
  guardNavigation(contents, { frontendPort: 8717, openExternal: async (url) => { opened.push(url); } });
  assert.equal(contents.navigate('http://127.0.0.1:8717/home'), false);
  assert.equal(contents.navigate('https://example.com/b'), true);
  assert.equal(contents.navigate('file:///etc/hosts'), true);
  assert.deepEqual(opened, ['https://example.com/b']);
});
