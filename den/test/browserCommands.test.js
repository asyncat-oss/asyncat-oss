import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ASYNCAT_HOST_TOKEN = 'test-host-token';

const bridge = await import('../src/lib/hostBridge.js');
const { NO_DESKTOP_APP, runBrowserAction, sendBrowserCommand, redactArgs, browserOwner } = await import('../src/agent/browserCommandQueue.js');
const { previewBrowserTools } = await import('../src/agent/tools/previewBrowserTools.js');

test.afterEach(() => bridge.resetHostBridge());

const tool = (name) => previewBrowserTools.find((t) => t.name === name);

/** A pretend desktop app: answers each browser.command with reply(payload). */
function fakeHost(reply) {
  let running = true;
  const seen = [];
  (async () => {
    while (running) {
      const messages = await bridge.waitForHostMessages({ waitMs: 50, capabilities: ['browser'] });
      for (const message of messages) {
        if (!message.expectsReply) continue;
        seen.push(message.payload);
        try {
          bridge.settleHostRequest(message.id, { ok: true, result: await reply(message.payload, seen.length) });
        } catch (err) {
          bridge.settleHostRequest(message.id, { ok: false, error: err.message });
        }
      }
    }
  })();
  return { seen, stop: () => { running = false; } };
}

test('without the desktop app, browser commands fail at once with a plain message', async () => {
  await assert.rejects(sendBrowserCommand('snapshot', {}, {}), (err) => err.message === NO_DESKTOP_APP);
  const result = await tool('preview_snapshot').execute({}, {});
  assert.equal(result.success, false);
  assert.equal(result.error, NO_DESKTOP_APP);
});

test('commands carry the chat as their owner', async () => {
  await bridge.waitForHostMessages({ waitMs: 0, capabilities: ['browser'] });
  const host = fakeHost(() => ({ success: true, tabs: [] }));
  try {
    await tool('preview_list_tabs').execute({}, { conversationId: 'chat-1' });
    assert.equal(host.seen[0].action, 'list_tabs');
    assert.equal(host.seen[0].owner, 'chat-1');
    assert.equal(browserOwner({ session: { id: 's1' } }), 's1');
  } finally {
    host.stop();
  }
});

test('a sensitive step asks the user, then runs with that approval only', async () => {
  await bridge.waitForHostMessages({ waitMs: 0, capabilities: ['browser'] });
  const host = fakeHost((payload) => (payload.approvals?.includes('password:5:example.com')
    ? { success: true, url: 'https://example.com/login' }
    : { success: false, needsApproval: true, approval: { key: 'password:5:example.com', kind: 'password', description: 'Type into the password field on example.com' } }));
  const asked = [];
  const context = {
    conversationId: 'c',
    requestPermission: async (request) => { asked.push(request); return { decision: 'allow' }; },
    isToolApproved: () => false,
    approveToolForRun: () => assert.fail('a one-off approval must not cover the run'),
  };
  try {
    const result = await tool('preview_type').execute({ ref: 'e5', text: 'hunter2' }, context);
    assert.equal(result.success, true);
    assert.equal(asked.length, 1);
    assert.equal(asked[0].description, 'Type into the password field on example.com');
    assert.equal(asked[0].permission, 'dangerous');
    assert.equal(asked[0].args.text, '••••••', 'the password never reaches the approval card');
    assert.deepEqual(host.seen.map((p) => p.approvals), [[], ['password:5:example.com']]);
  } finally {
    host.stop();
  }
});

test('a "no", or a run nobody can approve, stops the step; a chat approval skips the question', async () => {
  await bridge.waitForHostMessages({ waitMs: 0, capabilities: ['browser'] });
  const host = fakeHost((payload) => (payload.approvals?.length
    ? { success: true }
    : { success: false, needsApproval: true, approval: { key: 'purchase:9:shop.example', kind: 'purchase', description: 'Click “Buy now” on shop.example' } }));
  try {
    const denied = await runBrowserAction('click', { ref: 'e9' }, { requestPermission: async () => ({ decision: 'deny' }) }, { toolName: 'preview_click' });
    assert.equal(denied.success, false);
    assert.match(denied.error, /Buy now/);

    const scheduled = await runBrowserAction('click', { ref: 'e9' }, {}, { toolName: 'preview_click' });
    assert.equal(scheduled.success, false);
    assert.match(scheduled.error, /nobody can give it/);

    let approvedForRun = null;
    const trusted = await runBrowserAction('click', { ref: 'e9' }, {
      requestPermission: async () => ({ decision: 'allow_session' }),
      approveToolForRun: (name) => { approvedForRun = name; },
    }, { toolName: 'preview_click' });
    assert.equal(trusted.success, true);
    assert.equal(approvedForRun, 'preview_click');

    const preApproved = await runBrowserAction('click', { ref: 'e9' }, {
      isToolApproved: (name) => name === 'preview_click',
      requestPermission: async () => assert.fail('pre-approved tools are not asked again'),
    }, { toolName: 'preview_click' });
    assert.equal(preApproved.success, true);
  } finally {
    host.stop();
  }
});

test('navigation is checked before the desktop app is asked', async () => {
  const blocked = await tool('preview_navigate').execute({ url: 'file:///etc/passwd' }, {});
  assert.equal(blocked.success, false);
  assert.match(blocked.error, /http and https/);
  const missing = await tool('preview_click').execute({}, {});
  assert.match(missing.error, /ref/);
});

test('typed secrets are hidden on approval cards', () => {
  assert.deepEqual(redactArgs({ ref: 'e1', text: 'secret' }), { ref: 'e1', text: '••••••' });
  assert.deepEqual(redactArgs({ fields: { '#pw': 'x', '#user': 'y' } }), { fields: { '#pw': '••••••', '#user': '••••••' } });
});

test('page-reading browser tools are marked as outside content and plan mode cannot type', async () => {
  const source = await import('fs').then((fs) => fs.readFileSync(new URL('../src/agent/AgentRuntime.js', import.meta.url), 'utf8'));
  for (const name of ['preview_snapshot', 'preview_get_text', 'preview_click']) {
    assert.match(source.slice(source.indexOf('const OUTSIDE_CONTENT_TOOLS'), source.indexOf('const OUTSIDE_CONTENT_NOTICE')), new RegExp(`'${name}'`));
  }
  const planBlocked = source.slice(source.indexOf('const PLAN_BLOCKED_SAFE_TOOLS'), source.indexOf('const OUTSIDE_CONTENT_TOOLS'));
  for (const name of ['preview_type', 'preview_press_key', 'preview_select_option', 'preview_click']) {
    assert.match(planBlocked, new RegExp(`'${name}'`));
  }
});
