import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalKey, classifyTarget, describeSensitiveAction, formatSnapshot, pageLines, pageText } from './browserSnapshot.js';

// A tiny accessibility tree in the shape Accessibility.getFullAXTree returns.
let nextId = 1;
function node(role, name, props = {}, children = [], extra = {}) {
  const id = String(nextId++);
  return {
    nodeId: id,
    role: { type: 'role', value: role },
    name: name === undefined ? undefined : { type: 'computedString', value: name },
    properties: Object.entries(props).map(([key, value]) => ({ name: key, value: { type: 'string', value } })),
    childIds: children.map((child) => child.nodeId),
    backendDOMNodeId: extra.backend ?? Number(id) + 100,
    ignored: Boolean(extra.ignored),
    value: extra.value === undefined ? undefined : { type: 'string', value: extra.value },
    _children: children,
  };
}
function flatten(root) {
  const out = [];
  const walk = (n, parent) => {
    if (parent) n.parentId = parent.nodeId;
    out.push(n);
    n._children.forEach((child) => walk(child, n));
  };
  walk(root, null);
  return out.map(({ _children, ...rest }) => rest);
}

function refs() {
  const given = new Map();
  return {
    given,
    refFor: (frame, n) => {
      const key = `${frame.key}|${n.backendDOMNodeId}`;
      if (!given.has(key)) given.set(key, `e${given.size + 1}`);
      return given.get(key);
    },
  };
}

test('the outline shows roles, names, values and states with refs', () => {
  const email = node('textbox', 'Email', { required: true }, [node('StaticText', 'ann@example.com')], { value: 'ann@example.com' });
  const password = node('textbox', 'Password', {}, [], { value: '•••••' });
  const country = node('combobox', 'Country', { expanded: false }, [
    node('MenuListPopup', '', {}, [node('option', 'India', { selected: true }), node('option', 'Japan', { selected: false })]),
  ], { value: 'India' });
  const remember = node('checkbox', 'Remember me', { checked: 'true' });
  const signIn = node('button', 'Sign in', {}, [node('StaticText', 'Sign in', {}, [node('InlineTextBox', 'Sign in')])]);
  const link = node('link', 'Forgot password?', { url: 'https://accounts.example.com/reset' }, [node('StaticText', 'Forgot password?')]);
  const para = node('paragraph', undefined, {}, [node('StaticText', 'New here?'), node('StaticText', 'Make an account.')]);
  const wrapper = node('generic', undefined, {}, [email, password, country, remember, signIn, link, para], { ignored: false });
  const heading = node('heading', 'Sign in', { level: 1 }, [node('StaticText', 'Sign in')]);
  const ignored = node('none', undefined, {}, [heading, wrapper], { ignored: true });
  const root = node('RootWebArea', 'Accounts', {}, [ignored]);
  const frame = { key: 'main', sessionId: null, url: 'https://accounts.example.com/login', nodes: flatten(root), children: new Map() };
  const { refFor } = refs();
  const { lines } = formatSnapshot(frame, {
    refFor,
    fieldInfo: (_frame, n) => (n.name?.value === 'Password' ? { password: true } : {}),
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
  assert.match(text, /text "New here\? Make an account\."/, 'runs of text become one line');
});

test('frames are nested under their iframe', () => {
  const inner = node('button', 'Pay', {});
  const innerRoot = node('RootWebArea', 'Checkout', {}, [inner]);
  const iframe = node('Iframe', '', {});
  const root = node('RootWebArea', 'Shop', {}, [node('heading', 'Cart', { level: 2 }), iframe]);
  const child = { key: 'oopif', sessionId: 'S1', url: 'https://pay.example.net/frame', nodes: flatten(innerRoot), children: new Map() };
  const frame = { key: 'main', sessionId: null, url: 'https://shop.example', nodes: flatten(root), children: new Map([[iframe.nodeId, child]]) };
  const { refFor, given } = refs();
  const { lines } = formatSnapshot(frame, { refFor });
  assert.match(lines.join('\n'), /iframe → https:\/\/pay\.example\.net\/frame\n {2}\[e\d+\] button "Pay"/);
  assert.ok([...given.keys()].some((key) => key.startsWith('oopif|')), 'refs remember which frame they belong to');
});

test('long outlines and texts come in pages', () => {
  const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
  const first = pageLines(lines, { offset: 0, limit: 20 });
  assert.equal(first.text.split('\n').length, 20);
  assert.equal(first.truncated, true);
  assert.equal(first.nextOffset, 20);
  const last = pageLines(lines, { offset: 40, limit: 20 });
  assert.equal(last.truncated, false);
  assert.equal(last.nextOffset, null);
  const byChars = pageLines(lines, { offset: 0, limit: 400, maxChars: 30 });
  assert.ok(byChars.text.length <= 30);
  assert.equal(byChars.truncated, true);

  const text = `${'a'.repeat(900)}\n${'b'.repeat(900)}`;
  const page = pageText(text, { offset: 0, limit: 1000 });
  assert.equal(page.text, `${'a'.repeat(900)}\n`, 'cut at a line break');
  assert.equal(page.nextOffset, 901);
  assert.equal(pageText(text, { offset: 901, limit: 1000 }).truncated, false);
});

test('typing a password, card number or code needs a yes', () => {
  assert.equal(classifyTarget({ action: 'type', nodeName: 'INPUT', attributes: ['type', 'password'] }).kind, 'password');
  assert.equal(classifyTarget({ action: 'type', nodeName: 'INPUT', attributes: ['autocomplete', 'new-password'] }).kind, 'password');
  assert.equal(classifyTarget({ action: 'type', nodeName: 'INPUT', attributes: ['autocomplete', 'cc-number'] }).kind, 'payment');
  assert.equal(classifyTarget({ action: 'type', nodeName: 'INPUT', attributes: ['name', 'card_cvc'] }).kind, 'payment');
  assert.equal(classifyTarget({ action: 'type', nodeName: 'INPUT', attributes: ['autocomplete', 'one-time-code'] }).kind, 'one-time-code');
  assert.equal(classifyTarget({ action: 'type', nodeName: 'INPUT', attributes: ['aria-label', 'Verification code'] }).kind, 'one-time-code');
  assert.equal(classifyTarget({ action: 'type', nodeName: 'INPUT', attributes: ['type', 'email', 'name', 'email'] }), null);
  assert.equal(classifyTarget({ action: 'type', nodeName: 'TEXTAREA', attributes: ['name', 'comment'] }), null);
});

test('buy, delete, send and file buttons need a yes; ordinary ones do not', () => {
  assert.equal(classifyTarget({ action: 'click', role: 'button', name: 'Place order', nodeName: 'BUTTON' }).kind, 'purchase');
  assert.equal(classifyTarget({ action: 'click', role: 'button', name: 'Pay £20.00', nodeName: 'BUTTON' }).kind, 'purchase');
  assert.equal(classifyTarget({ action: 'click', role: 'button', name: 'Delete repository', nodeName: 'BUTTON' }).kind, 'delete');
  assert.equal(classifyTarget({ action: 'click', role: 'menuitem', name: 'Cancel subscription', nodeName: 'DIV' }).kind, 'delete');
  assert.equal(classifyTarget({ action: 'click', role: 'button', name: 'Send', nodeName: 'BUTTON' }).kind, 'send');
  assert.equal(classifyTarget({ action: 'click', role: 'button', name: 'Authorize app', nodeName: 'BUTTON' }).kind, 'send');
  assert.equal(classifyTarget({ action: 'click', role: 'button', nodeName: 'INPUT', attributes: ['type', 'file'] }).kind, 'file');
  assert.equal(classifyTarget({ action: 'click', role: 'button', name: 'Continue', nodeName: 'BUTTON', formHasPayment: true }).kind, 'purchase');
  assert.equal(classifyTarget({ action: 'key', nodeName: 'INPUT', attributes: ['name', 'zip'], formHasPayment: true }).kind, 'purchase');
  assert.equal(classifyTarget({ action: 'click', role: 'button', name: 'Sign in', nodeName: 'BUTTON' }), null);
  assert.equal(classifyTarget({ action: 'click', role: 'link', name: 'Pricing', nodeName: 'A' }), null);
  assert.equal(classifyTarget({ action: 'click', role: 'textbox', name: 'Search', nodeName: 'INPUT', attributes: ['type', 'text'] }), null);
  assert.equal(classifyTarget({ action: 'click', role: 'button', name: 'PayPal', nodeName: 'BUTTON' }), null);
});

test('approval cards say plainly what will happen, and approvals are specific', () => {
  assert.equal(describeSensitiveAction({ kind: 'password' }, { host: 'accounts.example.com' }), 'Type into the password field on accounts.example.com');
  assert.match(describeSensitiveAction({ kind: 'purchase', label: 'Buy now' }, { host: 'shop.example' }), /^Click “Buy now” on shop\.example: this may buy something/);
  const a = approvalKey({ kind: 'password' }, { backendNodeId: 5, host: 'a.example' });
  assert.notEqual(a, approvalKey({ kind: 'password' }, { backendNodeId: 6, host: 'a.example' }));
  assert.notEqual(a, approvalKey({ kind: 'password' }, { backendNodeId: 5, host: 'b.example' }));
  assert.equal(approvalKey(null, {}), null);
});
