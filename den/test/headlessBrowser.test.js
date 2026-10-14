import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Without the desktop app, the browser tools drive a headless browser
// (headlessBrowser.js) that reads pages and asks for approvals the same way
// as the desktop app's browser.

process.env.ASYNCAT_HOST_TOKEN = 'test-host-token';

const { formatOutline, classifyTarget, parseKeyCombo, describeSensitiveAction } = await import('../src/agent/headlessSnapshot.js');
const desktop = await import('../../electron/browserSnapshot.js');
const { previewBrowserTools } = await import('../src/agent/tools/previewBrowserTools.js');
const { useHeadlessBrowser } = await import('../src/agent/browserCommandQueue.js');
const { HeadlessBrowser, NO_HEADLESS_BROWSER } = await import('../src/agent/headlessBrowser.js');

const tool = (name) => previewBrowserTools.find((t) => t.name === name);

test('the outline shows roles, names, values and states with refs', () => {
  const tree = {
    role: 'RootWebArea', name: 'Accounts', url: 'https://accounts.example.com/login', children: [
      { role: 'heading', name: 'Sign in', level: 1 },
      { role: 'form', name: '', children: [
        { role: 'textbox', name: 'Email', value: 'ann@example.com', required: true, backendNodeId: 3 },
        { role: 'textbox', name: 'Password', value: '•••••', backendNodeId: 4 },
        { role: 'combobox', name: 'Country', value: 'India', expanded: false, children: [
          { role: 'option', name: 'India', selected: true }, { role: 'option', name: 'Japan', selected: false },
        ] },
        { role: 'checkbox', name: 'Remember me', checked: true },
        { role: 'button', name: 'Sign in', children: [{ role: 'StaticText', name: 'Sign in' }] },
        { role: 'link', name: 'Forgot password?', backendNodeId: 9, children: [{ role: 'StaticText', name: 'Forgot password?' }] },
      ] },
      { role: 'StaticText', name: 'New here?' },
      { role: 'StaticText', name: 'Make an account.' },
      { role: 'Iframe', name: '', children: [{ role: 'RootWebArea', url: 'https://pay.example.com/card', children: [{ role: 'button', name: 'Pay' }] }] },
    ],
  };
  let count = 0;
  const attributes = { 4: { type: 'password' }, 9: { href: '/reset' } };
  const { lines, refCount } = formatOutline(tree, {
    refFor: () => `e${++count}`,
    attributesFor: (node) => attributes[node.backendNodeId] || {},
    pageUrl: 'https://accounts.example.com/login',
  });
  const text = lines.join('\n');
  assert.match(text, /^\[e1\] heading "Sign in" level=1$/m);
  assert.match(text, /\[e\d+\] textbox "Email" value="ann@example.com" required/);
  assert.match(text, /\[e\d+\] textbox "Password" password$/m, 'password values never appear');
  assert.doesNotMatch(text, /•/);
  assert.match(text, /\[e\d+\] combobox "Country" value="India" collapsed/);
  assert.match(text, /^ {2}option "India" selected$/m, 'select options are listed without refs');
  assert.match(text, /\[e\d+\] checkbox "Remember me" checked/);
  assert.match(text, /\[e\d+\] button "Sign in"$/m);
  assert.doesNotMatch(text, /text "Sign in"/, 'a button\'s label is not repeated');
  assert.match(text, /link "Forgot password\?" → \/reset/);
  assert.match(text, /\[e\d+\] text "New here\? Make an account\."/, 'runs of text become one line');
  assert.match(text, /iframe → https:\/\/pay\.example\.com\/card\n {2}\[e\d+\] button "Pay"/, 'frames nest under their iframe');
  assert.equal(refCount, count);
});

test('the approval rules match the desktop app\'s', () => {
  const cases = [
    { action: 'type', nodeName: 'INPUT', attributes: { type: 'password' } },
    { action: 'type', nodeName: 'INPUT', attributes: { autocomplete: 'cc-number' } },
    { action: 'type', nodeName: 'INPUT', attributes: { name: 'card_number' } },
    { action: 'type', nodeName: 'INPUT', attributes: { autocomplete: 'one-time-code' } },
    { action: 'type', nodeName: 'INPUT', attributes: { name: 'email' } },
    { action: 'click', nodeName: 'INPUT', attributes: { type: 'file' } },
    { action: 'click', role: 'button', name: 'Buy now', nodeName: 'BUTTON' },
    { action: 'click', role: 'button', name: 'Delete account', nodeName: 'BUTTON' },
    { action: 'click', role: 'button', name: 'Send', nodeName: 'BUTTON' },
    { action: 'click', role: 'button', name: 'Continue', nodeName: 'BUTTON', formHasPayment: true },
    { action: 'click', role: 'button', name: 'Continue', nodeName: 'BUTTON' },
    { action: 'click', role: 'link', name: 'Pricing', nodeName: 'A' },
    { action: 'key', nodeName: 'INPUT', attributes: { name: 'zip' }, formHasPayment: true },
    { action: 'click', nodeName: 'INPUT', attributes: { type: 'checkbox' }, role: 'checkbox', name: 'Delete' },
  ];
  for (const target of cases) {
    const mine = classifyTarget(target);
    assert.deepEqual(mine, desktop.classifyTarget(target), JSON.stringify(target));
    assert.equal(describeSensitiveAction(mine, { host: 'shop.example', action: target.action }), desktop.describeSensitiveAction(desktop.classifyTarget(target), { host: 'shop.example', action: target.action }));
  }
});

test('key combos become Puppeteer key names', () => {
  assert.deepEqual(parseKeyCombo('Control+A'), { modifiers: ['Control'], key: 'A' });
  assert.deepEqual(parseKeyCombo('ctrl+shift+t'), { modifiers: ['Control', 'Shift'], key: 't' });
  assert.deepEqual(parseKeyCombo('enter'), { modifiers: [], key: 'Enter' });
  assert.deepEqual(parseKeyCombo('PageDown'), { modifiers: [], key: 'PageDown' });
  assert.deepEqual(parseKeyCombo('f5'), { modifiers: [], key: 'F5' });
  assert.throws(() => parseKeyCombo('a+b'), /modifier/);
});

test('without the desktop app the browser tools fall back to a headless browser', async (t) => {
  const pages = {
    '/': `<!doctype html><title>Demo shop</title><h1>Sign in</h1>
      <form action="/welcome"><label>Name <input name="name"></label><label>Password <input type="password" name="pw"></label>
      <button type="submit">Continue</button></form><p class="note">Made-up demo page.</p>`,
    '/welcome': '<!doctype html><title>Welcome</title><h1>Welcome back</h1>',
  };
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(pages[new URL(req.url, 'http://x').pathname] || '<title>Missing</title>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = new HeadlessBrowser();
  useHeadlessBrowser(browser);
  const asked = [];
  const context = {
    conversationId: 'headless-demo',
    requestPermission: async (request) => { asked.push(request); return { decision: 'deny' }; },
  };
  try {
    const opened = await tool('preview_navigate').execute({ url: `${base}/` }, context);
    if (!opened.success && String(opened.error).startsWith(NO_HEADLESS_BROWSER)) {
      t.skip('no Chrome, Chromium, Edge or Brave on this machine');
      return;
    }
    assert.equal(opened.success, true, opened.error);
    assert.equal(opened.title, 'Demo shop');

    const outline = await tool('preview_snapshot').execute({}, context);
    assert.equal(outline.success, true);
    const ref = (pattern) => outline.snapshot.split('\n').find((line) => pattern.test(line))?.match(/\[(e\d+)\]/)?.[1];
    assert.ok(ref(/textbox "Name"/), outline.snapshot);
    assert.match(outline.snapshot, /textbox "Password" password/);

    const secret = await tool('preview_type').execute({ ref: ref(/textbox "Password"/), text: 'hunter2' }, context);
    assert.equal(secret.success, false, 'typing a password asks first');
    assert.equal(asked.length, 1);
    assert.match(asked[0].description, /password field/);

    const part = await tool('preview_get_text').execute({ selector: '.note' }, context);
    assert.equal(part.text, 'Made-up demo page.');
    const names = await tool('preview_get_text').execute({ selector: 'input', attribute: 'name' }, context);
    assert.equal(names.text, 'name\npw', 'an attribute of each match, one per line');

    const sent = await tool('preview_fill').execute({ fields: [{ ref: ref(/textbox "Name"/), value: 'Ann' }], submit: ref(/button "Continue"/) }, context);
    assert.equal(sent.success, true, sent.error);
    assert.equal(sent.navigated, true);
    assert.equal(sent.title, 'Welcome');

    const handover = await tool('preview_ask_user').execute({ message: 'Sign in, please.' }, context);
    assert.equal(handover.success, false);
    assert.match(handover.error, /desktop app/);
  } finally {
    useHeadlessBrowser(null);
    await browser.close();
    server.close();
  }
});

test('pages read by their address, several at once, each come back whole, and the agent\'s tab stays put', async (t) => {
  const pages = {
    '/notes': '<!doctype html><title>Allotment</title><h1>Allotment notes</h1>',
    '/pears': '<!doctype html><title>Pears</title><h1>Pears ripen off the tree</h1>',
    '/plums': '<!doctype html><title>Plums</title><h1>Plums want a sunny wall</h1>',
  };
  // The page asked for first answers last.
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://x').pathname;
    setTimeout(() => {
      res.setHeader('content-type', 'text/html');
      res.end(pages[pathname] || '<title>Missing</title>');
    }, pathname === '/pears' ? 400 : 20);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = new HeadlessBrowser();
  useHeadlessBrowser(browser);
  const context = { conversationId: 'headless-reads' };
  try {
    const opened = await tool('preview_navigate').execute({ url: `${base}/notes` }, context);
    if (!opened.success && String(opened.error).startsWith(NO_HEADLESS_BROWSER)) {
      t.skip('no Chrome, Chromium, Edge or Brave on this machine');
      return;
    }
    assert.equal(opened.success, true, opened.error);

    const [pears, plums] = await Promise.all([
      tool('preview_get_text').execute({ url: `${base}/pears`, selector: 'h1' }, context),
      tool('preview_get_text').execute({ url: `${base}/plums`, selector: 'h1' }, context),
    ]);
    assert.equal(pears.text, 'Pears ripen off the tree');
    assert.equal(plums.text, 'Plums want a sunny wall');
    const shot = await tool('preview_screenshot').execute({ url: `${base}/plums`, selector: 'h1' }, context);
    assert.equal(shot.success, true, shot.error);
    assert.match(shot.dataUrl, /^data:image\/jpeg;base64,/);

    const own = await tool('preview_get_text').execute({ selector: 'h1' }, context);
    assert.equal(own.text, 'Allotment notes', 'the agent\'s tab is where it was');
    const tabs = await tool('preview_list_tabs').execute({}, context);
    assert.deepEqual(tabs.tabs.map((tab) => tab.title), ['Allotment'], 'and the pages read by address are closed');
  } finally {
    useHeadlessBrowser(null);
    await browser.close();
    server.close();
  }
});
