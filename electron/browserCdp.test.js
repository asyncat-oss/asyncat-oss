import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { PageDriver, describeDomNode } from './browserCdp.js';

const ax = (nodeId, role, name, backend, children = [], parentId) => ({
  nodeId: String(nodeId),
  role: { value: role },
  name: { value: name },
  backendDOMNodeId: backend,
  childIds: children.map(String),
  ...(parentId ? { parentId: String(parentId) } : {}),
});

/** A fake webContents.debugger with one page: a heading and a Buy button. */
function fakeDebugger({ hitBackend = 11, probeFires = true } = {}) {
  const dbg = new EventEmitter();
  const calls = [];
  let attached = false;
  let probeArmed = false;
  dbg.isAttached = () => attached;
  dbg.attach = () => { attached = true; };
  dbg.detach = () => { attached = false; };
  dbg.sendCommand = async (method, params = {}, sessionId) => {
    calls.push({ method, params, sessionId });
    switch (method) {
      case 'Page.getFrameTree': return { frameTree: { frame: { id: 'MAIN' } } };
      case 'Accessibility.getFullAXTree': return { nodes: [
        { ...ax(1, 'RootWebArea', 'Shop', 1, [2, 3]), properties: [{ name: 'url', value: { value: 'https://shop.example/' } }] },
        ax(2, 'heading', 'Cart', 10, [], 1),
        ax(3, 'button', 'Buy now', 11, [], 1),
      ] };
      case 'DOM.describeNode':
        if (params.backendNodeId === 99) return { node: { nodeName: 'DIV', localName: 'div', attributes: ['id', 'cookie-banner'], nodeType: 1 } };
        return { node: { nodeName: 'BUTTON', localName: 'button', attributes: ['type', 'submit'], nodeType: 1, backendNodeId: params.backendNodeId } };
      case 'DOM.getBoxModel': return { model: { content: [10, 20, 110, 20, 110, 60, 10, 60], border: [10, 20, 110, 20, 110, 60, 10, 60] } };
      case 'DOM.getNodeForLocation': return { backendNodeId: hitBackend, frameId: 'MAIN' };
      case 'Page.createIsolatedWorld': return { executionContextId: 7 };
      case 'DOM.resolveNode': return { object: { objectId: `obj-${params.backendNodeId}` } };
      case 'Runtime.callFunctionOn': {
        const fn = params.functionDeclaration;
        if (fn.includes('__asyncatProbes[id] = false')) { probeArmed = true; return { result: { value: undefined } }; }
        if (fn.includes('return Boolean(window.__asyncatProbes')) return { result: { value: probeArmed && probeFires } };
        if (fn.includes('var form = this.form')) return { result: { value: false } };
        if (fn.includes('t.contains(h)')) return { result: { value: false } };
        return { result: { value: true } };
      }
      default: return {};
    }
  };
  return { dbg, calls };
}

test('snapshot refs map to DOM nodes and keep their numbers between snapshots', async () => {
  const { dbg } = fakeDebugger();
  const driver = new PageDriver(dbg, { platform: 'linux' });
  const first = await driver.snapshot();
  assert.match(first.text, /\[e1\] heading "Cart"/);
  assert.match(first.text, /\[e2\] button "Buy now"/);
  const second = await driver.snapshot();
  assert.equal(second.text, first.text, 'the same element keeps its ref');
  const target = await driver.resolveTarget({ ref: 'e2' });
  assert.equal(target.backendNodeId, 11);
  assert.equal(target.frameId, 'MAIN');
  await assert.rejects(driver.resolveTarget({ ref: 'e9' }), /take a new preview_snapshot/);

  // A new page: old refs stop working, and numbers are never reused.
  dbg.emit('message', {}, 'Page.frameNavigated', { frame: { id: 'MAIN' } });
  await assert.rejects(driver.resolveTarget({ ref: 'e2' }), /no element e2/);
  const third = await driver.snapshot();
  assert.match(third.text, /\[e3\] heading "Cart"/);
});

test('a drawn page gets real mouse events in the element\'s own frame session', async () => {
  const { dbg, calls } = fakeDebugger();
  const driver = new PageDriver(dbg, { platform: 'linux' });
  await driver.snapshot();
  const result = await driver.click(await driver.resolveTarget({ ref: 'e2' }), { rendered: true });
  assert.equal(result.input, 'real');
  const mouse = calls.filter((c) => c.method === 'Input.dispatchMouseEvent').map((c) => c.params.type);
  assert.deepEqual(mouse, ['mouseMoved', 'mousePressed', 'mouseReleased']);
  const press = calls.find((c) => c.params.type === 'mousePressed');
  assert.deepEqual([press.params.x, press.params.y], [60, 40], 'clicks the middle of the element');
});

test('a page that is not drawn is clicked through the DOM, without stuck mouse events', async () => {
  const { dbg, calls } = fakeDebugger();
  const driver = new PageDriver(dbg, { platform: 'linux' });
  await driver.snapshot();
  const result = await driver.click(await driver.resolveTarget({ ref: 'e2' }), { rendered: false });
  assert.equal(result.input, 'simulated');
  assert.equal(calls.filter((c) => c.method === 'Input.dispatchMouseEvent').length, 0);
  assert.ok(calls.some((c) => c.method === 'Runtime.callFunctionOn' && c.params.functionDeclaration.includes('el.click()')));
});

test('real events that never arrive fall back to the DOM', async () => {
  const { dbg } = fakeDebugger({ probeFires: false });
  const driver = new PageDriver(dbg, { platform: 'linux' });
  await driver.snapshot();
  const result = await driver.click(await driver.resolveTarget({ ref: 'e2' }), { rendered: true });
  assert.equal(result.input, 'simulated');
});

test('something covering the element stops the click and says what it is', async () => {
  const { dbg, calls } = fakeDebugger({ hitBackend: 99 });
  const driver = new PageDriver(dbg, { platform: 'linux' });
  await driver.snapshot();
  await assert.rejects(driver.click(await driver.resolveTarget({ ref: 'e2' })), /div#cookie-banner/);
  assert.equal(calls.filter((c) => c.method === 'Input.dispatchMouseEvent').length, 0);
});

test('the safety check reads the element itself', async () => {
  const { dbg } = fakeDebugger();
  const driver = new PageDriver(dbg, { platform: 'linux' });
  await driver.snapshot();
  const { classification } = await driver.classify(await driver.resolveTarget({ ref: 'e2' }), 'click');
  assert.equal(classification.kind, 'purchase');
});

test('page dialogs are answered only during agent actions, and confirmations are cancelled', async () => {
  const { dbg, calls } = fakeDebugger();
  let busy = false;
  const driver = new PageDriver(dbg, { platform: 'linux', shouldAnswerDialogs: () => busy });
  await driver.ensure();
  dbg.emit('message', {}, 'Page.javascriptDialogOpening', { type: 'confirm', message: 'Delete everything?' });
  assert.equal(calls.filter((c) => c.method === 'Page.handleJavaScriptDialog').length, 0, 'the user answers their own');
  busy = true;
  dbg.emit('message', {}, 'Page.javascriptDialogOpening', { type: 'confirm', message: 'Delete everything?' });
  const answer = calls.find((c) => c.method === 'Page.handleJavaScriptDialog');
  assert.equal(answer.params.accept, false);
  assert.deepEqual(driver.takeDialogs(), [{ type: 'confirm', message: 'Delete everything?', answered: 'cancel' }]);
});

test('covering elements are described briefly', () => {
  assert.equal(describeDomNode({ localName: 'div', attributes: ['class', 'modal open big'] }), 'div.modal.open');
  assert.equal(describeDomNode({ localName: 'button', attributes: ['id', 'x', 'aria-label', 'Close'] }), 'button#x "Close"');
  assert.equal(describeDomNode(null), 'another element');
});
