// den/src/agent/headlessBrowser.js
// ─── The agent's browser when the desktop app isn't running ─────────────────
// The browser tools (tools/previewBrowserTools.js) drive the desktop app's
// built-in browser. When the backend runs on its own there is no desktop
// app, so browserCommandQueue.js sends the same commands here instead: a
// headless Chrome (Chromium, Edge or Brave) through Puppeteer, with the same
// results, outline refs and approval questions, so the tools behave the same
// either way. Each chat or Cat gets its own throwaway browser profile, every
// request goes through the agent URL policy, and only handing a page to the
// user needs the desktop app (nobody can see this browser).

import { launchBrowser } from '../lib/browserLauncher.js';
import { childEnv } from './childEnv.js';
import { checkAgentUrl, guardPuppeteerPage } from './tools/urlPolicy.js';
import { currentScheduledRun, runInScheduledContext } from './scheduledRunContext.js';
import {
  classifyTarget, describeSensitiveAction, formatOutline, pageLines, pageText, parseKeyCombo, PAYMENT_FIELD_PATTERN,
} from './headlessSnapshot.js';

export const HANDOVER_NEEDS_DESKTOP = 'Handing a page to the user needs the Asyncat desktop app. The backend is running without it, so the agent uses a headless browser nobody can see. Ask the user in the chat instead, or carry on without that step.';
export const NO_HEADLESS_BROWSER = 'The agent\'s browser needs the Asyncat desktop app, or Chrome, Chromium, Edge or Brave installed for a headless one, and neither was found. Use fetch_url or web_search instead.';

const VIEWPORT = { width: 1280, height: 800 };
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const IDLE_MS = 10 * 60 * 1000;
const MAX_SCREENSHOT_HEIGHT = 12000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]);
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// Facts about an element for the approval rules, read in the page.
function elementFacts(el, paymentPattern) {
  const node = el.nodeType === 1 ? el : el.parentElement;
  if (!node) return { nodeName: '', attributes: {}, name: '', formHasPayment: false };
  const attributes = {};
  for (const attr of Array.from(node.attributes || [])) attributes[attr.name.toLowerCase()] = attr.value;
  const payment = new RegExp(paymentPattern, 'i');
  const form = node.form || node.closest('form');
  const formHasPayment = Boolean(form) && Array.from(form.querySelectorAll('input')).some((input) => {
    const words = [input.name, input.id, input.placeholder, input.getAttribute('aria-label')].filter(Boolean).join(' ').replace(/[_-]+/g, ' ');
    return /\bcc-/.test(input.autocomplete || '') || payment.test(words);
  });
  const name = (node.getAttribute('aria-label') || node.innerText || node.value || node.title || '').trim().slice(0, 120);
  return { nodeName: node.nodeName, attributes, name, formHasPayment };
}

export class HeadlessBrowser {
  constructor({ launch = launchBrowser } = {}) {
    this.launch = launch;
    this.browser = null;
    this.launching = null;
    this.owners = new Map(); // owner → { context, pages, current, refs, cache, dialogs, lastUsed, run }
    this.queues = new Map();
    this.sweeper = null;
  }

  /** Run one command for an agent; commands for one agent run in order. */
  command(action, params = {}, { timeoutMs = 30_000 } = {}) {
    const owner = String(params.owner || 'default');
    const run = currentScheduledRun();
    const previous = this.queues.get(owner) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => withTimeout(
      this.#run(owner, String(action || ''), params, run),
      timeoutMs,
      'The browser took too long to answer.',
    ));
    this.queues.set(owner, next);
    next.catch(() => {}).finally(() => {
      if (this.queues.get(owner) === next) this.queues.delete(owner);
    });
    return next;
  }

  async close() {
    clearInterval(this.sweeper);
    this.sweeper = null;
    const browser = this.browser;
    this.browser = null;
    this.owners.clear();
    if (browser) await browser.close().catch(() => {});
  }

  // ── Browser and profiles ─────────────────────────────────────────────────

  async #ensureBrowser() {
    if (this.browser?.connected !== false && this.browser) return this.browser;
    if (!this.launching) {
      this.launching = (async () => {
        let browser;
        try {
          // Like every program the agent starts, it gets den's environment without saved keys.
          browser = await this.launch({ headless: true, env: childEnv(), args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
        } catch (err) {
          throw new Error(`${NO_HEADLESS_BROWSER} (${err?.message || err})`);
        }
        browser.on?.('disconnected', () => {
          if (this.browser === browser) {
            this.browser = null;
            this.owners.clear();
          }
        });
        this.browser = browser;
        if (!this.sweeper) {
          this.sweeper = setInterval(() => this.#sweep(), 60_000);
          this.sweeper.unref?.();
        }
        return browser;
      })().finally(() => { this.launching = null; });
    }
    return this.launching;
  }

  async #sweep() {
    const now = Date.now();
    for (const [owner, state] of this.owners) {
      if (now - state.lastUsed < IDLE_MS || this.queues.has(owner)) continue;
      this.owners.delete(owner);
      await state.context.close().catch(() => {});
    }
    if (!this.owners.size && this.browser && !this.queues.size) await this.close();
  }

  async #owner(owner, run) {
    let state = this.owners.get(owner);
    if (!state) {
      const browser = await this.#ensureBrowser();
      const context = await browser.createBrowserContext();
      state = { context, pages: [], current: null, front: null, refs: new Map(), cache: null, dialogs: [], opened: [], scratch: new Set(), lastUsed: Date.now(), run };
      this.owners.set(owner, state);
      // Pages the page opens (target=_blank, window.open) join the agent's tabs.
      context.on?.('targetcreated', async (target) => {
        if (target.type() !== 'page' || !target.opener()) return;
        const page = await target.page().catch(() => null);
        if (!page || state.pages.includes(page)) return;
        // A page read by its address opens none.
        if ([...state.scratch].some((scratch) => scratch.target() === target.opener())) {
          await page.close().catch(() => {});
          return;
        }
        await this.#preparePage(state, page);
        // A pop-up's first page may load before the guard is in place: one
        // the agent could not open itself is closed straight away.
        const url = page.url();
        if (/^https?:/i.test(url)) {
          const check = state.run ? await runInScheduledContext(state.run, () => checkAgentUrl(url)) : await checkAgentUrl(url);
          if (!check.ok) {
            await page.close().catch(() => {});
            return;
          }
        }
        state.pages.push(page);
        state.opened.push(page);
        state.front = page; // a new tab comes to the front
      });
    }
    state.lastUsed = Date.now();
    if (run) state.run = run;
    return state;
  }

  async #preparePage(state, page, { scratch = false } = {}) {
    if (page.__asyncatReady) return;
    page.__asyncatReady = true;
    await page.setViewport(VIEWPORT).catch(() => {});
    await page.setUserAgent(USER_AGENT).catch(() => {});
    // A Cat's sites apply to every request, including redirects and pop-ups.
    await guardPuppeteerPage(page, { scheduledRun: () => state.run });
    // Alerts get OK; confirmations and prompts are cancelled, so a page can't
    // get "OK" on something like "Delete everything?". The agent hears about
    // them after its next step (not for a page read by its address).
    page.on('dialog', (dialog) => {
      const accept = dialog.type() === 'alert';
      if (!scratch) {
        state.dialogs.push({ type: dialog.type(), message: String(dialog.message() || '').slice(0, 300), answered: accept ? 'ok' : 'cancel' });
        if (state.dialogs.length > 5) state.dialogs.shift();
      }
      (accept ? dialog.accept() : dialog.dismiss()).catch(() => {});
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && page === state.current) {
        state.refs = new Map();
        state.cache = null;
      }
    });
    page.on('close', () => {
      state.pages = state.pages.filter((p) => p !== page);
      if (state.current === page) {
        state.current = state.pages[state.pages.length - 1] || null;
        state.refs = new Map();
        state.cache = null;
      }
    });
  }

  async #newPage(state) {
    const page = await state.context.newPage();
    await this.#preparePage(state, page);
    if (!state.pages.includes(page)) state.pages.push(page);
    state.opened = state.opened.filter((p) => p !== page);
    this.#setCurrent(state, page);
    return page;
  }

  #setCurrent(state, page) {
    if (state.current !== page) {
      state.refs = new Map();
      state.cache = null;
    }
    state.current = page;
  }

  /**
   * Load url in a tab of the agent's profile that only read(page) uses and
   * that closes afterwards. The agent's own tab stays as it was, and reads of
   * several pages at once can't mix them up.
   */
  async #inScratchPage(state, url, read) {
    const page = await state.context.newPage();
    state.scratch.add(page);
    try {
      await this.#preparePage(state, page, { scratch: true });
      // Only the page in front is drawn (for screenshots).
      await page.bringToFront().catch(() => {});
      state.front = page;
      const loaded = await this.#load(page, String(url || ''));
      if (loaded.loadError) return { success: false, ...loaded, error: loaded.loadError };
      return await read(page);
    } finally {
      state.scratch.delete(page);
      await page.close().catch(() => {});
      if (state.front === page) state.front = null;
    }
  }

  /** The agent's current page, in front: a page behind a pop-up gets no animation frames. */
  async #front(state, page) {
    if (state.front !== page) {
      await page.bringToFront().catch(() => {});
      state.front = page;
    }
    return page;
  }

  async #requirePage(state) {
    if (!state.current || state.current.isClosed()) throw new Error('No page is open in the browser. Open one with preview_navigate first.');
    return this.#front(state, state.current);
  }

  // ── Pages ────────────────────────────────────────────────────────────────

  async #info(page) {
    return { url: page.url(), title: await page.title().catch(() => '') };
  }

  async #load(page, url) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    } catch (err) {
      const message = String(err?.message || err);
      if (/ERR_BLOCKED_BY_CLIENT/.test(message)) return { ...(await this.#info(page)), loadError: `The agent may not open ${url}.` };
      if (!/timeout/i.test(message)) return { ...(await this.#info(page)), loadError: `The page could not be loaded (${message.split('\n')[0]})` };
      return { ...(await this.#info(page)), note: 'The page is still loading.' };
    }
    await page.waitForNetworkIdle({ idleTime: 400, timeout: 2500 }).catch(() => {});
    return this.#info(page);
  }

  /** After a click or key press: wait if it started loading a page. */
  async #settle(state, page, before) {
    await sleep(200);
    if (page.url() !== before.url) {
      // The wait starts again when the navigation replaces the document it was
      // running in, so the title is read from the new page, not mid-way.
      for (let tries = 0; tries < 3; tries += 1) {
        try {
          await page.waitForFunction(() => document.readyState !== 'loading', { timeout: 10_000, polling: 100 });
          break;
        } catch (err) {
          if (!/context was destroyed|navigat/i.test(String(err?.message || err))) break;
        }
      }
      await sleep(150);
    }
    const result = { ...(await this.#info(page)), navigated: page.url() !== before.url };
    if (state.opened.length) {
      result.opened = state.opened.map((p) => ({ index: state.pages.indexOf(p), url: p.url(), kind: 'tab' }));
      result.note = 'The page opened a new tab. Use preview_list_tabs and preview_switch_tab to work in it.';
      state.opened = [];
    }
    if (state.dialogs.length) {
      result.dialogs = state.dialogs;
      state.dialogs = [];
    }
    return result;
  }

  // ── Elements ─────────────────────────────────────────────────────────────

  async #target(state, page, { ref, selector } = {}) {
    let handle;
    let role = '';
    let name = '';
    if (ref) {
      const entry = state.refs.get(String(ref));
      if (!entry) throw new Error(`There is no element ${ref} on the page now. Take a new preview_snapshot and use a ref from it.`);
      handle = await entry.node.elementHandle().catch(() => null);
      if (!handle) throw new Error(`Element ${ref} is gone from the page. Take a new preview_snapshot.`);
      role = entry.node.role || '';
      name = entry.node.name || '';
    } else if (selector) {
      handle = await page.waitForSelector(String(selector), { timeout: 5000 }).catch(() => null);
      if (!handle) throw new Error(`Nothing on the page matches ${selector}.`);
    } else {
      throw new Error('Say which element: pass a ref from preview_snapshot (or a CSS selector).');
    }
    // A text ref stands for the element that holds the text.
    const element = (await handle.evaluateHandle((node) => (node.nodeType === 1 ? node : node.parentElement))).asElement();
    if (!element) throw new Error('That element can\'t be used.');
    return { element, role, name, key: String(ref || selector) };
  }

  /** null when the action may go ahead, or a needsApproval result. */
  async #sensitive(page, target, action, approvals) {
    const facts = await target.element.evaluate(elementFacts, PAYMENT_FIELD_PATTERN).catch(() => null);
    if (!facts) return null;
    const classification = classifyTarget({
      action, role: target.role, name: target.name || facts.name, nodeName: facts.nodeName, attributes: facts.attributes, formHasPayment: facts.formHasPayment,
    });
    if (!classification) return null;
    const host = hostOf(page.url());
    const key = `${classification.kind}:${target.key}:${host}`;
    if (Array.isArray(approvals) && approvals.includes(key)) return null;
    return {
      success: false,
      needsApproval: true,
      approval: { key, kind: classification.kind, description: describeSensitiveAction(classification, { host, action }) },
    };
  }

  async #snapshot(state, page, { offset = 0, limit = 400 } = {}) {
    const start = Number(offset) || 0;
    if (start === 0 || !state.cache) {
      const tree = await page.accessibility.snapshot({ interestingOnly: true, includeIframes: true });
      const attributes = await this.#linkAndFieldAttributes(page);
      const refs = new Map();
      let count = 0;
      const { lines } = formatOutline(tree, {
        refFor: (node) => {
          count += 1;
          const ref = `e${count}`;
          refs.set(ref, { node });
          return ref;
        },
        attributesFor: (node) => attributes.get(node.backendNodeId) || {},
        pageUrl: page.url(),
      });
      state.refs = refs;
      state.cache = lines;
    }
    return pageLines(state.cache, { offset: start, limit, maxChars: 12000 });
  }

  /** href and type of links, buttons and fields, by backend node id. */
  async #linkAndFieldAttributes(page) {
    const map = new Map();
    let client;
    try {
      client = await page.createCDPSession();
      const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
      const walk = (node) => {
        if (!node) return;
        if (/^(a|input|textarea|button|select)$/i.test(node.localName || '') && node.attributes?.length) {
          const attrs = {};
          for (let i = 0; i + 1 < node.attributes.length; i += 2) attrs[String(node.attributes[i]).toLowerCase()] = String(node.attributes[i + 1]);
          map.set(node.backendNodeId, attrs);
        }
        for (const child of node.children || []) walk(child);
        for (const shadow of node.shadowRoots || []) walk(shadow);
        if (node.contentDocument) walk(node.contentDocument);
      };
      walk(root);
    } catch { /* outline without addresses */ }
    await client?.detach().catch(() => {});
    return map;
  }

  async #typeInto(state, page, target, { text, clear = true, submit = false, approvals }) {
    const blocked = await this.#sensitive(page, target, 'type', approvals);
    if (blocked) return blocked;
    const before = { url: page.url() };
    await target.element.focus();
    if (clear) {
      await target.element.evaluate((el) => {
        if (typeof el.select === 'function' && 'value' in el) { el.select(); return; }
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await page.keyboard.press('Backspace');
    }
    await page.keyboard.type(String(text ?? ''), { delay: 5 });
    if (submit) {
      const blockedSubmit = await this.#sensitive(page, target, 'key', approvals);
      if (blockedSubmit) return blockedSubmit;
      await page.keyboard.press('Enter');
    }
    const value = await target.element.evaluate((el) => (el.type === 'password' ? null : ('value' in el ? el.value : el.textContent))).catch(() => null);
    return { success: true, ...(value !== null && value !== undefined ? { value: String(value).slice(0, 500) } : {}), ...(await this.#settle(state, page, before)) };
  }

  /**
   * The page's visible text, or only that of the elements a CSS selector
   * matches (or one attribute of each, one per line), in parts.
   */
  async #pageText(page, params) {
    const selector = typeof params.selector === 'string' && params.selector.trim() ? params.selector.trim() : null;
    const attribute = selector && typeof params.attribute === 'string' && params.attribute.trim() ? params.attribute.trim() : null;
    const found = await page.evaluate((sel, attr) => {
      if (!sel) return { text: document.body ? document.body.innerText : '', matches: null };
      const nodes = Array.from(document.querySelectorAll(sel));
      // An attribute comes one value per line; elements without it are skipped.
      const parts = attr
        ? nodes.map((node) => node.getAttribute(attr)).filter((value) => value !== null)
        : nodes.map((node) => node.innerText || node.textContent || '');
      return { text: parts.join(attr ? '\n' : '\n\n'), matches: nodes.length };
    }, selector, attribute);
    if (selector && !found.matches) return { success: false, ...(await this.#info(page)), error: `Nothing on the page matches ${selector}.` };
    const text = String(found.text || '').replace(/\n{3,}/g, '\n\n').trim();
    const part = pageText(text, { offset: params.offset, limit: params.limit || 12000 });
    return {
      success: true,
      ...(await this.#info(page)),
      ...(selector ? { selector, matches: found.matches } : {}),
      ...(attribute ? { attribute } : {}),
      text: part.text,
      offset: part.offset,
      nextOffset: part.nextOffset,
      totalChars: part.totalChars,
      truncated: part.truncated,
      ...(part.truncated ? { hint: `More text follows: call preview_get_text with offset ${part.nextOffset}.` } : {}),
    };
  }

  /** A JPEG of what is in view, of the whole page, or of one element. */
  async #photo(state, page, params) {
    let data;
    if (params.ref || params.selector) {
      const target = await this.#target(state, page, params);
      await target.element.scrollIntoView().catch(() => {});
      data = await target.element.screenshot({ type: 'jpeg', quality: 70, encoding: 'base64' });
    } else {
      const height = params.fullPage ? await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 0) : 0;
      data = height > MAX_SCREENSHOT_HEIGHT
        ? await page.screenshot({ type: 'jpeg', quality: 70, encoding: 'base64', captureBeyondViewport: true, clip: { x: 0, y: 0, width: VIEWPORT.width, height: MAX_SCREENSHOT_HEIGHT } })
        : await page.screenshot({ type: 'jpeg', quality: 70, encoding: 'base64', fullPage: Boolean(params.fullPage) });
    }
    return { success: true, ...(await this.#info(page)), dataUrl: `data:image/jpeg;base64,${data}`, format: 'image/jpeg' };
  }

  // ── Commands ─────────────────────────────────────────────────────────────

  async #run(owner, action, params, run) {
    if (action === 'handover_start' || action === 'handover_wait') throw new Error(HANDOVER_NEEDS_DESKTOP);
    const state = await this.#owner(owner, run);

    switch (action) {
      case 'navigate': {
        const page = await this.#front(state, state.current && !state.current.isClosed() ? state.current : await this.#newPage(state));
        const loaded = await this.#load(page, String(params.url || ''));
        return loaded.loadError ? { success: false, ...loaded, error: loaded.loadError } : { success: true, ...loaded };
      }

      case 'open_tab': {
        const page = await this.#front(state, await this.#newPage(state));
        if (!params.url) return { success: true, url: '' };
        const loaded = await this.#load(page, String(params.url));
        return loaded.loadError ? { success: false, ...loaded, error: loaded.loadError } : { success: true, ...loaded };
      }

      case 'list_tabs':
        return {
          success: true,
          tabs: await Promise.all(state.pages.map(async (page, index) => ({
            index, title: await page.title().catch(() => ''), url: page.url(), yours: page === state.current, shownToUser: false, openedBy: 'agent', kind: 'tab',
          }))),
        };

      case 'switch_tab': {
        const page = Number.isInteger(params.index) ? state.pages[params.index]
          : params.url ? state.pages.find((p) => p.url().includes(String(params.url))) : null;
        if (!page) throw new Error('No tab matches. Use preview_list_tabs to see the open tabs.');
        this.#setCurrent(state, page);
        return { success: true, ...(await this.#info(page)) };
      }

      case 'close_tab': {
        const page = Number.isInteger(params.index) ? state.pages[params.index] : state.current;
        if (!page) throw new Error('No tab matches. Use preview_list_tabs to see the open tabs.');
        const index = state.pages.indexOf(page);
        await page.close().catch(() => {});
        return { success: true, closed: index };
      }

      // preview_get_text and preview_screenshot with a url.
      case 'read_page':
        return this.#inScratchPage(state, params.url, (page) => this.#pageText(page, params));

      case 'screenshot_url':
        return this.#inScratchPage(state, params.url, (page) => this.#photo(state, page, { selector: params.selector, fullPage: params.fullPage }));
    }

    const page = await this.#requirePage(state);
    switch (action) {
      case 'back':
      case 'forward': {
        const before = { url: page.url() };
        const response = await (action === 'back' ? page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 }) : page.goForward({ waitUntil: 'domcontentloaded', timeout: 15_000 })).catch(() => null);
        if (!response && page.url() === before.url) return { success: false, error: `There is no page to go ${action} to.` };
        return { success: true, ...(await this.#settle(state, page, before)) };
      }

      case 'wait_for_reload': {
        await page.waitForNavigation({ waitUntil: 'load', timeout: 30_000 }).catch(() => {});
        return { success: true, ...(await this.#info(page)) };
      }

      case 'snapshot': {
        const snapshot = await this.#snapshot(state, page, params);
        return {
          success: true,
          ...(await this.#info(page)),
          snapshot: snapshot.text,
          offset: snapshot.offset,
          nextOffset: snapshot.nextOffset,
          totalLines: snapshot.totalLines,
          truncated: snapshot.truncated,
          ...(snapshot.truncated ? { hint: `More of the page follows: call preview_snapshot with offset ${snapshot.nextOffset}.` } : {}),
        };
      }

      case 'get_text':
        return this.#pageText(page, params);

      case 'screenshot':
        return this.#photo(state, page, params);

      case 'click': {
        const target = await this.#target(state, page, params);
        const blocked = await this.#sensitive(page, target, 'click', params.approvals);
        if (blocked) return blocked;
        const before = { url: page.url() };
        await target.element.click({
          button: params.button === 'right' ? 'right' : params.button === 'middle' ? 'middle' : 'left',
          count: params.double ? 2 : 1,
        });
        return { success: true, ...(await this.#settle(state, page, before)) };
      }

      case 'hover': {
        const target = await this.#target(state, page, params);
        await target.element.hover();
        await sleep(250);
        return { success: true, ...(await this.#info(page)) };
      }

      case 'type': {
        const target = await this.#target(state, page, params);
        return this.#typeInto(state, page, target, params);
      }

      case 'press_key': {
        const { modifiers, key } = parseKeyCombo(params.key);
        let target = null;
        if (params.ref || params.selector) {
          target = await this.#target(state, page, params);
          await target.element.focus();
        }
        const activates = key === 'Enter' || key === 'Space';
        const types = key.length === 1;
        if (activates || types) {
          if (!target) {
            const focused = (await page.evaluateHandle(() => document.activeElement)).asElement();
            if (focused) target = { element: focused, role: '', name: '', key: 'focused' };
          }
          if (target) {
            const blocked = await this.#sensitive(page, target, types && !modifiers.length ? 'type' : 'key', params.approvals);
            if (blocked) return blocked;
          }
        }
        const before = { url: page.url() };
        const times = Math.max(1, Math.min(Number(params.repeat) || 1, 50));
        for (let i = 0; i < times; i++) {
          for (const modifier of modifiers) await page.keyboard.down(modifier);
          await page.keyboard.press(key);
          for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier);
        }
        return { success: true, ...(await this.#settle(state, page, before)) };
      }

      case 'select_option': {
        const target = await this.#target(state, page, params);
        const values = (Array.isArray(params.values) ? params.values : [params.values]).filter((v) => v !== undefined && v !== null).map(String);
        if (!values.length) throw new Error('Say which option to choose (its label or value).');
        const before = { url: page.url() };
        const selected = await target.element.evaluate((el, wanted) => {
          if (el.tagName !== 'SELECT') return { error: 'That element is not a drop-down list (<select>). For custom menus, click the option instead.' };
          const options = Array.from(el.options);
          const picked = [];
          for (const value of wanted) {
            const lower = value.trim().toLowerCase();
            const option = options.find((o) => o.value === value || o.label.trim().toLowerCase() === lower || o.text.trim().toLowerCase() === lower);
            if (!option) return { error: `There is no option "${value}" in that list.` };
            picked.push(option);
          }
          if (!el.multiple) options.forEach((o) => { o.selected = false; });
          picked.forEach((o) => { o.selected = true; });
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { selected: picked.map((o) => o.label || o.text) };
        }, values);
        if (selected.error) throw new Error(selected.error);
        return { success: true, selected: selected.selected, ...(await this.#settle(state, page, before)) };
      }

      case 'scroll': {
        if (params.ref || params.selector) {
          const target = await this.#target(state, page, params);
          await target.element.scrollIntoView();
        } else {
          const amount = Math.max(1, Math.min(Number(params.amount) || 600, 10000));
          const sign = params.direction === 'up' || params.direction === 'left' ? -1 : 1;
          const horizontal = params.direction === 'left' || params.direction === 'right';
          await page.evaluate((dx, dy) => window.scrollBy(dx, dy), horizontal ? sign * amount : 0, horizontal ? 0 : sign * amount);
          await sleep(150);
        }
        const position = await page.evaluate(() => ({
          scrollY: window.scrollY, scrollX: window.scrollX, pageHeight: document.documentElement.scrollHeight, viewportHeight: window.innerHeight,
        }));
        return {
          success: true,
          scrollY: Math.round(position.scrollY),
          scrollX: Math.round(position.scrollX),
          pageHeight: Math.round(position.pageHeight),
          viewportHeight: Math.round(position.viewportHeight),
        };
      }

      case 'evaluate': {
        const value = await withTimeout(page.evaluate(String(params.code || '')), 15_000, 'The script took too long.');
        let text;
        try { text = JSON.stringify(value); } catch { text = String(value); }
        return { success: true, result: text === undefined ? 'undefined' : String(text).slice(0, 4000) };
      }

      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  }
}

export const headlessBrowser = new HeadlessBrowser();

// Don't leave a Chrome running after the backend exits.
process.on('exit', () => {
  try { headlessBrowser.browser?.process?.()?.kill(); } catch { /* already gone */ }
});
