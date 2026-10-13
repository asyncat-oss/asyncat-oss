// electron/browserCdp.js
// ─── Driving one page through the Chrome DevTools Protocol ───────────────────
// A PageDriver wraps a tab's webContents.debugger. It reads the page through
// the accessibility tree (frames included, cross-site ones through their own
// sessions), maps refs to DOM nodes, and acts with real input events: the
// page receives trusted mouse and keyboard events, as if the user did it.
//
// Only the debugger object is used, so tests can pass a fake one.

import { formatSnapshot, pageLines, classifyTarget } from './browserSnapshot.js';
import { parseKeyCombo } from './browserPolicy.js';

const WORLD_NAME = 'asyncat-agent';
const MAX_FRAMES = 12;
const MAX_AX_NODES = 6000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A key press done through the DOM (runs in the page's isolated world): the
// key events, then what the key would have done.
const SIMULATED_KEY = `function (key, code, keyCode, mods) {
  var el = document.activeElement || document.body;
  var init = { key: key, code: code, keyCode: keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true,
    altKey: !!(mods & 1), ctrlKey: !!(mods & 2), metaKey: !!(mods & 4), shiftKey: !!(mods & 8) };
  var go = el.dispatchEvent(new KeyboardEvent('keydown', init));
  if (go && key === 'Enter') el.dispatchEvent(new KeyboardEvent('keypress', init));
  el.dispatchEvent(new KeyboardEvent('keyup', init));
  if (!go) return;
  var editable = el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName);
  if ((init.ctrlKey || init.metaKey) && key.toLowerCase() === 'a') {
    if (editable && el.select) el.select(); else document.execCommand('selectAll');
    return;
  }
  if (key === 'Enter') {
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) { document.execCommand('insertLineBreak'); return; }
    if (el.tagName === 'INPUT' && el.form && typeof el.form.requestSubmit === 'function') { el.form.requestSubmit(); return; }
    if (/^(BUTTON|A|SUMMARY)$/.test(el.tagName) || el.getAttribute('role') === 'button') el.click();
    return;
  }
  if (key === ' ' && (/^(BUTTON|SUMMARY)$/.test(el.tagName) || el.type === 'checkbox' || el.type === 'radio' || el.getAttribute('role') === 'button')) { el.click(); return; }
  if (key === 'Backspace' && editable) { document.execCommand('delete'); return; }
  if (key === 'Delete' && editable) { document.execCommand('forwardDelete'); return; }
  if (key === 'Tab') {
    var all = Array.prototype.filter.call(document.querySelectorAll('a[href],button,input,select,textarea,[tabindex],[contenteditable="true"]'), function (n) {
      return !n.disabled && n.tabIndex >= 0 && n.getClientRects().length > 0;
    });
    var i = all.indexOf(el);
    var next = all[(i + (init.shiftKey ? -1 : 1) + all.length) % all.length];
    if (next) next.focus();
    return;
  }
  if (editable) return;
  var scroller = document.scrollingElement || document.documentElement;
  if (key === 'PageDown' || key === ' ') scroller.scrollBy(0, innerHeight * 0.9);
  else if (key === 'PageUp') scroller.scrollBy(0, -innerHeight * 0.9);
  else if (key === 'ArrowDown') scroller.scrollBy(0, 40);
  else if (key === 'ArrowUp') scroller.scrollBy(0, -40);
  else if (key === 'Home') scroller.scrollTo(0, 0);
  else if (key === 'End') scroller.scrollTo(0, scroller.scrollHeight);
}`;

export function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]);
}

function quadCenter(quad) {
  if (!Array.isArray(quad) || quad.length < 8) return null;
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (width < 1 || height < 1) return null;
  return { x: xs.reduce((a, b) => a + b, 0) / 4, y: ys.reduce((a, b) => a + b, 0) / 4, width, height, left: Math.min(...xs), top: Math.min(...ys) };
}

function attrsToObject(list = []) {
  const map = {};
  for (let i = 0; i + 1 < list.length; i += 2) map[String(list[i]).toLowerCase()] = String(list[i + 1]);
  return map;
}

/** A short description of a DOM node for error messages: button#buy.primary */
export function describeDomNode(node) {
  if (!node) return 'another element';
  const attrs = attrsToObject(node.attributes);
  let text = String(node.localName || node.nodeName || 'element').toLowerCase();
  if (attrs.id) text += `#${attrs.id}`;
  else if (attrs.class) text += `.${attrs.class.trim().split(/\s+/).slice(0, 2).join('.')}`;
  const label = attrs['aria-label'] || attrs.title;
  if (label) text += ` "${String(label).slice(0, 60)}"`;
  return text;
}

export class PageDriver {
  constructor(debuggerLike, { platform = process.platform, shouldAnswerDialogs = () => true } = {}) {
    this.dbg = debuggerLike;
    this.platform = platform;
    this.shouldAnswerDialogs = shouldAnswerDialogs;
    this.sessions = new Map(); // sessionId → { targetId, parentSessionId, url }
    this.ready = null;
    this.refs = new Map(); // ref → { sessionId, frameId, backendNodeId, role, name }
    this.refIds = new Map(); // `${sessionId}|${backendNodeId}` → ref
    this.refCounter = 0;
    this.cache = null; // last snapshot's lines, for paging
    this.worlds = new Map(); // `${sessionId}|${frameId}` → executionContextId
    this.dialogs = [];
    this.onMessage = this.onMessage.bind(this);
    this.onDetach = () => { this.ready = null; this.sessions.clear(); this.worlds.clear(); };
  }

  send(method, params = {}, sessionId = null) {
    return sessionId ? this.dbg.sendCommand(method, params, sessionId) : this.dbg.sendCommand(method, params);
  }

  ensure() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      if (!this.dbg.isAttached()) this.dbg.attach('1.3');
      this.dbg.removeListener?.('message', this.onMessage);
      this.dbg.removeListener?.('detach', this.onDetach);
      this.dbg.on('message', this.onMessage);
      this.dbg.on('detach', this.onDetach);
      await this.send('Page.enable').catch(() => {});
      await this.send('DOM.enable').catch(() => {});
      await this.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }).catch(() => {});
    })().catch((err) => {
      this.ready = null;
      throw err;
    });
    return this.ready;
  }

  detach() {
    try {
      this.dbg.removeListener?.('message', this.onMessage);
      this.dbg.removeListener?.('detach', this.onDetach);
      if (this.dbg.isAttached()) this.dbg.detach();
    } catch { /* already gone */ }
    this.ready = null;
    this.sessions.clear();
  }

  onMessage(_event, method, params = {}, sessionId) {
    if (method === 'Target.attachedToTarget') {
      const info = params.targetInfo || {};
      if (info.type === 'iframe') {
        this.sessions.set(params.sessionId, { targetId: info.targetId, parentSessionId: sessionId || null, url: info.url });
        this.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, params.sessionId).catch(() => {});
        this.send('Page.enable', {}, params.sessionId).catch(() => {});
      }
      this.send('Runtime.runIfWaitingForDebugger', {}, params.sessionId).catch(() => {});
    } else if (method === 'Target.detachedFromTarget') {
      this.sessions.delete(params.sessionId);
    } else if (method === 'Target.targetInfoChanged') {
      for (const info of this.sessions.values()) {
        if (info.targetId === params.targetInfo?.targetId) info.url = params.targetInfo.url;
      }
    } else if (method === 'Page.frameNavigated' && !sessionId && !params.frame?.parentId) {
      this.resetRefs();
    } else if (method === 'Page.javascriptDialogOpening') {
      this.handleDialog(params, sessionId);
    }
  }

  /**
   * A JavaScript alert/confirm/prompt during an agent action: answer it so
   * the page doesn't stall, and tell the agent. Only plain alerts get OK;
   * confirmations are cancelled, so a page can't get "OK" on something like
   * "Delete everything?". Outside agent actions the user answers their own.
   */
  handleDialog(params, sessionId) {
    if (!this.shouldAnswerDialogs()) return;
    const accept = params.type === 'alert';
    this.dialogs.push({ type: params.type, message: String(params.message || '').slice(0, 300), answered: accept ? 'ok' : 'cancel' });
    if (this.dialogs.length > 5) this.dialogs.shift();
    this.send('Page.handleJavaScriptDialog', { accept }, sessionId).catch(() => {});
  }

  takeDialogs() {
    const list = this.dialogs;
    this.dialogs = [];
    return list;
  }

  resetRefs() {
    this.refs = new Map();
    this.refIds = new Map();
    this.cache = null;
    this.worlds.clear();
  }

  // ── Reading ───────────────────────────────────────────────────────────────

  async mainFrameId() {
    const tree = await this.send('Page.getFrameTree');
    return tree?.frameTree?.frame?.id || null;
  }

  async axNodes(sessionId, frameId) {
    const params = frameId && !this.isSessionFrame(sessionId, frameId) ? { frameId } : {};
    const result = await this.send('Accessibility.getFullAXTree', params, sessionId);
    const nodes = result?.nodes || [];
    return nodes.length > MAX_AX_NODES ? nodes.slice(0, MAX_AX_NODES) : nodes;
  }

  isSessionFrame(sessionId, frameId) {
    return Boolean(sessionId) && this.sessions.get(sessionId)?.targetId === frameId;
  }

  sessionForFrame(frameId) {
    for (const [sessionId, info] of this.sessions) if (info.targetId === frameId) return sessionId;
    return null;
  }

  /** The accessibility trees of the page and its frames, nested. */
  async collectFrames() {
    await this.ensure();
    const frameId = await this.mainFrameId();
    const root = { sessionId: null, frameId, url: '', nodes: await this.axNodes(null, null), children: new Map() };
    const rootArea = root.nodes.find((node) => !node.parentId);
    root.url = (rootArea?.properties || []).find((p) => p.name === 'url')?.value?.value || '';
    let count = 1;
    const expand = async (frame) => {
      for (const node of frame.nodes) {
        if (count >= MAX_FRAMES) return;
        const role = node.role?.value;
        if ((role !== 'Iframe' && role !== 'iframe') || !node.backendDOMNodeId || node.ignored) continue;
        let childFrameId = null;
        try {
          const described = await this.send('DOM.describeNode', { backendNodeId: node.backendDOMNodeId }, frame.sessionId);
          childFrameId = described?.node?.frameId || described?.node?.contentDocument?.frameId || null;
        } catch { continue; }
        if (!childFrameId) continue;
        const oopif = this.sessionForFrame(childFrameId);
        try {
          const child = {
            sessionId: oopif || frame.sessionId,
            frameId: childFrameId,
            url: oopif ? this.sessions.get(oopif)?.url || '' : '',
            nodes: await this.axNodes(oopif || frame.sessionId, oopif ? null : childFrameId),
            children: new Map(),
            parent: frame,
            ownerBackendNodeId: node.backendDOMNodeId,
          };
          const area = child.nodes.find((n) => !n.parentId);
          child.url = child.url || (area?.properties || []).find((p) => p.name === 'url')?.value?.value || '';
          // Empty frames (trackers, spacers) only add noise.
          if (child.nodes.filter((n) => !n.ignored).length <= 1) continue;
          frame.children.set(String(node.nodeId), child);
          count += 1;
          await expand(child);
        } catch { /* frame went away mid-read */ }
      }
    };
    await expand(root);
    return root;
  }

  refKey(sessionId, backendNodeId) {
    return `${sessionId || 'main'}|${backendNodeId}`;
  }

  async snapshot({ offset = 0, limit = 400, maxChars = 12000, fresh = false } = {}) {
    await this.ensure();
    if (fresh || offset === 0 || !this.cache) {
      const root = await this.collectFrames();
      const fieldNodes = [];
      const nextRefs = new Map();
      const refFor = (frame, node) => {
        const key = this.refKey(frame.sessionId, node.backendDOMNodeId);
        let ref = this.refIds.get(key);
        if (!ref) {
          this.refCounter += 1;
          ref = `e${this.refCounter}`;
          this.refIds.set(key, ref);
        }
        nextRefs.set(ref, {
          sessionId: frame.sessionId,
          frameId: frame.frameId,
          backendNodeId: node.backendDOMNodeId,
          role: node.role?.value || '',
          name: String(node.name?.value || '').slice(0, 160),
        });
        return ref;
      };
      // Which text fields are passwords and which buttons are file pickers:
      // the accessibility tree doesn't say, the DOM does.
      const fields = new Map();
      const gatherFields = (frame) => {
        for (const node of frame.nodes) {
          const role = node.role?.value;
          if (node.backendDOMNodeId && ['textbox', 'button'].includes(role) && fieldNodes.length < 300) {
            fieldNodes.push({ frame, node });
          }
        }
        for (const child of frame.children.values()) gatherFields(child);
      };
      gatherFields(root);
      await Promise.all(fieldNodes.map(async ({ frame, node }) => {
        try {
          const { node: dom } = await this.send('DOM.describeNode', { backendNodeId: node.backendDOMNodeId }, frame.sessionId);
          const attrs = attrsToObject(dom?.attributes);
          if (String(dom?.nodeName).toUpperCase() !== 'INPUT') return;
          const type = String(attrs.type || '').toLowerCase();
          fields.set(this.refKey(frame.sessionId, node.backendDOMNodeId), {
            password: type === 'password',
            file: type === 'file',
          });
        } catch { /* node went away */ }
      }));
      const { lines } = formatSnapshot(root, {
        refFor,
        fieldInfo: (frame, node) => fields.get(this.refKey(frame.sessionId, node.backendDOMNodeId)) || {},
      });
      this.refs = nextRefs;
      this.cache = { lines, at: Date.now() };
    }
    const page = pageLines(this.cache.lines, { offset, limit, maxChars });
    return { ...page, refCount: this.refs.size };
  }

  // ── Finding elements ──────────────────────────────────────────────────────

  async resolveTarget({ ref, selector } = {}) {
    await this.ensure();
    if (ref) {
      const key = String(ref).trim().replace(/^\[|\]$/g, '').toLowerCase();
      const entry = this.refs.get(key);
      if (!entry) {
        throw new Error(`There is no element ${key} on the page now. Refs last until the next snapshot or page change: take a new preview_snapshot.`);
      }
      return { ...entry, ref: key };
    }
    if (selector) {
      const doc = await this.send('DOM.getDocument', { depth: 0 });
      const found = await this.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: String(selector) });
      if (!found?.nodeId) throw new Error(`No element matches the selector ${selector}.`);
      const described = await this.send('DOM.describeNode', { nodeId: found.nodeId });
      return {
        sessionId: null,
        frameId: await this.mainFrameId(),
        backendNodeId: described.node.backendNodeId,
        role: '',
        name: '',
        selector: String(selector),
      };
    }
    throw new Error('Say which element: pass a ref from preview_snapshot (or a CSS selector).');
  }

  async describe(target) {
    const { node } = await this.send('DOM.describeNode', { backendNodeId: target.backendNodeId }, target.sessionId);
    return node || {};
  }

  async isolatedContext(sessionId, frameId) {
    const key = `${sessionId || 'main'}|${frameId}`;
    if (this.worlds.has(key)) return this.worlds.get(key);
    const world = await this.send('Page.createIsolatedWorld', { frameId, worldName: WORLD_NAME, grantUniveralAccess: false }, sessionId);
    this.worlds.set(key, world.executionContextId);
    return world.executionContextId;
  }

  /** Run fn (a function source) with `this` = the target node, in an isolated world. */
  async callOn(target, functionDeclaration, args = [], { retry = true } = {}) {
    try {
      const contextId = await this.isolatedContext(target.sessionId, target.frameId);
      const { object } = await this.send('DOM.resolveNode', { backendNodeId: target.backendNodeId, executionContextId: contextId }, target.sessionId);
      const result = await this.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration,
        arguments: args.map((value) => (value && value.objectId ? { objectId: value.objectId } : { value })),
        returnByValue: true,
        awaitPromise: true,
      }, target.sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Page script failed');
      return result.result?.value;
    } catch (err) {
      if (retry && /context|Cannot find|No node/i.test(String(err.message))) {
        this.worlds.delete(`${target.sessionId || 'main'}|${target.frameId}`);
        return this.callOn(target, functionDeclaration, args, { retry: false });
      }
      throw err;
    }
  }

  /** Facts the safety check needs, read from the DOM. */
  async targetFacts(target) {
    const node = await this.describe(target);
    let formHasPayment = false;
    if (String(node.nodeName).toUpperCase() === 'BUTTON' || String(node.nodeName).toUpperCase() === 'INPUT') {
      formHasPayment = await this.callOn(target, `function () {
        var form = this.form || (this.closest && this.closest('form'));
        if (!form) return false;
        var fields = form.querySelectorAll('input');
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          var words = [f.autocomplete, f.name, f.id, f.getAttribute('aria-label'), f.placeholder].join(' ').toLowerCase();
          if (/(^|\\s)cc-/.test(f.autocomplete || '') || /card ?number|cardnumber|cvc|cvv|security code|expir/.test(words)) return true;
        }
        return false;
      }`).catch(() => false);
    }
    let name = target.name || '';
    if (!name && String(node.nodeName).toUpperCase() !== 'INPUT') {
      name = await this.callOn(target, `function () {
        var el = this.nodeType === 3 ? this.parentElement : this;
        if (!el) return '';
        return String(el.getAttribute('aria-label') || el.innerText || el.value || el.title || '').trim().slice(0, 120);
      }`).catch(() => '');
    }
    return { nodeName: node.nodeName, attributes: node.attributes, nodeType: node.nodeType, name, formHasPayment };
  }

  async classify(target, action) {
    const facts = await this.targetFacts(target);
    const classification = classifyTarget({
      action,
      role: target.role,
      name: facts.name,
      nodeName: facts.nodeName,
      attributes: facts.attributes,
      formHasPayment: facts.formHasPayment,
    });
    return { classification, facts };
  }

  /** The element a text-node ref belongs to. */
  async elementTarget(target) {
    const node = await this.describe(target);
    if (node.nodeType !== 3) return target;
    const contextId = await this.isolatedContext(target.sessionId, target.frameId);
    const { object } = await this.send('DOM.resolveNode', { backendNodeId: target.backendNodeId, executionContextId: contextId }, target.sessionId);
    const parent = await this.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function () { return this.parentElement; }' }, target.sessionId);
    if (!parent?.result?.objectId) return target;
    const described = await this.send('DOM.describeNode', { objectId: parent.result.objectId }, target.sessionId);
    return { ...target, backendNodeId: described.node.backendNodeId };
  }

  /** Offset of a session's frame within the page (for screenshots). */
  async frameOffset(sessionId) {
    let x = 0;
    let y = 0;
    let current = sessionId;
    for (let guard = 0; current && guard < 8; guard++) {
      const info = this.sessions.get(current);
      if (!info) break;
      const owner = await this.send('DOM.getFrameOwner', { frameId: info.targetId }, info.parentSessionId);
      const box = await this.send('DOM.getBoxModel', { backendNodeId: owner.backendNodeId }, info.parentSessionId);
      x += box.model.content[0];
      y += box.model.content[1];
      current = info.parentSessionId;
    }
    return { x, y };
  }

  async scrollOwnersIntoView(sessionId) {
    let current = sessionId;
    for (let guard = 0; current && guard < 8; guard++) {
      const info = this.sessions.get(current);
      if (!info) break;
      try {
        const owner = await this.send('DOM.getFrameOwner', { frameId: info.targetId }, info.parentSessionId);
        await this.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: owner.backendNodeId }, info.parentSessionId);
      } catch { /* best effort */ }
      current = info.parentSessionId;
    }
  }

  /** Scroll the element into view; its centre in its own frame's coordinates. */
  async point(target) {
    await this.scrollOwnersIntoView(target.sessionId);
    try {
      await this.send('DOM.scrollIntoViewIfNeeded', { backendNodeId: target.backendNodeId }, target.sessionId);
    } catch { /* not scrollable, or a text node */ }
    let box;
    try {
      box = await this.send('DOM.getBoxModel', { backendNodeId: target.backendNodeId }, target.sessionId);
    } catch {
      throw new Error('That element is not on screen (it may be hidden or removed). Take a new snapshot.');
    }
    const center = quadCenter(box?.model?.content) || quadCenter(box?.model?.border);
    if (!center) throw new Error('That element has no size on screen (it may be hidden). Take a new snapshot.');
    return center;
  }

  /**
   * Is the element itself at that point, or is something on top of it?
   * Checked by the browser's own hit test, so an invisible element placed
   * over a harmless button can't take the click.
   */
  async hitCheck(target, { x, y }) {
    let hit;
    try {
      hit = await this.send('DOM.getNodeForLocation', { x: Math.round(x), y: Math.round(y), includeUserAgentShadowDOM: false, ignorePointerEventsNone: false }, target.sessionId);
    } catch {
      return { ok: true };
    }
    if (!hit?.backendNodeId || hit.backendNodeId === target.backendNodeId) return { ok: true };
    if (hit.frameId && target.frameId && hit.frameId !== target.frameId) {
      return { ok: false, cover: 'an embedded frame' };
    }
    try {
      const contextId = await this.isolatedContext(target.sessionId, target.frameId);
      const { object: hitObject } = await this.send('DOM.resolveNode', { backendNodeId: hit.backendNodeId, executionContextId: contextId }, target.sessionId);
      const related = await this.callOn(target, `function (hit) {
        var t = this.nodeType === 3 ? this.parentElement : this;
        var h = hit && hit.nodeType === 3 ? hit.parentElement : hit;
        if (!t || !h) return false;
        if (t === h || t.contains(h)) return true;
        // A label for this field, or the field inside this label.
        if (h.control === t || (t.labels && Array.prototype.indexOf.call(t.labels, h) >= 0)) return true;
        // The hit is a wrapper of the target (e.g. an icon with pointer-events: none).
        return h.contains(t) && h !== document.body && h !== document.documentElement;
      }`, [{ objectId: hitObject.objectId }]);
      if (related) return { ok: true };
    } catch { return { ok: true }; }
    let cover = 'another element';
    try {
      const { node } = await this.send('DOM.describeNode', { backendNodeId: hit.backendNodeId }, target.sessionId);
      cover = describeDomNode(node);
    } catch { /* keep generic */ }
    return { ok: false, cover };
  }

  async mouse(sessionId, events, timeoutMs = 4000) {
    for (const event of events) {
      await withTimeout(this.send('Input.dispatchMouseEvent', event, sessionId), timeoutMs, 'The page did not take the mouse event.');
    }
  }

  // ── Did a real event arrive? ──────────────────────────────────────────────
  // A page that is not being drawn (its window is hidden) may not process
  // real input. A listener in Asyncat's isolated world (invisible to the
  // page) tells whether the event reached the page; if not, the action is
  // done through the DOM instead and reported as simulated.

  async armProbe(target, type) {
    const id = `p${Math.random().toString(36).slice(2)}`;
    await this.callOn(target, `function (type, id) {
      var w = window;
      w.__asyncatProbes = w.__asyncatProbes || {};
      w.__asyncatProbes[id] = false;
      w.addEventListener(type, function () { w.__asyncatProbes[id] = true; }, { capture: true, once: true });
    }`, [type, id]);
    return id;
  }

  async probeFired(target, id, timeoutMs = 700) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let fired;
      try {
        fired = await this.callOn(target, 'function (id) { return Boolean(window.__asyncatProbes && window.__asyncatProbes[id]); }', [id]);
      } catch {
        return true; // the page went away: the action did something
      }
      if (fired) return true;
      await sleep(50);
    }
    return false;
  }

  async simulatedClick(element, point, { button = 'left', clickCount = 1 } = {}) {
    const buttonIndex = button === 'right' ? 2 : button === 'middle' ? 1 : 0;
    await this.callOn(element, `function (x, y, button, count) {
      var el = this.nodeType === 3 ? this.parentElement : this;
      if (!el) return false;
      var base = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: button, detail: count };
      var P = window.PointerEvent || window.MouseEvent;
      function fire(Type, name, extra) {
        try { el.dispatchEvent(new Type(name, Object.assign({}, base, extra || {}))); } catch (e) { /* old engine */ }
      }
      fire(P, 'pointerover', { pointerType: 'mouse', isPrimary: true });
      fire(MouseEvent, 'mouseover');
      fire(P, 'pointerdown', { pointerType: 'mouse', isPrimary: true, buttons: 1 });
      fire(MouseEvent, 'mousedown', { buttons: 1 });
      if (typeof el.focus === 'function') el.focus({ preventScroll: true });
      fire(P, 'pointerup', { pointerType: 'mouse', isPrimary: true, buttons: 0 });
      fire(MouseEvent, 'mouseup', { buttons: 0 });
      if (button === 0) el.click();
      else if (button === 2) fire(MouseEvent, 'contextmenu', { buttons: 0 });
      if (count === 2) fire(MouseEvent, 'dblclick', { detail: 2 });
      return true;
    }`, [point.x, point.y, buttonIndex, clickCount]);
  }

  /**
   * Click an element. rendered: the page is being drawn, so real mouse
   * events work; otherwise (and if they don't arrive) the click goes
   * through the DOM. Returns { input: 'real' | 'simulated' }.
   */
  async click(target, { button = 'left', clickCount = 1, modifiers = 0, rendered = true } = {}) {
    const element = await this.elementTarget(target);
    const point = await this.point(element);
    const hit = await this.hitCheck(element, point);
    if (!hit.ok) {
      throw new Error(`Something else is on top of that element (${hit.cover}). Close or scroll past it (for example a cookie banner or dialog), then try again.`);
    }
    // A cross-site frame takes input through its own session, drawn or not.
    if (rendered || element.sessionId) {
      const probe = await this.armProbe(element, 'mousedown').catch(() => null);
      try {
        const base = { x: point.x, y: point.y, modifiers };
        if (rendered) await this.mouse(element.sessionId, [{ type: 'mouseMoved', ...base }], 2000);
        for (let n = 1; n <= clickCount; n++) {
          await this.mouse(element.sessionId, [
            { type: 'mousePressed', ...base, button, buttons: button === 'right' ? 2 : button === 'middle' ? 4 : 1, clickCount: n },
            { type: 'mouseReleased', ...base, button, buttons: 0, clickCount: n },
          ]);
        }
        if (!probe || await this.probeFired(element, probe)) return { input: 'real', point };
      } catch { /* fall through to the DOM */ }
    }
    await this.simulatedClick(element, point, { button, clickCount });
    return { input: 'simulated', point };
  }

  async hover(target, { rendered = true } = {}) {
    const element = await this.elementTarget(target);
    const point = await this.point(element);
    if (rendered || element.sessionId) {
      const moved = await this.mouse(element.sessionId, [{ type: 'mouseMoved', x: point.x, y: point.y }], 2000).then(() => true, () => false);
      if (moved) return { input: 'real', point };
    }
    await this.callOn(element, `function (x, y) {
      var el = this.nodeType === 3 ? this.parentElement : this;
      var base = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y };
      var P = window.PointerEvent || window.MouseEvent;
      [[P, 'pointerover'], [P, 'pointerenter'], [MouseEvent, 'mouseover'], [MouseEvent, 'mouseenter'], [P, 'pointermove'], [MouseEvent, 'mousemove']].forEach(function (pair) {
        try { el.dispatchEvent(new pair[0](pair[1], Object.assign({}, base, pair[1].indexOf('enter') >= 0 ? { bubbles: false } : {}))); } catch (e) { /* old engine */ }
      });
    }`, [point.x, point.y]);
    return { input: 'simulated', point };
  }

  async focus(target, { rendered = true } = {}) {
    const element = await this.elementTarget(target);
    await this.scrollOwnersIntoView(element.sessionId);
    try {
      await this.send('DOM.focus', { backendNodeId: element.backendNodeId }, element.sessionId);
    } catch {
      await this.click(element, { rendered });
    }
    return element;
  }

  /** Press keys. Returns { input: 'real' | 'simulated' }. */
  async key(combo, { repeat = 1, rendered = true } = {}) {
    const parsed = parseKeyCombo(combo, { platform: this.platform });
    if (!parsed) throw new Error(`Unknown key "${combo}". Use names like Enter, Tab, Escape, ArrowDown, Backspace, or a combo like Control+A.`);
    const times = Math.max(1, Math.min(Number(repeat) || 1, 50));
    const focused = await this.focusedTarget().catch(() => null);
    if (rendered) {
      const probe = focused ? await this.armProbe(focused, 'keydown').catch(() => null) : null;
      try {
        for (let i = 0; i < times; i++) {
          const down = {
            type: parsed.text ? 'keyDown' : 'rawKeyDown',
            key: parsed.key,
            code: parsed.code,
            windowsVirtualKeyCode: parsed.keyCode,
            nativeVirtualKeyCode: parsed.keyCode,
            modifiers: parsed.modifiers,
          };
          if (parsed.text) { down.text = parsed.text; down.unmodifiedText = parsed.text; }
          if (parsed.commands) down.commands = parsed.commands;
          await withTimeout(this.send('Input.dispatchKeyEvent', down), 4000, 'key');
          await withTimeout(this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: parsed.key, code: parsed.code, windowsVirtualKeyCode: parsed.keyCode, nativeVirtualKeyCode: parsed.keyCode, modifiers: parsed.modifiers }), 4000, 'key');
          if (i === 0 && probe && !(await this.probeFired(focused, probe))) throw new Error('not delivered');
        }
        return { input: 'real', parsed };
      } catch { /* fall through to the DOM */ }
    }
    for (let i = 0; i < times; i++) await this.simulatedKey(parsed, focused);
    return { input: 'simulated', parsed };
  }

  /** A key press done through the DOM, for pages that aren't being drawn. */
  async simulatedKey(parsed, focused) {
    const plainText = parsed.text && !(parsed.modifiers & (1 | 2 | 4)) && parsed.key !== 'Enter' && parsed.key !== ' ';
    if (plainText) {
      await this.send('Input.insertText', { text: parsed.text });
      return;
    }
    const frameId = focused?.frameId || await this.mainFrameId();
    const contextId = await this.isolatedContext(focused?.sessionId || null, frameId);
    await this.send('Runtime.evaluate', {
      contextId,
      expression: `(${SIMULATED_KEY})(${JSON.stringify(parsed.key)}, ${JSON.stringify(parsed.code)}, ${Number(parsed.keyCode) || 0}, ${Number(parsed.modifiers) || 0})`,
    }, focused?.sessionId || null);
  }

  async typeText(target, text, { clear = true, rendered = true } = {}) {
    const element = await this.focus(target, { rendered });
    const value = String(text ?? '');
    if (clear) {
      // Select what's there; the typed text then replaces it.
      const selected = await this.callOn(element, `function () {
        var el = this;
        if (typeof el.select === 'function' && 'value' in el) { el.select(); return el.value ? 'selected' : 'empty'; }
        if (el.isContentEditable) {
          var range = document.createRange(); range.selectNodeContents(el);
          var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
          return el.textContent ? 'selected' : 'empty';
        }
        return 'none';
      }`).catch(() => 'none');
      if (selected === 'selected' && !value) {
        await this.callOn(element, 'function () { document.execCommand("delete"); }').catch(() => {});
      }
    }
    // insertText goes in as one trusted edit (it works even when the page
    // isn't drawn); long text in chunks.
    for (let i = 0; i < value.length; i += 2000) {
      await this.send('Input.insertText', { text: value.slice(i, i + 2000) });
    }
    return element;
  }

  async fieldValue(target) {
    return this.callOn(target, `function () {
      var el = this;
      if (el.type === 'password') return null;
      if ('value' in el) return String(el.value).slice(0, 200);
      if (el.isContentEditable) return String(el.innerText).slice(0, 200);
      return null;
    }`).catch(() => null);
  }

  async selectOption(target, values) {
    const element = await this.elementTarget(target);
    const result = await this.callOn(element, `function (values) {
      if (!(this instanceof HTMLSelectElement)) return { error: 'not-select' };
      var wanted = values.map(function (v) { return String(v).trim().toLowerCase(); });
      var chosen = [];
      for (var i = 0; i < this.options.length; i++) {
        var o = this.options[i];
        var match = wanted.indexOf(String(o.value).toLowerCase()) >= 0 || wanted.indexOf(String(o.label || o.text).trim().toLowerCase()) >= 0;
        if (this.multiple) o.selected = match;
        else if (match && chosen.length === 0) o.selected = true;
        if (match && (this.multiple || chosen.length === 0)) chosen.push(o.label || o.value);
      }
      if (!chosen.length) {
        return { error: 'no-match', options: Array.prototype.slice.call(this.options, 0, 40).map(function (o) { return o.label || o.value; }) };
      }
      this.dispatchEvent(new Event('input', { bubbles: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
      return { selected: chosen };
    }`, [values]);
    if (result?.error === 'not-select') {
      throw new Error('That element is not a drop-down list (<select>). For custom menus, click it and then click the option.');
    }
    if (result?.error === 'no-match') {
      throw new Error(`None of the options match. Options include: ${(result.options || []).join(', ')}`);
    }
    return result?.selected || [];
  }

  async viewport() {
    const metrics = await this.send('Page.getLayoutMetrics');
    const css = metrics.cssLayoutViewport || metrics.layoutViewport || {};
    const content = metrics.cssContentSize || metrics.contentSize || {};
    const visual = metrics.cssVisualViewport || metrics.visualViewport || {};
    return {
      width: css.clientWidth || 1280,
      height: css.clientHeight || 800,
      scrollX: visual.pageX || 0,
      scrollY: visual.pageY || 0,
      contentWidth: content.width || css.clientWidth || 1280,
      contentHeight: content.height || css.clientHeight || 800,
    };
  }

  /**
   * Scroll like a mouse wheel over the middle of the page. A page that is not
   * on screen doesn't draw, and wheel events wait for drawing, so `onScreen`
   * false scrolls the element under that point (or the page) directly.
   */
  async wheel({ deltaX = 0, deltaY = 0, onScreen = true } = {}) {
    const view = await this.viewport();
    const x = Math.round(view.width / 2);
    const y = Math.round(view.height / 2);
    let wheeled = false;
    if (onScreen) {
      wheeled = await withTimeout(
        this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY }),
        2500,
        'wheel',
      ).then(() => true, () => false);
    }
    if (!wheeled) {
      const frameId = await this.mainFrameId();
      const contextId = await this.isolatedContext(null, frameId);
      await this.send('Runtime.evaluate', {
        contextId,
        expression: `(function (x, y, dx, dy) {
          var el = document.elementFromPoint(x, y);
          function scrollable(node) {
            if (!node || node === document.body || node === document.documentElement) return false;
            var style = getComputedStyle(node);
            return (dy && node.scrollHeight > node.clientHeight + 1 && /(auto|scroll|overlay)/.test(style.overflowY))
              || (dx && node.scrollWidth > node.clientWidth + 1 && /(auto|scroll|overlay)/.test(style.overflowX));
          }
          while (el && !scrollable(el)) el = el.parentElement;
          (el || document.scrollingElement || document.documentElement).scrollBy(dx, dy);
        })(${x}, ${y}, ${Number(deltaX) || 0}, ${Number(deltaY) || 0})`,
      });
    }
    await sleep(350);
    return this.viewport();
  }

  async scrollTo(target) {
    await this.point(await this.elementTarget(target));
    return this.viewport();
  }

  /** Clip (CSS pixels, relative to the viewport) for an element screenshot. */
  async elementClip(target) {
    const element = await this.elementTarget(target);
    const center = await this.point(element);
    const offset = await this.frameOffset(element.sessionId);
    return { x: center.left + offset.x, y: center.top + offset.y, width: center.width, height: center.height };
  }

  /** The element that has keyboard focus, as a target (for key presses). */
  async focusedTarget() {
    await this.ensure();
    let sessionId = null;
    let frameId = await this.mainFrameId();
    // Follow focus into frames: the focused element of a page whose focus is
    // in an iframe is the <iframe> itself.
    for (let depth = 0; depth < 5; depth++) {
      const contextId = await this.isolatedContext(sessionId, frameId);
      const evaluated = await this.send('Runtime.evaluate', { expression: 'document.activeElement', contextId }, sessionId);
      if (!evaluated?.result?.objectId) return null;
      const { node } = await this.send('DOM.describeNode', { objectId: evaluated.result.objectId }, sessionId);
      if (!node?.backendNodeId || ['BODY', 'HTML'].includes(String(node.nodeName).toUpperCase())) return null;
      if (['IFRAME', 'FRAME'].includes(String(node.nodeName).toUpperCase()) && node.frameId) {
        const oopif = this.sessionForFrame(node.frameId);
        sessionId = oopif || sessionId;
        frameId = node.frameId;
        continue;
      }
      return { sessionId, frameId, backendNodeId: node.backendNodeId, role: '', name: '' };
    }
    return null;
  }
}
